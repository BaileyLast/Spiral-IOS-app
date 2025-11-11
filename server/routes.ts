import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertStoreSettingsSchema, insertDiscountTierSchema, insertVerificationSchema } from "@shared/schema";

// Extend session types
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    oauthShop?: string;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Store Settings Routes
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      res.json(settings || null);
    } catch (error) {
      console.error("Failed to fetch store settings:", error);
      res.status(500).json({ error: "Failed to fetch store settings" });
    }
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const validated = insertStoreSettingsSchema.parse(req.body);
      const settings = await storage.updateStoreSettings(validated);
      res.json(settings);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid store settings data" });
      } else {
        console.error("Failed to update store settings:", error);
        res.status(500).json({ error: "Failed to update store settings" });
      }
    }
  });

  // Discount Tier Routes
  app.get("/api/discount-tiers", async (req, res) => {
    try {
      const tiers = await storage.getDiscountTiers();
      res.json(tiers);
    } catch (error) {
      console.error("Failed to fetch discount tiers:", error);
      res.status(500).json({ error: "Failed to fetch discount tiers" });
    }
  });

  app.post("/api/discount-tiers", async (req, res) => {
    try {
      const validated = insertDiscountTierSchema.parse(req.body);
      const tier = await storage.createDiscountTier(validated);
      res.json(tier);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid discount tier data" });
      } else {
        console.error("Failed to create discount tier:", error);
        res.status(500).json({ error: "Failed to create discount tier" });
      }
    }
  });

  app.patch("/api/discount-tiers/:id", async (req, res) => {
    try {
      const validated = insertDiscountTierSchema.parse(req.body);
      const tier = await storage.updateDiscountTier(req.params.id, validated);
      res.json(tier);
    } catch (error) {
      if (error instanceof Error && error.message === "Discount tier not found") {
        res.status(404).json({ error: "Discount tier not found" });
      } else if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid discount tier data" });
      } else {
        console.error("Failed to update discount tier:", error);
        res.status(500).json({ error: "Failed to update discount tier" });
      }
    }
  });

  app.delete("/api/discount-tiers/:id", async (req, res) => {
    try {
      await storage.deleteDiscountTier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Discount tier not found") {
        res.status(404).json({ error: "Discount tier not found" });
      } else {
        console.error("Failed to delete discount tier:", error);
        res.status(500).json({ error: "Failed to delete discount tier" });
      }
    }
  });

  app.post("/api/discount-rules", async (req, res) => {
    try {
      const { minFollowers, tiers } = req.body;

      if (typeof minFollowers !== "number" || minFollowers < 0) {
        return res.status(400).json({ error: "Invalid minimum followers value" });
      }

      if (!Array.isArray(tiers)) {
        return res.status(400).json({ error: "Tiers must be an array" });
      }

      if (tiers.length > 0 && tiers[tiers.length - 1].toFollowers !== null) {
        return res.status(400).json({ error: "Final discount bracket must have no upper limit" });
      }

      if (tiers.length > 0 && tiers[0].fromFollowers < minFollowers) {
        return res.status(400).json({ error: `First bracket must start at or above the minimum followers threshold (${minFollowers})` });
      }

      const validatedTiers = tiers.map((tier) => {
        const validated = insertDiscountTierSchema.parse(tier);
        return validated;
      });

      await storage.updateMinFollowers(minFollowers);
      const savedTiers = await storage.replaceAllDiscountTiers(validatedTiers);

      res.json({
        minFollowers,
        tiers: savedTiers,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        const zodError = error as any;
        const firstIssue = zodError.issues?.[0];
        const errorMessage = firstIssue?.message || "Invalid discount rules data";
        res.status(400).json({ error: errorMessage });
      } else {
        console.error("Failed to save discount rules:", error);
        res.status(500).json({ error: "Failed to save discount rules" });
      }
    }
  });

  // Verification Routes
  app.get("/api/verifications", async (req, res) => {
    try {
      const verifications = await storage.getVerifications();
      res.json(verifications);
    } catch (error) {
      console.error("Failed to fetch verifications:", error);
      res.status(500).json({ error: "Failed to fetch verifications" });
    }
  });

  app.post("/api/verifications", async (req, res) => {
    try {
      const validated = insertVerificationSchema.parse(req.body);
      const verification = await storage.createVerification(validated);
      res.json(verification);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid verification data" });
      } else {
        console.error("Failed to create verification:", error);
        res.status(500).json({ error: "Failed to create verification" });
      }
    }
  });

  // Shopify OAuth Routes
  app.get("/shopify/install", (req, res) => {
    const shop = req.query.shop as string || 'spiral-test.myshopify.com';
    const redirectUri = process.env.SHOPIFY_REDIRECT_URI;
    const clientId = process.env.SHOPIFY_API_KEY;
    const scopes = 'read_products,read_orders,write_discounts,read_fulfillments';

    if (!redirectUri || !clientId) {
      return res.status(500).json({ error: "Shopify credentials not configured" });
    }

    // Generate CSRF protection state nonce
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    req.session.oauthShop = shop;

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    res.redirect(installUrl);
  });

  app.get("/shopify/callback", async (req, res) => {
    const { shop, code, state, hmac } = req.query;

    if (!shop || !code || !state) {
      return res.status(400).send("Missing required parameters");
    }

    // Validate state for CSRF protection
    if (state !== req.session.oauthState || shop !== req.session.oauthShop) {
      console.error("OAuth state mismatch - possible CSRF attack");
      return res.status(403).send("Invalid state parameter - CSRF validation failed");
    }

    // Clear state from session after validation
    delete req.session.oauthState;
    delete req.session.oauthShop;

    // Verify HMAC signature from Shopify (required for security)
    if (!hmac) {
      console.error("Missing HMAC parameter in callback");
      return res.status(403).send("Missing HMAC signature");
    }

    const queryParams = { ...req.query };
    delete queryParams.hmac;
    delete queryParams.signature;

    // Sort keys and build query string for HMAC validation
    const sortedParams = Object.keys(queryParams)
      .sort()
      .map(key => `${key}=${queryParams[key]}`)
      .join('&');

    const computedHmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
      .update(sortedParams)
      .digest('hex');

    // Timing-safe comparison to prevent timing attacks
    const hmacBuffer = Buffer.from(hmac as string, 'utf8');
    const computedBuffer = Buffer.from(computedHmac, 'utf8');

    if (hmacBuffer.length !== computedBuffer.length || 
        !crypto.timingSafeEqual(hmacBuffer, computedBuffer)) {
      console.error("HMAC verification failed - possible callback tampering");
      return res.status(403).send("Invalid HMAC signature");
    }

    try {
      const params = new URLSearchParams({
        client_id: process.env.SHOPIFY_API_KEY!,
        client_secret: process.env.SHOPIFY_API_SECRET!,
        code: code as string,
      });

      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        body: params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!tokenResponse.ok) {
        console.error("Failed to get Shopify access token:", await tokenResponse.text());
        return res.status(500).send("Failed to authenticate with Shopify");
      }

      const data = await tokenResponse.json() as { access_token: string };
      
      // Get existing settings to preserve non-OAuth fields
      const existingSettings = await storage.getStoreSettings();
      
      // Merge with existing settings instead of overwriting
      await storage.updateStoreSettings({
        storeName: existingSettings?.storeName || shop as string,
        instagramHandle: existingSettings?.instagramHandle || '',
        tokenActive: true,
        shopDomain: shop as string,
        accessToken: data.access_token,
      });

      console.log('Shopify access token obtained for shop:', shop);
      res.send('✅ Spiral successfully connected to your Shopify store! You can close this window and return to the dashboard.');
    } catch (error) {
      console.error("Error during Shopify OAuth:", error);
      res.status(500).send("Failed to complete Shopify authentication");
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
