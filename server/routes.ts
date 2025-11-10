import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertStoreSettingsSchema, insertDiscountTierSchema, insertVerificationSchema } from "@shared/schema";

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

    const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`;
    res.redirect(installUrl);
  });

  app.get("/shopify/callback", async (req, res) => {
    const { shop, code } = req.query;

    if (!shop || !code) {
      return res.status(400).send("Missing shop or code parameter");
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
      
      // Store the access token in the database
      await storage.updateStoreSettings({
        storeName: shop as string,
        instagramHandle: '',
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
