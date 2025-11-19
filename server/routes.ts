import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertStoreSettingsSchema, insertDiscountTierSchema, insertVerificationSchema, insertCampaignSchema } from "@shared/schema";
import { fetchShopifyProducts, fetchShopifyCollections } from "./shopify";

// Extend session types
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    oauthShop?: string;
    instagramOauthState?: string;
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

  // Shopify Product & Collection Routes
  app.post("/api/shopify/sync", async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      
      if (!settings?.shopDomain || !settings?.accessToken) {
        return res.status(400).json({ error: "Shopify not connected" });
      }

      const shopifyProducts = await fetchShopifyProducts({
        shopDomain: settings.shopDomain,
        accessToken: settings.accessToken,
      });

      const shopifyCollections = await fetchShopifyCollections({
        shopDomain: settings.shopDomain,
        accessToken: settings.accessToken,
      });

      const syncedProducts = await storage.syncProducts(
        shopifyProducts.map((p) => ({
          shopifyProductId: p.id.toString(),
          title: p.title,
          handle: p.handle,
          productType: p.product_type || null,
          vendor: p.vendor || null,
          imageUrl: p.image?.src || null,
          variants: JSON.stringify(p.variants),
        }))
      );

      const syncedCollections = await storage.syncCollections(
        shopifyCollections.map((c) => ({
          shopifyCollectionId: c.id.toString(),
          title: c.title,
          handle: c.handle,
          productCount: c.products_count || 0,
        }))
      );

      res.json({
        products: syncedProducts.length,
        collections: syncedCollections.length,
      });
    } catch (error) {
      console.error("Failed to sync Shopify data:", error);
      res.status(500).json({ error: "Failed to sync Shopify data" });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/collections", async (req, res) => {
    try {
      const collections = await storage.getCollections();
      res.json(collections);
    } catch (error) {
      console.error("Failed to fetch collections:", error);
      res.status(500).json({ error: "Failed to fetch collections" });
    }
  });

  // Campaign Routes
  app.get("/api/campaigns", async (req, res) => {
    try {
      const campaigns = await storage.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await storage.getCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      console.error("Failed to fetch campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.post("/api/campaigns", async (req, res) => {
    try {
      const validated = insertCampaignSchema.parse(req.body);
      const campaign = await storage.createCampaign(validated);
      
      if (req.body.productIds && Array.isArray(req.body.productIds)) {
        await storage.setCampaignProducts(campaign.id, req.body.productIds);
      }
      
      if (req.body.collectionIds && Array.isArray(req.body.collectionIds)) {
        await storage.setCampaignCollections(campaign.id, req.body.collectionIds);
      }
      
      res.json(campaign);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        res.status(400).json({ error: "Invalid campaign data" });
      } else {
        console.error("Failed to create campaign:", error);
        res.status(500).json({ error: "Failed to create campaign" });
      }
    }
  });

  app.patch("/api/campaigns/:id", async (req, res) => {
    try {
      const campaign = await storage.updateCampaign(req.params.id, req.body);
      
      if (req.body.productIds && Array.isArray(req.body.productIds)) {
        await storage.setCampaignProducts(campaign.id, req.body.productIds);
      }
      
      if (req.body.collectionIds && Array.isArray(req.body.collectionIds)) {
        await storage.setCampaignCollections(campaign.id, req.body.collectionIds);
      }
      
      res.json(campaign);
    } catch (error) {
      if (error instanceof Error && error.message === "Campaign not found") {
        res.status(404).json({ error: "Campaign not found" });
      } else {
        console.error("Failed to update campaign:", error);
        res.status(500).json({ error: "Failed to update campaign" });
      }
    }
  });

  app.delete("/api/campaigns/:id", async (req, res) => {
    try {
      await storage.deleteCampaign(req.params.id);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Campaign not found") {
        res.status(404).json({ error: "Campaign not found" });
      } else {
        console.error("Failed to delete campaign:", error);
        res.status(500).json({ error: "Failed to delete campaign" });
      }
    }
  });

  app.get("/api/campaigns/:id/products", async (req, res) => {
    try {
      const products = await storage.getCampaignProducts(req.params.id);
      res.json(products);
    } catch (error) {
      console.error("Failed to fetch campaign products:", error);
      res.status(500).json({ error: "Failed to fetch campaign products" });
    }
  });

  app.get("/api/campaigns/:id/collections", async (req, res) => {
    try {
      const collections = await storage.getCampaignCollections(req.params.id);
      res.json(collections);
    } catch (error) {
      console.error("Failed to fetch campaign collections:", error);
      res.status(500).json({ error: "Failed to fetch campaign collections" });
    }
  });

  // Shopify OAuth Routes
  app.get("/auth/shopify", (req, res) => {
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

  // Instagram OAuth Routes
  app.get("/auth/instagram", (req, res) => {
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
    const appId = process.env.INSTAGRAM_APP_ID;
    const scopes = 'instagram_basic,pages_show_list,pages_read_engagement';

    if (!redirectUri || !appId) {
      return res.status(500).json({ error: "Instagram credentials not configured" });
    }

    // Generate CSRF protection state nonce
    const state = crypto.randomBytes(16).toString('hex');
    req.session.instagramOauthState = state;

    const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;
    res.redirect(authUrl);
  });

  app.get("/instagram/callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      console.error("Instagram OAuth error:", error);
      return res.status(400).send(`Instagram authorization failed: ${error}`);
    }

    if (!code || !state) {
      return res.status(400).send("Missing required parameters");
    }

    // Validate state for CSRF protection
    if (state !== req.session.instagramOauthState) {
      console.error("Instagram OAuth state mismatch - possible CSRF attack");
      return res.status(403).send("Invalid state parameter - CSRF validation failed");
    }

    // Clear state from session after validation
    delete req.session.instagramOauthState;

    try {
      // Step 1: Exchange code for short-lived access token
      const tokenParams = new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID!,
        client_secret: process.env.INSTAGRAM_APP_SECRET!,
        grant_type: 'authorization_code',
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI!,
        code: code as string,
      });

      const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        body: tokenParams,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Failed to get Instagram access token:", errorText);
        return res.status(500).send("Failed to authenticate with Instagram");
      }

      const tokenData = await tokenResponse.json() as { access_token: string; user_id: number };
      const shortLivedToken = tokenData.access_token;

      // Step 2: Exchange short-lived token for long-lived token
      const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
      
      const longTokenResponse = await fetch(longTokenUrl);
      
      if (!longTokenResponse.ok) {
        const errorText = await longTokenResponse.text();
        console.error("Failed to exchange for long-lived token:", errorText);
        return res.status(500).send("Failed to get long-lived token");
      }

      const longTokenData = await longTokenResponse.json() as { access_token: string; expires_in: number };
      const longLivedToken = longTokenData.access_token;

      // Step 3: Get Instagram Business Account info from Facebook Pages
      const accountInfoUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account{id,username}&access_token=${longLivedToken}`;
      
      const accountInfoResponse = await fetch(accountInfoUrl);
      
      if (!accountInfoResponse.ok) {
        const errorText = await accountInfoResponse.text();
        console.error("Failed to get Instagram account info:", errorText);
        return res.status(500).send("Failed to retrieve Instagram account information");
      }

      const accountData = await accountInfoResponse.json() as {
        data: Array<{
          id: string;
          name: string;
          instagram_business_account?: {
            id: string;
            username: string;
          };
        }>;
      };

      // Find the first page with an Instagram Business Account
      const pageWithInstagram = accountData.data.find(page => page.instagram_business_account);
      
      if (!pageWithInstagram || !pageWithInstagram.instagram_business_account) {
        return res.status(400).send("No Instagram Business Account found. Please connect an Instagram Business Account to your Facebook Page and try again.");
      }

      const igAccount = pageWithInstagram.instagram_business_account;
      
      // Get existing settings to preserve non-Instagram fields
      const existingSettings = await storage.getStoreSettings();
      
      // Update settings with Instagram connection data
      await storage.updateStoreSettings({
        storeName: existingSettings?.storeName || "My Store",
        instagramHandle: `@${igAccount.username}`,
        tokenActive: existingSettings?.tokenActive ?? true,
        shopDomain: existingSettings?.shopDomain,
        accessToken: existingSettings?.accessToken,
        minFollowers: existingSettings?.minFollowers ?? 0,
        instagramBusinessAccountId: igAccount.id,
        instagramPageId: pageWithInstagram.id,
        instagramUsername: igAccount.username,
        instagramAccessToken: longLivedToken,
      });

      console.log('Instagram connected successfully:', igAccount.username);
      res.send('✅ Spiral successfully connected to your Instagram Business Account! You can close this window and return to the dashboard.');
    } catch (error) {
      console.error("Error during Instagram OAuth:", error);
      res.status(500).send("Failed to complete Instagram authentication");
    }
  });

  // Shopify Webhook Routes
  app.post("/webhooks/shopify/orders/create", async (req, res) => {
    try {
      const order = req.body;
      console.log("Received order webhook:", order.id);
      
      // TODO: Process order and check if Spiral discount was used
      // Store order details in database for tracking
      
      res.status(200).send("Webhook received");
    } catch (error) {
      console.error("Error processing order webhook:", error);
      res.status(500).send("Failed to process webhook");
    }
  });

  app.post("/webhooks/shopify/orders/fulfilled", async (req, res) => {
    try {
      const fulfillment = req.body;
      console.log("Received fulfillment webhook:", fulfillment.id);
      
      // TODO: Update order fulfillment status
      // Calculate post deadline (e.g., 7 days from fulfillment)
      // Send notification to customer
      
      res.status(200).send("Webhook received");
    } catch (error) {
      console.error("Error processing fulfillment webhook:", error);
      res.status(500).send("Failed to process webhook");
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
