import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertStoreSettingsSchema, insertDiscountTierSchema, insertVerificationSchema } from "@shared/schema";
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

  // Spiral Settings Routes
  app.get("/api/spiral-settings", async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      const tiers = await storage.getDiscountTiers();
      const selectedProducts = await storage.getSelectedProducts();
      const selectedCollections = await storage.getSelectedCollections();
      
      res.json({
        spiralEnabled: settings?.spiralEnabled ?? false,
        productSelectionType: settings?.productSelectionType ?? "all",
        postingWindowDays: settings?.postingWindowDays ?? 7,
        minFollowers: settings?.minFollowers ?? 0,
        discountTiers: tiers,
        selectedProducts: selectedProducts.map(p => p.shopifyProductId),
        selectedCollections: selectedCollections.map(c => c.shopifyCollectionId),
      });
    } catch (error) {
      console.error("Failed to fetch spiral settings:", error);
      res.status(500).json({ error: "Failed to fetch spiral settings" });
    }
  });

  app.post("/api/spiral-settings", async (req, res) => {
    try {
      const { 
        spiralEnabled, 
        productSelectionType, 
        postingWindowDays, 
        minFollowers,
        discountTiers: tiers,
        selectedProducts: productIds,
        selectedCollections: collectionIds,
      } = req.body;

      // Validate discount tiers
      if (tiers && Array.isArray(tiers)) {
        if (tiers.length > 0 && tiers[tiers.length - 1].toFollowers !== null) {
          return res.status(400).json({ error: "Final discount bracket must have no upper limit" });
        }

        if (tiers.length > 0 && tiers[0].fromFollowers < (minFollowers ?? 0)) {
          return res.status(400).json({ error: `First bracket must start at or above the minimum followers threshold (${minFollowers ?? 0})` });
        }

        const validatedTiers = tiers.map((tier: any) => {
          const validated = insertDiscountTierSchema.parse(tier);
          return validated;
        });

        await storage.replaceAllDiscountTiers(validatedTiers);
      }

      // Update store settings
      await storage.updateSpiralSettings({
        spiralEnabled: spiralEnabled ?? false,
        productSelectionType: productSelectionType ?? "all",
        postingWindowDays: postingWindowDays ?? 7,
        minFollowers: minFollowers ?? 0,
      });

      // Update selected products/collections
      if (Array.isArray(productIds)) {
        await storage.setSelectedProducts(productIds);
      }
      if (Array.isArray(collectionIds)) {
        await storage.setSelectedCollections(collectionIds);
      }

      // Return updated settings
      const updatedSettings = await storage.getStoreSettings();
      const updatedTiers = await storage.getDiscountTiers();
      const updatedProducts = await storage.getSelectedProducts();
      const updatedCollections = await storage.getSelectedCollections();

      res.json({
        spiralEnabled: updatedSettings?.spiralEnabled ?? false,
        productSelectionType: updatedSettings?.productSelectionType ?? "all",
        postingWindowDays: updatedSettings?.postingWindowDays ?? 7,
        minFollowers: updatedSettings?.minFollowers ?? 0,
        discountTiers: updatedTiers,
        selectedProducts: updatedProducts.map(p => p.shopifyProductId),
        selectedCollections: updatedCollections.map(c => c.shopifyCollectionId),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        const zodError = error as any;
        const firstIssue = zodError.issues?.[0];
        const errorMessage = firstIssue?.message || "Invalid spiral settings data";
        res.status(400).json({ error: errorMessage });
      } else {
        console.error("Failed to save spiral settings:", error);
        res.status(500).json({ error: "Failed to save spiral settings" });
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

  // Selected Products/Collections Routes
  app.get("/api/selected-products", async (req, res) => {
    try {
      const products = await storage.getSelectedProducts();
      res.json(products);
    } catch (error) {
      console.error("Failed to fetch selected products:", error);
      res.status(500).json({ error: "Failed to fetch selected products" });
    }
  });

  app.get("/api/selected-collections", async (req, res) => {
    try {
      const collections = await storage.getSelectedCollections();
      res.json(collections);
    } catch (error) {
      console.error("Failed to fetch selected collections:", error);
      res.status(500).json({ error: "Failed to fetch selected collections" });
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
      
      // Register webhooks for order tracking
      // Use dedicated base URL or derive from redirect URI
      const baseUrl = process.env.SHOPIFY_APP_BASE_URL || 
        process.env.SHOPIFY_REDIRECT_URI?.replace('/shopify/callback', '');
      
      if (baseUrl) {
        try {
          // Register orders/create webhook
          const ordersWebhookRes = await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': data.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              webhook: {
                topic: 'orders/create',
                address: `${baseUrl}/webhooks/shopify/orders-create`,
                format: 'json',
              }
            }),
          });
          
          if (ordersWebhookRes.ok) {
            console.log('Registered orders/create webhook');
          } else {
            const errorText = await ordersWebhookRes.text();
            console.error('Failed to register orders/create webhook:', ordersWebhookRes.status, errorText);
          }
          
          // Register fulfillments/create webhook
          const fulfillmentsWebhookRes = await fetch(`https://${shop}/admin/api/2024-01/webhooks.json`, {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': data.access_token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              webhook: {
                topic: 'fulfillments/create',
                address: `${baseUrl}/webhooks/shopify/fulfillments-create`,
                format: 'json',
              }
            }),
          });
          
          if (fulfillmentsWebhookRes.ok) {
            console.log('Registered fulfillments/create webhook');
          } else {
            const errorText = await fulfillmentsWebhookRes.text();
            console.error('Failed to register fulfillments/create webhook:', fulfillmentsWebhookRes.status, errorText);
          }
        } catch (webhookError) {
          console.error('Failed to register webhooks (non-fatal):', webhookError);
        }
      } else {
        console.warn('No base URL configured for webhook registration');
      }
      
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

      console.log('Instagram Business Account connected:', igAccount.username);
      res.send(`✅ Successfully connected Instagram account @${igAccount.username}! You can close this window and return to the dashboard.`);
    } catch (error) {
      console.error("Error during Instagram OAuth:", error);
      res.status(500).send("Failed to complete Instagram authentication");
    }
  });

  // ============================================
  // Shopify Webhook Routes for Order Tracking
  // ============================================

  // Verify Shopify webhook HMAC signature
  function verifyShopifyWebhook(req: any): boolean {
    const hmac = req.headers['x-shopify-hmac-sha256'] as string;
    const secret = process.env.SHOPIFY_API_SECRET;
    
    if (!secret) {
      console.warn('SHOPIFY_API_SECRET not configured - skipping webhook verification (DEV MODE)');
      return true;
    }
    
    if (!hmac) {
      console.error('Shopify webhook missing HMAC header');
      return false;
    }
    
    const rawBody = req.rawBody;
    if (!rawBody) {
      console.error('Raw body not available for Shopify webhook verification');
      return false;
    }
    
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');
    
    // Timing-safe comparison
    const hmacBuffer = Buffer.from(hmac, 'utf8');
    const computedBuffer = Buffer.from(computedHmac, 'utf8');
    
    if (hmacBuffer.length !== computedBuffer.length ||
        !crypto.timingSafeEqual(hmacBuffer, computedBuffer)) {
      console.error('Invalid Shopify webhook HMAC');
      return false;
    }
    
    return true;
  }

  // Webhook endpoint for Shopify order creation
  app.post("/webhooks/shopify/orders-create", async (req, res) => {
    try {
      // Verify webhook signature (403 per Shopify webhook docs)
      if (!verifyShopifyWebhook(req)) {
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }
      
      const order = req.body;
      console.log('Shopify order webhook received:', order.id, order.name);
      
      // Check if this order already exists (idempotency)
      const existingOrder = await storage.getOrderByShopifyOrderId(order.id.toString());
      if (existingOrder) {
        console.log('Order already processed:', order.id);
        return res.status(200).json({ status: 'already_processed' });
      }
      
      // Check if this order has a Spiral discount applied
      // Look for discount codes or line item properties that indicate Spiral
      const spiralDiscount = order.discount_codes?.find((dc: any) => 
        dc.code?.toLowerCase().includes('spiral') || 
        dc.code?.toLowerCase().includes('instagram')
      );
      
      // Also check for note attributes or line item properties
      const spiralNote = order.note_attributes?.find((attr: any) =>
        attr.name?.toLowerCase().includes('spiral') ||
        attr.name?.toLowerCase().includes('instagram')
      );
      
      // Extract Instagram info from note attributes or metafields
      const instagramHandleAttr = order.note_attributes?.find((attr: any) =>
        attr.name?.toLowerCase() === 'instagram_handle' ||
        attr.name?.toLowerCase() === 'instagram'
      );
      
      const instagramUserIdAttr = order.note_attributes?.find((attr: any) =>
        attr.name?.toLowerCase() === 'instagram_user_id'
      );
      
      const followerCountAttr = order.note_attributes?.find((attr: any) =>
        attr.name?.toLowerCase() === 'follower_count'
      );
      
      // Skip if no Spiral-related data found
      if (!spiralDiscount && !spiralNote && !instagramHandleAttr) {
        console.log('No Spiral discount detected for order:', order.id);
        return res.status(200).json({ status: 'not_spiral_order' });
      }
      
      // Extract Instagram fields (nullable - may be missing for orders needing remediation)
      const instagramHandle = instagramHandleAttr?.value || null;
      const instagramUserId = instagramUserIdAttr?.value || null;
      const followerCount = followerCountAttr?.value ? parseInt(followerCountAttr.value, 10) : null;
      const hasCompleteInstagramData = !!instagramHandle && !!instagramUserId;
      
      // Extract discount amount
      const discountAmount = parseFloat(order.total_discounts || '0');
      const orderTotal = parseFloat(order.total_price || '0');
      const discountPercent = orderTotal > 0 
        ? (discountAmount / (orderTotal + discountAmount)) * 100 
        : 0;
      
      // Get store settings for posting window
      const settings = await storage.getStoreSettings();
      const postingWindowDays = settings?.postingWindowDays || 7;
      
      // Calculate post deadline (from estimated delivery or order date)
      const orderDate = new Date(order.created_at);
      const postDeadline = new Date(orderDate);
      postDeadline.setDate(postDeadline.getDate() + postingWindowDays);
      
      // Determine initial verification status based on available metadata
      const initialVerificationStatus = hasCompleteInstagramData 
        ? 'pending_verification' 
        : 'metadata_missing';
      
      // Create order record (always persist, even without complete Instagram data)
      const newOrder = await storage.createOrder({
        shopifyOrderId: order.id.toString(),
        shopperEmail: order.email || order.contact_email || '',
        instagramHandle: instagramHandle,
        instagramUserId: instagramUserId,
        followerCount: followerCount,
        discountPercent: String(discountPercent.toFixed(2)),
        orderTotal: String(orderTotal.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        status: 'pending',
        postDeadline: postDeadline,
        verificationStatus: initialVerificationStatus,
      });
      
      console.log('Created Spiral order:', newOrder.id, 'for Shopify order:', order.id, 
        hasCompleteInstagramData ? '(with Instagram data)' : '(MISSING Instagram data - needs remediation)');
      
      // Create verification record only if we have complete Instagram data
      if (hasCompleteInstagramData) {
        const verification = await storage.createVerification({
          orderId: newOrder.id,
          shopperEmail: order.email || order.contact_email || '',
          instagramHandle: instagramHandle,
          instagramUserId: instagramUserId,
          followerCount: followerCount || 0,
          discountAmount: String(discountAmount.toFixed(2)),
          status: 'pending',
        });
        
        // Link verification to order
        await storage.updateOrderVerificationStatus(newOrder.id, 'pending_verification', verification.id);
        
        console.log('Created verification record:', verification.id);
      } else {
        console.warn('Order requires manual remediation to collect Instagram data:', newOrder.id);
      }
      
      res.status(200).json({ status: 'processed', orderId: newOrder.id });
    } catch (error) {
      console.error('Error processing Shopify order webhook:', error);
      res.status(500).json({ error: 'Failed to process order' });
    }
  });

  // Webhook for order fulfillment updates
  // TODO: Implement full order status and postDeadline updates when fulfillment is created
  app.post("/webhooks/shopify/fulfillments-create", async (req, res) => {
    try {
      if (!verifyShopifyWebhook(req)) {
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }
      
      const fulfillment = req.body;
      console.log('Shopify fulfillment webhook received:', fulfillment.order_id);
      
      // Find the order and update its status
      const order = await storage.getOrderByShopifyOrderId(fulfillment.order_id?.toString());
      if (order) {
        // Update order status and recalculate post deadline based on delivery
        const settings = await storage.getStoreSettings();
        const postingWindowDays = settings?.postingWindowDays || 7;
        const now = new Date();
        const postDeadline = new Date(now);
        postDeadline.setDate(postDeadline.getDate() + postingWindowDays);
        
        // Update order with fulfillment info
        // Note: Would need to add updateOrder method for full implementation
        console.log('Order fulfilled:', order.id, 'New post deadline:', postDeadline);
      }
      
      res.status(200).json({ status: 'processed' });
    } catch (error) {
      console.error('Error processing fulfillment webhook:', error);
      res.status(500).json({ error: 'Failed to process fulfillment' });
    }
  });

  // ============================================
  // Instagram/Meta Webhook Routes for Story Mentions
  // ============================================

  // Webhook verification endpoint (Meta requires this for setup)
  app.get("/webhooks/instagram", (req, res) => {
    const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'spiral_verify_token';
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Instagram webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      console.error('Instagram webhook verification failed');
      res.status(403).send('Verification failed');
    }
  });

  // Webhook endpoint for receiving story mention notifications
  app.post("/webhooks/instagram", async (req, res) => {
    try {
      // Verify webhook signature using raw body (captured in express.json verify callback)
      const signature = req.headers['x-hub-signature-256'] as string;
      const appSecret = process.env.INSTAGRAM_APP_SECRET;
      
      // If app secret is configured, signature is REQUIRED
      if (appSecret) {
        if (!signature) {
          console.error('Instagram webhook missing required signature header');
          return res.status(403).json({ error: 'Missing signature' });
        }
        
        const rawBody = (req as any).rawBody;
        
        if (!rawBody) {
          console.error('Raw body not available for signature verification');
          return res.status(500).json({ error: 'Server configuration error' });
        }
        
        const expectedSignature = 'sha256=' + crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex');
        
        // Timing-safe comparison
        const signatureBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
        
        if (signatureBuffer.length !== expectedBuffer.length || 
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          console.error('Invalid Instagram webhook signature');
          console.error('  Received:', signature.substring(0, 30) + '...');
          console.error('  Expected:', expectedSignature.substring(0, 30) + '...');
          return res.status(403).json({ error: 'Invalid signature' });
        }
        
        console.log('Instagram webhook signature verified successfully');
      } else {
        console.warn('INSTAGRAM_APP_SECRET not configured - skipping signature verification (DEV MODE)');
      }

      const body = req.body;
      console.log('Instagram webhook received:', JSON.stringify(body, null, 2));

      // Process story_mentions events
      if (body.object === 'instagram' && body.entry) {
        for (const entry of body.entry) {
          if (entry.messaging) {
            for (const event of entry.messaging) {
              // Handle story mention
              if (event.message?.attachments?.[0]?.type === 'story_mention') {
                const senderInstagramId = event.sender?.id;
                const storyMediaId = event.message.attachments[0].payload?.url;
                
                if (senderInstagramId) {
                  await handleStoryMention(senderInstagramId, storyMediaId || '');
                }
              }
            }
          }
          
          // Handle mention events (alternative webhook format)
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'mentions' || change.field === 'story_insights') {
                const mentionData = change.value;
                const mentionerId = mentionData?.from?.id || mentionData?.media_creator_id;
                const mediaId = mentionData?.media_id;
                
                if (mentionerId) {
                  await handleStoryMention(mentionerId, mediaId || '');
                }
              }
            }
          }
        }
      }

      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Error processing Instagram webhook:', error);
      // Still respond 200 to prevent Meta from retrying
      res.status(200).json({ received: true });
    }
  });

  // Helper function to handle story mentions
  async function handleStoryMention(instagramUserId: string, storyMediaId: string) {
    try {
      console.log(`Processing story mention from Instagram user: ${instagramUserId}`);
      
      // Find pending order for this Instagram user
      const order = await storage.getOrderByInstagramUserId(instagramUserId);
      
      if (!order) {
        console.log(`No pending order found for Instagram user: ${instagramUserId}`);
        return;
      }

      // Check if verification already exists for this order
      const existingVerification = await storage.getVerificationByInstagramUserId(instagramUserId, order.id);
      
      // Skip if already processed (story_detected, verified, or failed)
      if (existingVerification && existingVerification.status !== 'pending') {
        console.log(`Verification already in progress/completed for order: ${order.id}, status: ${existingVerification.status}`);
        return;
      }
      
      // Also check order verification status to prevent reprocessing
      if (order.verificationStatus !== 'pending_verification') {
        console.log(`Order ${order.id} already has verification status: ${order.verificationStatus}`);
        return;
      }

      let verificationId: string;
      
      if (existingVerification) {
        // Update existing verification
        const updated = await storage.markStoryDetected(
          existingVerification.id,
          storyMediaId,
          `https://instagram.com/stories/${instagramUserId}/${storyMediaId}`
        );
        verificationId = updated.id;
      } else {
        // Create new verification record
        const verification = await storage.createVerification({
          orderId: order.id,
          shopperEmail: order.shopperEmail,
          instagramHandle: order.instagramHandle,
          instagramUserId: order.instagramUserId,
          followerCount: order.followerCount,
          discountAmount: order.discountAmount,
          status: 'pending',
        });
        
        // Mark story detected and start 22-hour timer
        const updated = await storage.markStoryDetected(
          verification.id,
          storyMediaId,
          `https://instagram.com/stories/${instagramUserId}/${storyMediaId}`
        );
        verificationId = updated.id;
      }

      // Update order to link verification (keep order status as pending_verification until final check)
      await storage.updateOrderVerificationStatus(order.id, 'pending_verification', verificationId);
      
      console.log(`Story detected for order ${order.id}, verification ${verificationId}. 22-hour timer started.`);
    } catch (error) {
      console.error('Error handling story mention:', error);
    }
  }

  // ============================================
  // Verification Check Job (run periodically)
  // ============================================
  
  // Endpoint to trigger verification checks (call via cron/scheduler)
  app.post("/api/verification-check", async (req, res) => {
    try {
      const pendingVerifications = await storage.getPendingVerificationsForCheck();
      console.log(`Found ${pendingVerifications.length} verifications to check`);
      
      const results = {
        checked: 0,
        verified: 0,
        failed: 0,
      };

      for (const verification of pendingVerifications) {
        results.checked++;
        
        // Check if story still exists on Instagram
        const storyExists = await checkStoryExists(verification);
        
        if (storyExists) {
          await storage.markVerified(verification.id);
          await storage.updateOrderVerificationStatus(verification.orderId, 'verified');
          results.verified++;
          console.log(`Verification ${verification.id} VERIFIED - story still up after 22 hours`);
        } else {
          await storage.markFailed(verification.id, 'Story removed before 22-hour verification window');
          await storage.updateOrderVerificationStatus(verification.orderId, 'failed');
          
          // Trigger clawback
          const refundId = await triggerClawback(verification);
          if (refundId) {
            await storage.triggerClawback(verification.id, refundId);
            await storage.updateOrderVerificationStatus(verification.orderId, 'clawback_complete');
          }
          
          results.failed++;
          console.log(`Verification ${verification.id} FAILED - story was removed`);
        }
      }

      res.json({ success: true, results });
    } catch (error) {
      console.error('Error running verification checks:', error);
      res.status(500).json({ error: 'Failed to run verification checks' });
    }
  });

  // Check if Instagram story still exists
  async function checkStoryExists(verification: any): Promise<boolean> {
    try {
      const settings = await storage.getStoreSettings();
      
      if (!settings?.instagramAccessToken || !verification.storyMediaId) {
        console.log('Missing Instagram access token or story media ID');
        return false;
      }

      // Use Instagram Graph API to check if story exists
      const url = `https://graph.instagram.com/${verification.storyMediaId}?fields=id,media_type&access_token=${settings.instagramAccessToken}`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        return !!data.id;
      } else {
        // 404 or error means story no longer exists
        const errorData = await response.json().catch(() => ({}));
        console.log('Story check API response:', response.status, errorData);
        return false;
      }
    } catch (error) {
      console.error('Error checking story existence:', error);
      return false;
    }
  }

  // Trigger Shopify clawback/refund
  // NOTE: This is a placeholder implementation. Full Shopify refund integration requires:
  // 1. Storing the Shopify order ID in the orders table
  // 2. Using the Shopify Admin API to create a refund or adjustment
  // 3. Handling refund failures and retries
  async function triggerClawback(verification: any): Promise<string | null> {
    try {
      const settings = await storage.getStoreSettings();
      
      if (!settings?.shopDomain || !settings?.accessToken) {
        console.error('Shopify not connected - cannot trigger clawback');
        return null;
      }

      const discountAmount = parseFloat(verification.discountAmount || '0');
      
      if (discountAmount <= 0) {
        console.log('No discount amount to claw back');
        return null;
      }

      // Log the clawback for now - actual Shopify refund API requires order ID lookup
      console.log(`CLAWBACK TRIGGERED for verification ${verification.id}`);
      console.log(`  - Order ID: ${verification.orderId}`);
      console.log(`  - Amount: $${discountAmount.toFixed(2)}`);
      console.log(`  - Reason: Story removed before 22-hour verification`);
      
      // Generate tracking ID for the clawback record
      const clawbackId = `clawback_${verification.id}_${Date.now()}`;
      console.log(`  - Clawback ID: ${clawbackId}`);
      
      // TODO: Full Shopify refund implementation
      // 1. Look up Shopify order by orderId
      // 2. POST to /admin/api/2024-01/orders/{shopify_order_id}/refunds.json
      // 3. Handle response and store refund ID
      
      return clawbackId;
    } catch (error) {
      console.error('Error triggering clawback:', error);
      return null;
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
