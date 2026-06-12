import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import net from "node:net";
import { Resend } from "resend";
import { storage } from "./storage";
import { z } from "zod";
import { insertStoreSettingsSchema, insertDiscountTierSchema, insertVerificationSchema, isOrderOwed, OWED_VERIFICATION_ANYDELIVERY, OWED_VERIFICATION_DELIVERED_ONLY, type StoreSettings, type SpiralCustomer, type Order } from "@shared/schema";
import { fetchShopifyProducts, fetchShopifyCollections, fetchProductImages, fetchOrderLineItemImages } from "./shopify";
import { getJoinspiralToken, markJoinspiralTokenInvalid, isInstagramAuthError } from "./joinspiralToken";
import {
  getShopifyCredentials,
  getShopifyCredentialsForSettings,
} from "./shopifyCredentials";
import { uploadStoryMedia, classifyMedia, isS3Configured, sniffContentType, isGenericContentType } from "./s3";

const resend = new Resend(process.env.RESEND_API_KEY);

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Records an email send failure to the database. Logs (but never throws) if persistence itself fails,
// so the caller's email-send fallback path still completes cleanly.
async function recordEmailFailure(emailType: string, recipient: string, reason: string, errorName?: string | null): Promise<void> {
  console.error(`[EMAIL FAILURE] type=${emailType} recipient=${recipient} reason=${reason}${errorName ? ` errorName=${errorName}` : ""}`);
  try {
    await storage.recordEmailSendFailure({
      emailType,
      recipient,
      reason: reason.slice(0, 1000),
      errorName: errorName ?? null,
    });
  } catch (persistErr) {
    console.error("[EMAIL FAILURE] Could not persist failure record:", persistErr);
  }
}

function describeResendError(error: unknown): { reason: string; name: string | null } {
  if (!error) return { reason: "Unknown error", name: null };
  if (typeof error === "string") return { reason: error, name: null };
  if (error instanceof Error) return { reason: error.message || error.name || "Error", name: error.name || null };
  if (typeof error === "object") {
    const e = error as { message?: string; name?: string; statusCode?: number };
    const reason = e.message || (e.statusCode ? `Resend status ${e.statusCode}` : JSON.stringify(error));
    return { reason, name: e.name || null };
  }
  return { reason: String(error), name: null };
}

function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL || "https://joinspiral.app";
}

function unsubscribeFooterHtml(unsubscribeUrl: string): string {
  return `
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px 0;" />
    <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; text-align: center;">
      You're receiving this email because you signed up for Spiral.<br />
      Don't want these emails?
      <a href="${unsubscribeUrl}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>.
    </p>
  `;
}

async function getUnsubscribeUrlForCustomer(customerId: string): Promise<string> {
  const token = await storage.ensureUnsubscribeToken(customerId);
  return `${getAppBaseUrl()}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

function emailHeader(): string {
  const logoUrl = `${getAppBaseUrl()}/spiral-mint-logo.png`;
  return `
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="${logoUrl}" alt="Spiral" width="56" height="56" style="display: inline-block; border-radius: 14px;" />
          <div style="color: #2BAE88; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin-top: 8px;">Spiral</div>
        </div>`;
}

async function sendVerificationEmail(email: string, code: string, name?: string): Promise<boolean> {
  try {
    const result = await resend.emails.send({
      from: "Spiral <noreply@joinspiral.app>",
      to: email,
      subject: "Verify your Spiral account",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          ${emailHeader()}
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${name ? ` ${name}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Enter this code to verify your email address:</p>
          <div style="background: linear-gradient(135deg, #A8F5E0 0%, #4ECCA3 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: bold; color: #0f3d2e; letter-spacing: 8px;">${code}</span>
          </div>
          <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    if (result?.error) {
      const { reason, name: errName } = describeResendError(result.error);
      await recordEmailFailure("verification", email, reason, errName);
      return false;
    }
    return true;
  } catch (error) {
    const { reason, name: errName } = describeResendError(error);
    await recordEmailFailure("verification", email, reason, errName);
    return false;
  }
}

async function sendWelcomeEmail(customerId: string, email: string, firstName?: string | null): Promise<boolean> {
  try {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (customer?.marketingEmailOptOut) {
      console.log(`[email] Skipping welcome email for opted-out customer ${customerId}`);
      return false;
    }
    const unsubscribeUrl = await getUnsubscribeUrlForCustomer(customerId);
    const result = await resend.emails.send({
      from: "Spiral <noreply@joinspiral.app>",
      to: email,
      subject: "Welcome to Spiral",
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          ${emailHeader()}
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${firstName ? ` ${firstName}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Welcome to Spiral! Your account is verified and ready to go.</p>
          <div style="background: linear-gradient(135deg, #A8F5E0 0%, #4ECCA3 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
            <p style="color: #0f3d2e; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">One more step</p>
            <p style="color: #0f3d2e; opacity: 0.85; font-size: 14px; margin: 0;">Connect your Instagram to start earning instant discounts on every order.</p>
          </div>
          <p style="color: #374151; font-size: 16px; margin-bottom: 8px;">Here's how Spiral works:</p>
          <ol style="color: #374151; font-size: 15px; line-height: 1.6; padding-left: 20px; margin-bottom: 24px;">
            <li>Shop at any Spiral-enabled store</li>
            <li>Get an instant discount at checkout for agreeing to post a Story</li>
            <li>Post your Story after delivery — that's it</li>
          </ol>
          <p style="color: #6b7280; font-size: 14px;">Questions? Just reply to this email.</p>
          ${unsubscribeFooterHtml(unsubscribeUrl)}
        </div>
      `,
    });
    if (result?.error) {
      const { reason, name: errName } = describeResendError(result.error);
      await recordEmailFailure("welcome", email, reason, errName);
      return false;
    }
    return true;
  } catch (error) {
    const { reason, name: errName } = describeResendError(error);
    await recordEmailFailure("welcome", email, reason, errName);
    return false;
  }
}

async function sendInstagramReminderEmail(customerId: string, email: string, firstName?: string | null): Promise<boolean> {
  const appBaseUrl = getAppBaseUrl();
  const connectUrl = `${appBaseUrl}/connect-instagram`;
  try {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (customer?.marketingEmailOptOut) {
      console.log(`[email] Skipping Instagram reminder for opted-out customer ${customerId}`);
      return false;
    }
    const unsubscribeUrl = await getUnsubscribeUrlForCustomer(customerId);
    await resend.emails.send({
      from: "Spiral <noreply@joinspiral.app>",
      to: email,
      subject: "Connect Instagram to start earning discounts",
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          ${emailHeader()}
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${firstName ? ` ${firstName}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Your Spiral account is verified, but you haven't connected Instagram yet. Connect it now to unlock instant discounts at checkout on every Spiral-enabled store.</p>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${connectUrl}" style="display: inline-block; background: linear-gradient(135deg, #4ECCA3 0%, #2BAE88 100%); color: white; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 28px; border-radius: 12px;">Connect Instagram</a>
          </div>
          <p style="color: #6b7280; font-size: 14px;">It only takes a moment, and your discount tier is based on your follower count.</p>
          ${unsubscribeFooterHtml(unsubscribeUrl)}
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error("Failed to send Instagram reminder email:", error);
    return false;
  }
}

const INSTAGRAM_REMINDER_DELAY_MS = 24 * 60 * 60 * 1000;
const INSTAGRAM_REMINDER_INTERVAL_MS = 60 * 60 * 1000;

async function processInstagramReminders(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - INSTAGRAM_REMINDER_DELAY_MS);
    const customers = await storage.getCustomersNeedingInstagramReminder(cutoff);
    if (customers.length === 0) return;
    console.log(`[instagram-reminder] Sending reminders to ${customers.length} customer(s)`);
    for (const customer of customers) {
      const sent = await sendInstagramReminderEmail(customer.id, customer.email, customer.firstName);
      if (sent) {
        await storage.markInstagramReminderSent(customer.id);
      }
    }
  } catch (error) {
    console.error("[instagram-reminder] Worker error:", error);
  }
}

// Extend session types
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    oauthShop?: string;
    customerId?: string;
    pendingSignup?: {
      email: string;
      firstName?: string;
      lastName?: string;
      country?: string;
      passwordHash: string;
      verificationCode: string;
      verificationExpiry: Date;
    };
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Marketing email unsubscribe (one-click via email link)
  const renderUnsubscribePage = (opts: { title: string; heading: string; message: string }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${opts.title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; margin: 0; padding: 40px 20px; color: #111827; }
  .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 40px 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); text-align: center; }
  h1 { color: #2BAE88; font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 20px; margin: 16px 0 12px; color: #111827; }
  p { color: #4b5563; font-size: 15px; line-height: 1.6; margin: 0 0 12px; }
</style>
</head>
<body>
  <div class="card" data-testid="card-unsubscribe">
    <h1>Spiral</h1>
    <h2 data-testid="text-unsubscribe-heading">${opts.heading}</h2>
    <p data-testid="text-unsubscribe-message">${opts.message}</p>
  </div>
</body>
</html>`;

  const handleUnsubscribe = async (req: any, res: any) => {
    try {
      const token = (req.method === "POST" ? (req.body?.token ?? req.query.token) : req.query.token) as string | undefined;
      if (!token || typeof token !== "string") {
        return res.status(400).send(renderUnsubscribePage({
          title: "Unsubscribe — Spiral",
          heading: "Invalid unsubscribe link",
          message: "This unsubscribe link is missing or invalid. If you keep getting unwanted emails, reply to any Spiral email and we'll remove you manually.",
        }));
      }
      const customer = await storage.getSpiralCustomerByUnsubscribeToken(token);
      if (!customer) {
        return res.status(404).send(renderUnsubscribePage({
          title: "Unsubscribe — Spiral",
          heading: "Link not recognized",
          message: "We couldn't find an account for this unsubscribe link. It may have been replaced. Reply to any Spiral email and we'll remove you manually.",
        }));
      }
      if (!customer.marketingEmailOptOut) {
        await storage.setMarketingEmailOptOut(customer.id, true);
      }
      return res.status(200).send(renderUnsubscribePage({
        title: "Unsubscribed — Spiral",
        heading: "You've been unsubscribed",
        message: "You won't receive any more reminder or marketing emails from Spiral. You'll still get important account messages like email verification.",
      }));
    } catch (error) {
      console.error("Unsubscribe error:", error);
      return res.status(500).send(renderUnsubscribePage({
        title: "Unsubscribe — Spiral",
        heading: "Something went wrong",
        message: "We couldn't process your unsubscribe right now. Please try again in a moment, or reply to any Spiral email and we'll remove you manually.",
      }));
    }
  };

  // Shared auth gate for every internal server-to-server endpoint
  // (universal core API). Callers (merchant dashboard, future Woo/BigCommerce
  // adapters) must present the shared `x-spiral-internal-key` header that
  // matches the SPIRAL_INTERNAL_KEY secret. Apply as a route middleware:
  //   app.get("/api/internal/foo", requireInternalKey, async (req, res) => {…})
  const requireInternalKey = (req: any, res: any, next: any) => {
    const internalKey = req.header("x-spiral-internal-key");
    if (!internalKey || internalKey !== process.env.SPIRAL_INTERNAL_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.get("/api/unsubscribe", handleUnsubscribe);
  // Mailbox providers may issue POST for one-click List-Unsubscribe (RFC 8058)
  app.post("/api/unsubscribe", handleUnsubscribe);

  // Store Settings Routes
  //
  // SECURITY: Shopify `shopDomain` + `accessToken` are owned by the merchant
  // dashboard. We never accept them on writes here and we never echo
  // `accessToken` on reads — the credential helper fetches them live so the
  // customer app never holds the secret in its own row. `shopDomain` is
  // exposed read-only for display, sourced from the live dashboard reply
  // when available so the UI shows the real connection state.
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      if (!settings) return res.json(null);
      const creds = await getShopifyCredentialsForSettings(settings);
      // Strip the Shopify access token regardless of how it got into the DB.
      const { accessToken: _stripped, ...safe } = settings as any;
      res.json({
        ...safe,
        shopDomain: creds?.shopDomain ?? settings.shopDomain ?? null,
        storeName: creds?.storeName ?? settings.storeName ?? null,
        shopifyConnected: !!creds,
      });
    } catch (error) {
      console.error("Failed to fetch store settings:", error);
      res.status(500).json({ error: "Failed to fetch store settings" });
    }
  });

  // PATCH /api/settings — never accept Shopify creds. They are owned by the
  // dashboard; anything sent on these fields is silently dropped so a stale
  // client can't repopulate them.
  const patchStoreSettingsSchema = insertStoreSettingsSchema.omit({
    accessToken: true,
    shopDomain: true,
  });
  app.patch("/api/settings", async (req, res) => {
    try {
      const validated = patchStoreSettingsSchema.parse(req.body);
      const settings = await storage.updateStoreSettings(validated);
      const creds = await getShopifyCredentialsForSettings(settings);
      const { accessToken: _stripped, ...safe } = settings as any;
      res.json({
        ...safe,
        shopDomain: creds?.shopDomain ?? settings.shopDomain ?? null,
        storeName: creds?.storeName ?? settings.storeName ?? null,
        shopifyConnected: !!creds,
      });
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

  // Performance Analytics API
  app.get("/api/performance", async (req, res) => {
    try {
      const verifications = await storage.getVerifications();
      const orders = await storage.getOrders();
      
      // Safe number parsing helper
      const safeParseFloat = (val: string | null | undefined): number => {
        if (!val) return 0;
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
      };
      
      // Calculate metrics
      const totalVerifications = verifications.length;
      const verifiedVerifications = verifications.filter(v => v.status === 'verified');
      const verifiedPosts = verifiedVerifications.length;
      const pendingPosts = verifications.filter(v => v.status === 'pending' || v.status === 'story_detected').length;
      const completionRate = totalVerifications > 0 ? (verifiedPosts / totalVerifications) * 100 : 0;
      
      // Calculate discount metrics (only from verified posts - actual discounts kept)
      const totalDiscountsGiven = verifiedVerifications.reduce(
        (sum, v) => sum + safeParseFloat(v.discountAmount), 0
      );
      const avgDiscountAmount = verifiedPosts > 0 ? totalDiscountsGiven / verifiedPosts : 0;
      
      // Calculate impressions estimate using power-law curve
      // reachRate = clamp(0.06, 0.30 * (followers/500)^(-0.173))
      const calculateEstimatedReach = (followers: number) => {
        if (followers <= 0) return 0;
        const reachRate = Math.min(0.30, Math.max(0.06, 0.30 * Math.pow(followers / 500, -0.173)));
        return Math.round(followers * reachRate);
      };
      
      const totalEstimatedImpressions = verifiedVerifications
        .reduce((sum, v) => sum + calculateEstimatedReach(v.followerCount || 0), 0);
      
      // Calculate ROI (impressions per £1 spent)
      const impressionsPerPound = totalDiscountsGiven > 0 ? totalEstimatedImpressions / totalDiscountsGiven : 0;
      
      // Follower distribution for histogram (verified posts only)
      const followerBuckets = [
        { label: '0-1K', min: 0, max: 1000, count: 0 },
        { label: '1K-5K', min: 1000, max: 5000, count: 0 },
        { label: '5K-10K', min: 5000, max: 10000, count: 0 },
        { label: '10K-50K', min: 10000, max: 50000, count: 0 },
        { label: '50K-100K', min: 50000, max: 100000, count: 0 },
        { label: '100K+', min: 100000, max: Infinity, count: 0 },
      ];
      
      verifiedVerifications.forEach(v => {
        const followers = v.followerCount || 0;
        const bucket = followerBuckets.find(b => followers >= b.min && followers < b.max);
        if (bucket) bucket.count++;
      });
      
      // Average follower count (verified posts only)
      const avgFollowerCount = verifiedPosts > 0
        ? verifiedVerifications.reduce((sum, v) => sum + (v.followerCount || 0), 0) / verifiedPosts
        : 0;
      
      // Top performers (verified posts only, sorted by estimated reach)
      const topPerformers = verifiedVerifications
        .sort((a, b) => calculateEstimatedReach(b.followerCount || 0) - calculateEstimatedReach(a.followerCount || 0))
        .slice(0, 10)
        .map(v => ({
          id: v.id,
          instagramHandle: v.instagramHandle,
          followerCount: v.followerCount,
          estimatedReach: calculateEstimatedReach(v.followerCount || 0),
          discountAmount: v.discountAmount,
          verifiedAt: v.verifiedAt,
        }));
      
      // Customer insights - count customers who have ordered more than once
      const customerOrderCounts = new Map<string, number>();
      orders.forEach(o => {
        const customerId = o.spiralCustomerId || o.shopperEmail;
        customerOrderCounts.set(customerId, (customerOrderCounts.get(customerId) || 0) + 1);
      });
      const uniqueCustomers = customerOrderCounts.size;
      const repeatCustomers = Array.from(customerOrderCounts.values()).filter(count => count > 1).length;
      
      const totalOrderValue = orders.reduce((sum, o) => sum + safeParseFloat(o.orderTotal), 0);
      const avgOrderValue = orders.length > 0 ? totalOrderValue / orders.length : 0;
      
      // Verifications over time (last 30 days, grouped by day)
      const verificationsOverTime: { date: string; count: number; impressions: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        
        const dayVerifications = verifications.filter(v => {
          if (!v.createdAt) return false;
          try {
            const vDate = new Date(v.createdAt).toISOString().split('T')[0];
            return vDate === dateStr;
          } catch {
            return false;
          }
        });
        
        const dayImpressions = dayVerifications
          .filter(v => v.status === 'verified')
          .reduce((sum, v) => sum + calculateEstimatedReach(v.followerCount || 0), 0);
        
        verificationsOverTime.push({
          date: dateStr,
          count: dayVerifications.length,
          impressions: dayImpressions,
        });
      }
      
      res.json({
        summary: {
          totalVerifications,
          verifiedPosts,
          pendingPosts,
          completionRate: Math.round(completionRate * 10) / 10,
          totalDiscountsGiven: Math.round(totalDiscountsGiven * 100) / 100,
          avgDiscountAmount: Math.round(avgDiscountAmount * 100) / 100,
          totalEstimatedImpressions,
          impressionsPerPound: Math.round(impressionsPerPound),
          avgFollowerCount: Math.round(avgFollowerCount),
        },
        followerDistribution: followerBuckets,
        topPerformers,
        customerInsights: {
          uniqueCustomers,
          repeatCustomers,
          totalOrderValue: Math.round(totalOrderValue * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        },
        verificationsOverTime,
      });
    } catch (error) {
      console.error("Failed to fetch performance metrics:", error);
      res.status(500).json({ error: "Failed to fetch performance metrics" });
    }
  });

  // Shopify Product & Collection Routes
  app.post("/api/shopify/sync", async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      const creds = await getShopifyCredentialsForSettings(settings);
      if (!creds) {
        return res.status(400).json({ error: "Shopify not connected" });
      }

      const shopifyProducts = await fetchShopifyProducts({
        shopDomain: creds.shopDomain,
        accessToken: creds.accessToken,
      });

      const shopifyCollections = await fetchShopifyCollections({
        shopDomain: creds.shopDomain,
        accessToken: creds.accessToken,
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

  // Shopify OAuth Routes — RETIRED.
  // The Shopify connection is owned by the merchant dashboard. The customer
  // app reads the shopDomain + access token via the dashboard's internal API
  // (see `server/shopifyCredentials.ts`). Hitting these endpoints used to
  // launch a second install of a separate Shopify app against the same store,
  // which produced an empty store_settings row and broke product images +
  // tracking. They now return 410 Gone so any old links fail loudly.
  app.get("/auth/shopify", (_req, res) => {
    res
      .status(410)
      .type("text/plain")
      .send(
        "Shopify connection is managed in the Spiral merchant dashboard. " +
          "Connect your store there — the customer app reads it automatically.",
      );
  });

  app.get("/shopify/callback", (_req, res) => {
    res
      .status(410)
      .type("text/plain")
      .send(
        "Shopify connection is managed in the Spiral merchant dashboard. " +
          "Connect your store there — the customer app reads it automatically.",
      );
  });

  // [Removed] Merchant /auth/instagram + /instagram/callback flow.
  // These were built on Meta's Instagram Basic Display API, which Meta shut
  // down at the end of 2024. The endpoints now return "Invalid platform app"
  // and can never work again.
  // [Removed] Shopper-side OAuth at /api/customer/instagram/auth +
  // /api/customer/instagram/callback. It was dead code — shoppers connect
  // Instagram only through the DM spiral-code flow (DM a code to @joinspiral),
  // which sets their IG identity. Nothing in the app ever linked to the OAuth
  // routes.
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
      
      // Check if this order already exists (idempotency).
      //
      // Widget shoppers: `confirm-discount` from the merchant dashboard
      // typically arrives BEFORE this webhook with the enriched Spiral data
      // (customer ID, Instagram handle, follower count, discount tier). In
      // that case we MUST NOT overwrite those fields with the raw Shopify
      // payload. But we CAN backfill anything the dashboard didn't send —
      // shipping, line items with product images, store logo, merchant IG
      // handle — using a fill-missing-fields-only patch.
      const existingOrder = await storage.getOrderByShopifyOrderId(order.id.toString());
      if (existingOrder) {
        const discountAmt = parseFloat(order.total_discounts || '0');
        const subtotalAfterDisc = parseFloat(order.subtotal_price || '0');
        const orderTotalCalc = subtotalAfterDisc + discountAmt;
        const shippingRawExisting = parseFloat(
          order.total_shipping_price_set?.shop_money?.amount ??
          order.total_shipping_price ??
          '0'
        );
        const shippingForBackfill = Number.isFinite(shippingRawExisting) && shippingRawExisting > 0
          ? shippingRawExisting.toFixed(2)
          : null;
        const settingsForBackfill = await storage.getStoreSettings();
        const credsForBackfill = await getShopifyCredentialsForSettings(settingsForBackfill);
        const shopDomainHeader =
          (req.headers['x-shopify-shop-domain'] as string | undefined) ||
          credsForBackfill?.shopDomain ||
          settingsForBackfill?.shopDomain ||
          '';
        const storeLogoForBackfill = credsForBackfill?.storeLogoUrl ?? null;
        const merchantHandleForBackfill = shopDomainHeader
          ? await getBrandHandleForShopDomain(shopDomainHeader)
          : null;
        await storage.patchOrderIfNull(existingOrder.id, {
          shippingAmount: shippingForBackfill,
          orderTotal: orderTotalCalc > 0 ? orderTotalCalc.toFixed(2) : null,
          discountAmount: discountAmt > 0 ? discountAmt.toFixed(2) : null,
          storeLogo: storeLogoForBackfill,
          merchantInstagramHandle: merchantHandleForBackfill,
          shopperEmail: order.email || order.contact_email || null,
        } as any);
        console.log('Order already processed (backfilled missing fields only):', order.id);
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
      
      // Extract Spiral customer ID (from checkout extension)
      const spiralCustomerIdAttr = order.note_attributes?.find((attr: any) =>
        attr.name?.toLowerCase() === 'spiral_customer_id'
      );
      
      // Skip if no Spiral-related data found
      if (!spiralDiscount && !spiralNote && !instagramHandleAttr && !spiralCustomerIdAttr) {
        console.log('No Spiral discount detected for order:', order.id);
        return res.status(200).json({ status: 'not_spiral_order' });
      }
      
      // Extract Spiral customer ID if available
      const spiralCustomerId = spiralCustomerIdAttr?.value || null;
      
      // Extract Instagram fields (nullable - may be missing for orders needing remediation)
      let instagramHandle = instagramHandleAttr?.value || null;
      let instagramUserId = instagramUserIdAttr?.value || null;
      let instagramGlobalUserId: string | null = null;
      let followerCount = followerCountAttr?.value ? parseInt(followerCountAttr.value, 10) : null;
      
      // If we have a Spiral customer ID, fetch their data
      if (spiralCustomerId) {
        const customer = await storage.getSpiralCustomerById(spiralCustomerId);
        if (customer) {
          instagramHandle = instagramHandle || customer.instagramHandle;
          instagramUserId = instagramUserId || customer.instagramUserId;
          instagramGlobalUserId = customer.instagramGlobalUserId ?? null;
          followerCount = followerCount ?? customer.followerCount;
        }
      }
      
      const hasCompleteInstagramData = !!instagramHandle && !!instagramUserId;
      
      // Extract discount + shipping + per-item subtotal from Shopify payload.
      //
      // Shopify field semantics:
      //   order.subtotal_price = items only, AFTER item discounts, BEFORE shipping/tax/tips
      //   order.total_discounts = sum of all order/line discounts
      //   order.total_shipping_price_set.shop_money.amount = shipping charged
      //   order.total_price = final amount paid (post-discount, incl shipping/tax)
      //
      // We store `orderTotal` as the PRE-discount item subtotal so the Summary
      // card math is honest: Subtotal − Discount + Shipping = Total Paid.
      // We compute discountPercent against the items-only base (NOT the total
      // that includes shipping) so a 15% tier displays as 15%, not 8% just
      // because shipping inflated the denominator.
      const discountAmount = parseFloat(order.total_discounts || '0');
      const subtotalAfterDiscount = parseFloat(order.subtotal_price || '0');
      const orderTotal = subtotalAfterDiscount + discountAmount;
      const shippingRaw = parseFloat(
        order.total_shipping_price_set?.shop_money?.amount ??
        order.total_shipping_price ??
        '0'
      );
      const shippingAmount = Number.isFinite(shippingRaw) && shippingRaw > 0 ? shippingRaw : null;
      // Spiral tiers are 5% blocks (10/15/20/…/100). Shopify rounds the
      // discount $ to cents, so back-calculating the % drifts slightly under
      // the tier (e.g. 10% on $16.99 → $1.69 → reads as 9.95%). Snap to the
      // nearest 5% so the displayed tier matches what the merchant configured.
      const rawDiscountPercent = orderTotal > 0
        ? (discountAmount / orderTotal) * 100
        : 0;
      const discountPercent = Math.round(rawDiscountPercent / 5) * 5;
      
      const settings = await storage.getStoreSettings();

      const initialVerificationStatus = 'pending';
      
      // Build line items summary for customer display.
      // We also enrich each item with its product image by calling the Shopify
      // Admin API (read_products scope, already granted at install) so the
      // shopper sees real product photos on the Orders + OrderDetail screens.
      // Failures are non-fatal — items just fall back to the placeholder icon.
      // Cap kept high enough to cover any realistic basket while bounding the
      // stored JSON. (Was 5 — too low; large baskets silently lost items.)
      const rawLineItems = (order.line_items || []).slice(0, 50);
      const productIds = rawLineItems
        .map((item: any) => item.product_id)
        .filter((id: any) => id != null);

      // Per-item Spiral discount. Shopify allocates the order discount across
      // line items in `discount_allocations[].amount`; summing them gives the
      // dollars knocked off that item (0 = not part of the discount).
      const lineItemDiscount = (item: any): number => {
        const allocations = Array.isArray(item?.discount_allocations)
          ? item.discount_allocations
          : [];
        const total = allocations.reduce((sum: number, a: any) => {
          const n = parseFloat(String(a?.amount ?? ''));
          return Number.isFinite(n) ? sum + n : sum;
        }, 0);
        return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0;
      };

      let productImageMap: Record<string, string> = {};
      const creds = await getShopifyCredentialsForSettings(settings);
      const webhookShopDomainForImages =
        (req.headers['x-shopify-shop-domain'] as string | undefined) ||
        creds?.shopDomain ||
        settings?.shopDomain ||
        '';
      if (productIds.length > 0 && webhookShopDomainForImages && creds?.accessToken) {
        productImageMap = await fetchProductImages({
          shopDomain: webhookShopDomainForImages,
          accessToken: creds.accessToken,
          productIds,
        });
      }

      const lineItemsSummary = JSON.stringify(
        rawLineItems.map((item: any) => ({
          title: item.title,
          variantTitle: item.variant_title || null,
          quantity: item.quantity,
          imageUrl: item.product_id ? productImageMap[String(item.product_id)] || null : null,
          discountedAmount: lineItemDiscount(item),
        }))
      );

      // Prefer the per-request `X-Shopify-Shop-Domain` header (set by Shopify
      // on every webhook) over the global single-tenant `store_settings` so
      // we stay correct once this app is wired to multiple merchants.
      const webhookShopDomain =
        (req.headers['x-shopify-shop-domain'] as string | undefined) ||
        creds?.shopDomain ||
        settings?.shopDomain ||
        '';
      const storeLogo = creds?.storeLogoUrl ?? null;

      // Snapshot the merchant's Instagram handle onto the order at creation
      // time so the shopper always sees the exact handle to tag — no read-time
      // lookups, no fuzzy storeName matching, and the order keeps its original
      // handle even if the merchant later changes it.
      const merchantInstagramHandle = await getBrandHandleForShopDomain(webhookShopDomain);

      // Create order record (always persist, even without complete Instagram data)
      const newOrder = await storage.createOrder({
        shopifyOrderId: order.id.toString(),
        shopperEmail: order.email || order.contact_email || '',
        spiralCustomerId: spiralCustomerId,
        instagramHandle: instagramHandle,
        instagramUserId: instagramUserId,
        instagramGlobalUserId: instagramGlobalUserId,
        followerCount: followerCount,
        discountPercent: String(discountPercent.toFixed(2)),
        orderTotal: String(orderTotal.toFixed(2)),
        shippingAmount: shippingAmount !== null ? shippingAmount.toFixed(2) : null,
        discountAmount: String(discountAmount.toFixed(2)),
        status: 'pending',
        verificationStatus: initialVerificationStatus,
        storeName: settings?.storeName || null,
        storeLogo: storeLogo,
        merchantInstagramHandle,
        lineItems: lineItemsSummary,
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
        await storage.updateOrderVerificationStatus(newOrder.id, 'pending', verification.id);
        
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
  // Marks the order as fulfilled and records the fulfillment timestamp.
  app.post("/webhooks/shopify/fulfillments-create", async (req, res) => {
    try {
      if (!verifyShopifyWebhook(req)) {
        return res.status(403).json({ error: 'Invalid webhook signature' });
      }
      
      const fulfillment = req.body;
      console.log('Shopify fulfillment webhook received:', fulfillment.order_id);
      
      // Find the order and update its status
      const order = await storage.getOrderByShopifyOrderId(fulfillment.order_id?.toString());
      if (!order) {
        console.log('No Spiral order found for Shopify order:', fulfillment.order_id);
        return res.status(200).json({ status: 'not_spiral_order' });
      }
      
      // Use fulfillment created date as the "shipped" date
      const fulfilledAt = new Date(fulfillment.created_at || new Date());

      // Guard: a late/retried fulfillments/create must NOT downgrade an order
      // that has already advanced to delivered. Without this, a delivered order
      // could be flipped back to "fulfilled", suppressing the Story prompt.
      if (order.status === 'delivered') {
        console.log(`[shopify] fulfillments/create ignored — order ${order.id} already delivered`);
        return res.status(200).json({ status: 'already_delivered', orderId: order.id });
      }

      // Update order with fulfillment info
      const updatedOrder = await storage.updateOrderFulfillment(order.id, fulfilledAt);

      console.log(`Order ${order.id} fulfilled at: ${fulfilledAt.toISOString()}`);

      res.status(200).json({
        status: 'processed',
        orderId: updatedOrder.id,
      });
    } catch (error) {
      console.error('Error processing fulfillment webhook:', error);
      res.status(500).json({ error: 'Failed to process fulfillment' });
    }
  });

  // Webhook for Shopify fulfillment_events/create — fires for in-transit, out-for-delivery,
  // delivered, etc. We act on `delivered` to mark the order delivered, soft-ban the customer
  // (only if Story still owed), and fire the one-time delivery reminder push.
  app.post("/webhooks/shopify/fulfillment-events-create", async (req, res) => {
    try {
      if (!verifyShopifyWebhook(req)) {
        console.warn('[shopify] fulfillment_events/create webhook signature INVALID — rejecting');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      // Acknowledge immediately to avoid Shopify retries while we do the work.
      res.status(200).json({ received: true });

      const event = req.body?.fulfillment_event ?? req.body;
      const status = (event?.status || '').toLowerCase();
      const shopifyOrderId = event?.order_id?.toString();
      console.log(`[shopify] fulfillment_events/create received — order=${shopifyOrderId} status=${status}`);
      if (!shopifyOrderId || !status) return;

      const order = await storage.getOrderByShopifyOrderId(shopifyOrderId);
      if (!order) {
        console.log(`[shopify] No Spiral order for Shopify order ${shopifyOrderId}`);
        return;
      }

      // Mirror the raw status onto the order so the app shows honest progress
      // (in_transit, out_for_delivery, ready_for_pickup, etc.) regardless of
      // how this merchant ships.
      await storage.updateOrderTrackingStatus(order.id, status);

      // Only `delivered` triggers the Story flow. `ready_for_pickup` is handled
      // by either (a) a later `delivered` event from the carrier, (b) the
      // shopper tapping "I've collected it" in the app, or (c) the 24h
      // background fallback in runDeliveryFallbackJob.
      if (status === 'delivered') {
        await transitionOrderToDelivered(order.id);
      }
    } catch (error) {
      console.error('Error processing fulfillment_events webhook:', error);
    }
  });

  // Webhook for Shopify fulfillments/update — second source of truth for
  // `delivered`. Some accounts surface delivery via `shipment_status` on a
  // fulfillment update rather than as a fulfillment_event. `transitionOrderToDelivered`
  // is idempotent so duplicate signals are safe.
  app.post("/webhooks/shopify/fulfillments-update", async (req, res) => {
    try {
      if (!verifyShopifyWebhook(req)) {
        console.warn('[shopify] fulfillments/update webhook signature INVALID — rejecting');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      res.status(200).json({ received: true });

      const fulfillment = req.body;
      const shopifyOrderId = fulfillment?.order_id?.toString();
      const shipmentStatus = (fulfillment?.shipment_status || '').toLowerCase();
      console.log(`[shopify] fulfillments/update received — order=${shopifyOrderId} shipment_status=${shipmentStatus}`);
      if (!shopifyOrderId) return;

      const order = await storage.getOrderByShopifyOrderId(shopifyOrderId);
      if (!order) return;

      if (shipmentStatus) {
        await storage.updateOrderTrackingStatus(order.id, shipmentStatus);
      }
      if (shipmentStatus === 'delivered') {
        await transitionOrderToDelivered(order.id);
      }
    } catch (error) {
      console.error('Error processing fulfillments/update webhook:', error);
    }
  });

  // Release a shopper from any Story debt tied to an order that has just been
  // undone (cancelled or fully refunded). Sets the terminal order status — which
  // drops the order out of all owed accounting via isOrderOwed — then re-runs the
  // self-healing auto-unban (which also cascades to IG-sibling accounts). We do
  // NOT touch the verification record: if a Story was already posted/verified it
  // stays that way — a refund never reverses an already-earned Story or discount.
  // Idempotent.
  async function releaseOrderDebt(orderId: string, terminalStatus: "cancelled" | "refunded"): Promise<void> {
    const order = await storage.getOrderById(orderId);
    if (!order) return;
    if (order.status === terminalStatus) {
      console.log(`[refund] Order ${orderId} already ${terminalStatus} — idempotent no-op`);
      return;
    }
    await storage.setOrderStatus(orderId, terminalStatus);
    console.log(`[refund] Order ${orderId} → ${terminalStatus} (Story debt cleared)`);
    if (order.spiralCustomerId) {
      await maybeAutoUnbanCustomer(order.spiralCustomerId);
    }
  }

  // Webhook for Shopify orders/cancelled — the whole order is voided, so the
  // shopper never keeps the goods and owes no Story. Release unconditionally.
  app.post("/webhooks/shopify/orders-cancelled", async (req, res) => {
    try {
      if (!verifyShopifyWebhook(req)) {
        console.warn('[shopify] orders/cancelled webhook signature INVALID — rejecting');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      res.status(200).json({ received: true });

      const shopifyOrderId = req.body?.id?.toString();
      console.log(`[shopify] orders/cancelled received — order=${shopifyOrderId}`);
      if (!shopifyOrderId) return;

      const order = await storage.getOrderByShopifyOrderId(shopifyOrderId);
      if (!order) {
        console.log(`[shopify] No Spiral order for cancelled Shopify order ${shopifyOrderId}`);
        return;
      }
      await releaseOrderDebt(order.id, "cancelled");
    } catch (error) {
      console.error('Error processing orders/cancelled webhook:', error);
    }
  });

  // Webhook for Shopify refunds/create — a refund was issued. The shopper still
  // owes a Story as long as they are KEEPING any line item that received a Spiral
  // discount; once every Spiral-discounted item has been refunded (whether via a
  // single full refund or piecemeal partial refunds) there is nothing left to
  // earn a discount on, so we release. Shopify's refund payload doesn't carry the
  // full picture, so we read the live order back from the Admin API: its line
  // items (with per-item discount_allocations) plus all its refunds (with the
  // refunded quantity per line item). We then check, per discounted item, whether
  // any units are still kept. A fully-refunded order (financial_status ===
  // 'refunded') is just the case where everything — including discounted items —
  // is returned. If we can't fetch the order or can't see the discount picture,
  // we conservatively HOLD (no release) so debt can't be dodged.
  app.post("/webhooks/shopify/refunds-create", async (req, res) => {
    try {
      if (!verifyShopifyWebhook(req)) {
        console.warn('[shopify] refunds/create webhook signature INVALID — rejecting');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      res.status(200).json({ received: true });

      const shopifyOrderId = req.body?.order_id?.toString();
      console.log(`[shopify] refunds/create received — order=${shopifyOrderId}`);
      if (!shopifyOrderId) return;

      const order = await storage.getOrderByShopifyOrderId(shopifyOrderId);
      if (!order) {
        console.log(`[shopify] No Spiral order for refunded Shopify order ${shopifyOrderId}`);
        return;
      }

      const settings = await storage.getStoreSettings();
      const creds = await getShopifyCredentialsForSettings(settings);
      if (!creds?.shopDomain || !creds?.accessToken) {
        console.warn(`[refund] Cannot verify refund extent for order ${order.id} — no Shopify credentials, holding debt`);
        return;
      }

      let liveOrder: any = null;
      try {
        const r = await fetch(
          `https://${creds.shopDomain}/admin/api/2024-01/orders/${shopifyOrderId}.json?fields=id,financial_status,line_items,refunds`,
          { headers: { 'X-Shopify-Access-Token': creds.accessToken } },
        );
        if (r.ok) {
          const data = await r.json();
          liveOrder = data?.order ?? null;
        } else {
          console.warn(`[refund] Shopify order fetch for ${shopifyOrderId} returned ${r.status} — holding debt`);
        }
      } catch (e) {
        console.warn(`[refund] Shopify order fetch for ${shopifyOrderId} failed — holding debt:`, e);
      }

      if (!liveOrder) return; // couldn't fetch — conservative hold

      const financialStatus = (liveOrder.financial_status || '').toLowerCase() || null;

      // Fast path: Shopify itself reports the whole order as refunded.
      if (financialStatus === 'refunded') {
        await releaseOrderDebt(order.id, "refunded");
        return;
      }

      const lineItems = Array.isArray(liveOrder.line_items) ? liveOrder.line_items : [];
      const refunds = Array.isArray(liveOrder.refunds) ? liveOrder.refunds : [];

      if (lineItems.length === 0) {
        console.warn(`[refund] Order ${order.id} — Admin payload has no line items, can't assess discounted items; holding debt`);
        return;
      }

      // Total refunded quantity per line item id, summed across every refund.
      const refundedQtyByLineItem = new Map<string, number>();
      for (const ref of refunds) {
        const rlis = Array.isArray(ref?.refund_line_items) ? ref.refund_line_items : [];
        for (const rli of rlis) {
          const lid = String(rli?.line_item_id ?? rli?.line_item?.id ?? '');
          if (!lid) continue;
          const qty = Number(rli?.quantity ?? 0);
          if (!Number.isFinite(qty) || qty <= 0) continue;
          refundedQtyByLineItem.set(lid, (refundedQtyByLineItem.get(lid) ?? 0) + qty);
        }
      }

      // Dollars knocked off an item by Spiral's discount (0 = not discounted).
      const discountAllocated = (item: any): number => {
        const allocs = Array.isArray(item?.discount_allocations) ? item.discount_allocations : [];
        return allocs.reduce((sum: number, a: any) => {
          const n = parseFloat(String(a?.amount ?? ''));
          return Number.isFinite(n) ? sum + n : sum;
        }, 0);
      };

      let hasAnyDiscountedItem = false;
      let keepsDiscountedItem = false;
      for (const item of lineItems) {
        if (discountAllocated(item) <= 0) continue; // not a Spiral-discounted item
        hasAnyDiscountedItem = true;
        const lid = String(item?.id ?? '');
        const originalQty = Number(item?.quantity ?? 0);
        const refundedQty = refundedQtyByLineItem.get(lid) ?? 0;
        if (originalQty - refundedQty > 0) {
          keepsDiscountedItem = true;
          break;
        }
      }

      if (!hasAnyDiscountedItem) {
        console.warn(`[refund] Order ${order.id} — no per-item discount data in Admin payload, can't tell which items were discounted; holding debt`);
        return;
      }

      if (keepsDiscountedItem) {
        console.log(`[refund] Order ${order.id} partial refund — shopper still keeps a discounted item; Story debt retained`);
      } else {
        console.log(`[refund] Order ${order.id} — all discounted items refunded; releasing Story debt`);
        await releaseOrderDebt(order.id, "refunded");
      }
    } catch (error) {
      console.error('Error processing refunds/create webhook:', error);
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
      // Verify webhook signature using raw body (captured in express.json verify callback).
      // Meta signs the payload with the secret of the app that owns the webhook
      // subscription. The signing secret can be EITHER the top-level Spiral app
      // secret (FACEBOOK_APP_SECRET) or the nested Instagram app secret
      // (INSTAGRAM_APP_SECRET) depending on how the Instagram product webhook is
      // wired — so we accept a match against either and log which one matched
      // (label only, never the value). If neither matches, the configured prod
      // secret value(s) are stale and must be re-copied from the Meta dashboard.
      const signature = req.headers['x-hub-signature-256'] as string;
      const candidateSecrets: { label: string; value: string }[] = [];
      if (process.env.FACEBOOK_APP_SECRET) {
        candidateSecrets.push({ label: 'FACEBOOK_APP_SECRET', value: process.env.FACEBOOK_APP_SECRET });
      }
      if (process.env.INSTAGRAM_APP_SECRET) {
        candidateSecrets.push({ label: 'INSTAGRAM_APP_SECRET', value: process.env.INSTAGRAM_APP_SECRET });
      }

      // If an app secret is configured, signature is REQUIRED
      if (candidateSecrets.length > 0) {
        if (!signature) {
          console.error('Instagram webhook missing required signature header');
          return res.status(403).json({ error: 'Missing signature' });
        }

        const rawBody = (req as any).rawBody;

        if (!rawBody) {
          console.error('Raw body not available for signature verification');
          return res.status(500).json({ error: 'Server configuration error' });
        }

        const signatureBuffer = Buffer.from(signature, 'utf8');
        let matchedLabel: string | null = null;
        for (const secret of candidateSecrets) {
          const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret.value)
            .update(rawBody)
            .digest('hex');
          const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
          if (signatureBuffer.length === expectedBuffer.length &&
              crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            matchedLabel = secret.label;
            break;
          }
        }

        if (!matchedLabel) {
          console.error(`Invalid Instagram webhook signature (tried ${candidateSecrets.map(s => s.label).join(', ')} — none matched; prod secret value(s) likely stale)`);
          return res.status(403).json({ error: 'Invalid signature' });
        }

        console.log(`Instagram webhook signature verified using ${matchedLabel}`);
      } else {
        console.warn('FACEBOOK_APP_SECRET/INSTAGRAM_APP_SECRET not configured - skipping signature verification (DEV MODE)');
      }

      const body = req.body;
      console.log('Instagram webhook received:', JSON.stringify(body, null, 2));

      // Process story_mention events via merchant's Instagram messaging webhook
      if (body.object === 'instagram' && body.entry) {
        for (const entry of body.entry) {
          const recipientId = entry.id;
          console.log(`[STORY-DIAG] ig-webhook entry.id=${entry.id} entryKeys=${Object.keys(entry).join('|')} hasMessaging=${!!entry.messaging} hasChanges=${!!entry.changes}`);
          if (entry.changes) {
            try { console.log(`[STORY-DIAG] ig-webhook changes=${JSON.stringify(entry.changes).slice(0, 600)}`); } catch {}
          }
          if (entry.messaging) {
            for (const event of entry.messaging) {
              try {
                const attTypes = Array.isArray(event.message?.attachments)
                  ? event.message.attachments.map((a: any) => a?.type).join(',')
                  : '(none)';
                console.log(`[STORY-DIAG] ig-webhook event sender=${event.sender?.id} recipient=${event.recipient?.id} eventKeys=${Object.keys(event).join('|')} msgKeys=${event.message ? Object.keys(event.message).join('|') : '-'} attTypes=${attTypes}`);
                if (Array.isArray(event.message?.attachments)) {
                  for (const a of event.message.attachments) {
                    console.log(`[STORY-DIAG] ig-webhook attachment type=${a?.type} json=${JSON.stringify(a).slice(0, 400)}`);
                  }
                }
              } catch (diagErr) {
                console.log('[STORY-DIAG] ig-webhook log failed:', String(diagErr));
              }
              if (event.message?.attachments) {
                for (const attachment of event.message.attachments) {
                  if (attachment.type === 'story_mention') {
                    const senderScopedId = event.sender?.id;
                    const storyUrl = attachment.payload?.url || '';
                    
                    console.log(`Story mention received on /webhooks/instagram from scoped ID ${senderScopedId} on merchant IG ${recipientId}`);
                    
                    if (senderScopedId) {
                      await handleStoryMentionWebhook(recipientId, senderScopedId, storyUrl);
                    }
                  }
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
      res.status(200).json({ received: true });
    }
  });

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
        console.log(`Pending verification ${verification.id} for order ${verification.orderId} - awaiting Story mention webhook`);
      }

      res.json({ success: true, results, message: 'Verification is automated via Story mention webhooks' });
    } catch (error) {
      console.error('Error running verification checks:', error);
      res.status(500).json({ error: 'Failed to run verification checks' });
    }
  });

  // ============================================
  // Checkout API (for Shopify Checkout Extension)
  // ============================================
  console.log("[Spiral] Registering checkout API endpoints...");

  // CORS preflight for all checkout endpoints (merchant plugin calls cross-origin)
  app.options("/api/checkout/*", (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });

  // CORS middleware for all checkout endpoints
  app.use("/api/checkout", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });

  // Health check endpoint for merchant plugin connectivity test
  app.get("/api/checkout/config", (req, res) => {
    res.json({ status: "ok", version: "1.0" });
  });

  // Authenticate Spiral customer and return their profile data
  // Called by merchant plugin when shopper logs in at checkout
  app.post("/api/checkout/authenticate", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ authenticated: false, error: 'Email and password required' });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const customer = await storage.getSpiralCustomerByEmail(normalizedEmail);
      
      if (!customer) {
        return res.status(401).json({ authenticated: false, error: 'Invalid email or password' });
      }

      // Verify password with salt (same logic as customer login)
      const [storedHash, salt] = customer.passwordHash.split(":");
      let isValid = false;

      if (salt) {
        const passwordHash = crypto.createHash("sha256").update(salt + password).digest("hex");
        isValid = storedHash === passwordHash;
      } else {
        const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
        isValid = customer.passwordHash === passwordHash;
      }
      
      if (!isValid) {
        return res.status(401).json({ authenticated: false, error: 'Invalid email or password' });
      }
      
      if (!customer.isActive) {
        return res.status(403).json({ authenticated: false, error: 'Account is deactivated' });
      }
      
      // Update last login
      await storage.updateSpiralCustomerLastLogin(customer.id);

      // Refresh the Instagram profile picture if stale/missing so the widget
      // gets a live, publicly accessible HTTPS image (IG CDN URLs are
      // ephemeral). Best-effort: same pattern as /api/customer/me — never let a
      // refresh failure block login.
      let profilePictureUrl = customer.instagramProfilePicture ?? null;
      if (customer.instagramUserId && process.env.RAPIDAPI_KEY) {
        const lastUpdated = customer.followerCountUpdatedAt ? new Date(customer.followerCountUpdatedAt).getTime() : 0;
        const oneDayMs = 24 * 60 * 60 * 1000;
        const isStale = Date.now() - lastUpdated > oneDayMs;

        if (isStale || !profilePictureUrl) {
          try {
            const igData = await fetchInstagramDataByUserId(customer.instagramUserId, process.env.RAPIDAPI_KEY);
            const refreshedHandle = igData.username || customer.instagramHandle;
            const refreshedFollowerCount = igData.followerCount != null ? igData.followerCount : (customer.followerCount ?? 0);
            if (igData.profilePicture) profilePictureUrl = igData.profilePicture;
            await storage.updateSpiralCustomerInstagram(customer.id, {
              instagramHandle: refreshedHandle,
              instagramUserId: customer.instagramUserId,
              instagramAccessToken: null,
              instagramTokenExpiry: null,
              instagramProfilePicture: profilePictureUrl,
              instagramAccountType: customer.instagramAccountType || "UNKNOWN",
              followerCount: refreshedFollowerCount,
            });
          } catch (igError) {
            console.error("Failed to refresh Instagram profile picture during checkout authenticate:", igError);
          }
        }
      }

      // Evaluate soft-ban here so the widget gets the on-hold signal in the
      // SAME response as the profile — no second round-trip needed before it
      // can render the "Your discount is on hold" screen. Login itself still
      // succeeds (authenticated: true); the widget decides whether to render
      // the discount panel or the on-hold panel based on `softBanned`.
      const ban = await evaluateSoftBanForCheckout(customer.id);

      res.json({
        authenticated: true,
        customerId: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        instagramHandle: customer.instagramHandle ? `@${customer.instagramHandle}` : null,
        instagramUserId: customer.instagramUserId,
        instagramGlobalUserId: customer.instagramGlobalUserId ?? null,
        followerCount: customer.followerCount || 0,
        // Shopper's Instagram profile photo for the checkout widget avatar.
        // Publicly accessible HTTPS image when available, else null (never
        // undefined). Refreshed above to avoid stale/expired IG CDN links.
        profilePictureUrl,
        // Soft-ban surface (Task #62). When softBanned is true the widget
        // should skip /api/checkout/calculate-discount entirely and render
        // the on-hold screen using softBanMessage, with a "Check your Spiral
        // app" CTA deep-linking to spiral://orders/{owedOrderId}.
        softBanned: ban.softBanned,
        softBannedReason: ban.softBannedReason,
        pendingVerificationCount: ban.pendingVerificationCount,
        brandName: ban.brandName,
        owedOrderId: ban.owedOrderId,
        softBanMessage: ban.message,
      });
    } catch (error) {
      console.error('Checkout authentication error:', error);
      res.status(500).json({ authenticated: false, error: 'Authentication failed' });
    }
  });

  // Calculate discount for a customer based on merchant's tiers
  // Called by checkout extension after customer authenticates
  app.post("/api/checkout/calculate-discount", async (req, res) => {
    try {
      const { customerId, shopDomain } = req.body;
      
      if (!customerId) {
        return res.status(400).json({ error: 'Customer ID required' });
      }
      
      // Get customer
      const customer = await storage.getSpiralCustomerById(customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Get store settings and discount tiers
      const settings = await storage.getStoreSettings();
      const tiers = await storage.getDiscountTiers();
      
      // Check if Spiral is enabled for this store
      if (!settings?.spiralEnabled) {
        return res.json({
          eligible: false,
          reason: 'Spiral discounts not enabled for this store',
        });
      }
      
      // Soft-ban gate: pay-now safety net. The same evaluator is also called at
      // /api/checkout/authenticate so the widget normally never reaches this
      // path for a banned account. We keep it here for the edge case where
      // debt was incurred between login and pay-now, and to self-heal stale
      // state in both directions. See evaluateSoftBanForCheckout for details.
      const ban = await evaluateSoftBanForCheckout(customerId);
      if (ban.softBanned) {
        return res.json({
          eligible: false,
          code: "soft_banned",
          softBanned: true,
          softBannedReason: ban.softBannedReason,
          reason: ban.message,
          pendingVerificationCount: ban.pendingVerificationCount,
          brandName: ban.brandName,
          owedOrderId: ban.owedOrderId,
        });
      }

      // Eligibility + tier match delegated to the shared calculator
      // (also powers POST /api/internal/discount/calculate). Soft-ban gate
      // already happened above; we don't re-run it here.
      const result = await calculateDiscountForCustomer(customerId);
      const { customerExists, ...payload } = result;
      res.json(payload);
    } catch (error) {
      console.error('Discount calculation error:', error);
      res.status(500).json({ error: 'Failed to calculate discount' });
    }
  });

  // Confirm discount was applied to order
  // Called by merchant plugin after a Shopify order is placed with a Spiral discount
  app.post("/api/checkout/confirm-discount", async (req, res) => {
    try {
      const { 
        customerId, 
        // Accept both merchant plugin field names and legacy field names
        orderId: merchantOrderId,
        shopifyOrderId: legacyShopifyOrderId,
        orderNumber,
        shopDomain,
        storeName: bodyStoreName,
        discountPercent, 
        discountCode,
        discountAmount: legacyDiscountAmount,
        totalPrice,
        orderTotal: legacyOrderTotal,
        shippingAmount: bodyShippingAmount,
        currency,
        lineItems: rawLineItemsFromWidget,
      } = req.body;

      const shopifyOrderId = merchantOrderId || legacyShopifyOrderId;
      
      if (!customerId || !shopifyOrderId) {
        return res.status(400).json({ error: 'Customer ID and order ID required' });
      }
      
      const customer = await storage.getSpiralCustomerById(customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      const settings = await storage.getStoreSettings();

      // Calculate discount amount from percent and total if not provided directly
      const orderTotal = parseFloat(totalPrice || legacyOrderTotal || '0');
      const discountPct = parseFloat(discountPercent || '0');
      const discountAmount = legacyDiscountAmount 
        ? parseFloat(legacyDiscountAmount.toString()) 
        : (orderTotal * discountPct / 100);
      
      // Check for existing order (idempotency).
      //
      // Race case: Shopify's `orders/create` webhook can arrive BEFORE this
      // dashboard call, in which case the row exists but is missing the
      // enriched Spiral data (customer ID, Instagram identity, discount
      // tier, follower count). Backfill any of those fields that are null,
      // never overwrite. Returns success either way for idempotency.
      const existingOrder = await storage.getOrderByShopifyOrderId(shopifyOrderId.toString());
      if (existingOrder) {
        await storage.patchOrderIfNull(existingOrder.id, {
          spiralCustomerId: customer.id,
          instagramHandle: customer.instagramHandle,
          instagramUserId: customer.instagramUserId,
          instagramGlobalUserId: customer.instagramGlobalUserId ?? null,
          followerCount: customer.followerCount,
          discountPercent: discountPct > 0 ? discountPct.toFixed(2) : null,
          discountAmount: discountAmount > 0 ? discountAmount.toFixed(2) : null,
          orderTotal: orderTotal > 0 ? orderTotal.toFixed(2) : null,
          shippingAmount: (() => {
            const n = parseFloat(String(bodyShippingAmount ?? ''));
            return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
          })(),
        } as any);
        return res.json({ success: true });
      }
      
      // Build store logo and line items for customer display.
      // Prefer the request's shopDomain (per-call accuracy in a future
      // multi-tenant world) and fall back to the singleton settings row.
      const confirmShopDomain = shopDomain || settings?.shopDomain || '';
      const confirmCreds = confirmShopDomain
        ? await getShopifyCredentials({ shopDomain: confirmShopDomain })
        : await getShopifyCredentialsForSettings(settings);
      const confirmStoreLogo = confirmCreds?.storeLogoUrl ?? null;
      let confirmLineItems: string | null = null;
      if (Array.isArray(rawLineItemsFromWidget) && rawLineItemsFromWidget.length > 0) {
        const normalizeHttpUrl = (value: unknown): string | null => {
          if (typeof value !== 'string') return null;
          const trimmed = value.trim();
          if (trimmed.length === 0) return null;
          try {
            const parsed = new URL(trimmed);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
            return parsed.toString();
          } catch {
            return null;
          }
        };
        const normalized = rawLineItemsFromWidget
          .map((raw: any) => {
            const name = (raw?.name ?? raw?.title ?? '').toString().trim();
            const imageUrl = typeof raw?.imageUrl === 'string' && raw.imageUrl.length > 0
              ? raw.imageUrl
              : null;
            const productUrl = normalizeHttpUrl(raw?.productUrl ?? raw?.url);
            const rawQty = Number(raw?.quantity);
            const quantity = Number.isFinite(rawQty) && rawQty >= 1 ? Math.floor(rawQty) : 1;
            // Pass through a per-item discount if the widget supplies one;
            // most callers don't, so this stays undefined and the UI falls
            // back to the single order-level discount line.
            const rawItemDiscount = Number(raw?.discountedAmount ?? raw?.discount);
            const discountedAmount = Number.isFinite(rawItemDiscount) && rawItemDiscount > 0
              ? Math.round(rawItemDiscount * 100) / 100
              : undefined;
            return { name, imageUrl, productUrl, quantity, ...(discountedAmount !== undefined ? { discountedAmount } : {}) };
          })
          .filter((item) => item.name.length > 0);
        // The checkout widget often doesn't send image URLs. If any item is
        // missing one, re-read the order from Shopify and fill images in by
        // product title so the shopper sees real photos. Best-effort: any
        // failure just leaves the placeholder icon.
        const needsImages = normalized.some((item) => !item.imageUrl);
        if (needsImages && confirmCreds?.shopDomain && confirmCreds?.accessToken) {
          const imagesByTitle = await fetchOrderLineItemImages({
            shopDomain: confirmCreds.shopDomain,
            accessToken: confirmCreds.accessToken,
            shopifyOrderId,
          });
          if (Object.keys(imagesByTitle).length > 0) {
            for (const item of normalized) {
              if (item.imageUrl) continue;
              const key = item.name.trim().toLowerCase();
              if (imagesByTitle[key]) item.imageUrl = imagesByTitle[key];
            }
          }
        }
        if (normalized.length > 0) {
          confirmLineItems = JSON.stringify(normalized);
        }
      }

      const order = await storage.createOrder({
        shopifyOrderId: shopifyOrderId.toString(),
        shopperEmail: customer.email,
        spiralCustomerId: customer.id,
        instagramHandle: customer.instagramHandle,
        instagramUserId: customer.instagramUserId,
        instagramGlobalUserId: customer.instagramGlobalUserId ?? null,
        followerCount: customer.followerCount,
        discountPercent: discountPct.toFixed(2),
        orderTotal: orderTotal.toFixed(2),
        shippingAmount: (() => {
          const n = parseFloat(String(bodyShippingAmount ?? ''));
          return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
        })(),
        discountAmount: discountAmount.toFixed(2),
        status: 'pending',
        verificationStatus: 'pending',
        storeName: (typeof bodyStoreName === 'string' && bodyStoreName.trim().length > 0)
          ? bodyStoreName.trim()
          : (settings?.storeName && settings.storeName !== 'My Store'
              ? settings.storeName
              : (confirmShopDomain ? confirmShopDomain.replace(/\.myshopify\.com$/i, '') : null)),
        storeLogo: confirmStoreLogo,
        merchantInstagramHandle: await getBrandHandleForShopDomain(confirmShopDomain),
        lineItems: confirmLineItems,
      });
      
      const verification = await storage.createVerification({
        orderId: order.id,
        shopperEmail: customer.email,
        instagramHandle: customer.instagramHandle || '',
        instagramUserId: customer.instagramUserId || '',
        followerCount: customer.followerCount || 0,
        discountAmount: discountAmount.toFixed(2),
        status: 'pending',
      });
      
      await storage.updateOrderVerificationStatus(order.id, 'pending', verification.id);
      
      console.log(`Checkout confirmed: Order ${order.id} (Shopify ${shopifyOrderId}) for customer ${customer.email}, ${customer.followerCount} followers, ${discountPct}% discount`);
      
      res.json({ success: true });
    } catch (error) {
      console.error('Discount confirmation error:', error);
      res.status(500).json({ error: 'Failed to confirm discount' });
    }
  });

  // ============================================
  // CUSTOMER APP API ROUTES
  // ============================================

  // Customer Signup - stores pending signup in session, account created after verification
  app.post("/api/customer/signup", async (req, res) => {
    try {
      const { email, password, firstName, lastName, country } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Normalize email and name
      const normalizedEmail = email.toLowerCase().trim();
      const customerFirstName = firstName?.trim() || undefined;
      const customerLastName = lastName?.trim() || undefined;
      // Country is optional but if present must be a 2-letter ISO code
      const customerCountry =
        typeof country === "string" && /^[A-Za-z]{2}$/.test(country)
          ? country.toUpperCase()
          : undefined;

      // Check if customer already exists
      const existing = await storage.getSpiralCustomerByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Hash password with salt (using simple approach for demo - use bcrypt in production)
      const salt = crypto.randomBytes(16).toString("hex");
      const passwordHash = crypto.createHash("sha256").update(salt + password).digest("hex") + ":" + salt;

      // Generate verification code
      const verificationCode = generateVerificationCode();
      const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store pending signup in session (account created after verification)
      req.session.pendingSignup = {
        email: normalizedEmail,
        firstName: customerFirstName,
        lastName: customerLastName,
        country: customerCountry,
        passwordHash,
        verificationCode,
        verificationExpiry,
      };

      // Send verification email with personalized greeting
      const emailSent = await sendVerificationEmail(normalizedEmail, verificationCode, customerFirstName);
      if (!emailSent) {
        console.warn("Failed to send verification email to:", normalizedEmail);
      }

      res.json({
        email: normalizedEmail,
        emailVerified: false,
        pendingVerification: true,
      });
    } catch (error) {
      console.error("Customer signup error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });

  // Verify email with 6-digit code - creates account after successful verification
  app.post("/api/customer/verify-email", async (req, res) => {
    try {
      const pendingSignup = req.session.pendingSignup;
      if (!pendingSignup) {
        return res.status(401).json({ error: "No pending signup found. Please sign up again." });
      }

      const { code } = req.body;
      if (!code || code.length !== 6) {
        return res.status(400).json({ error: "Please enter the 6-digit code" });
      }

      // Check if code is expired
      if (new Date() > new Date(pendingSignup.verificationExpiry)) {
        return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
      }

      // Verify code
      if (pendingSignup.verificationCode !== code) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Check again if email was taken in the meantime
      const existing = await storage.getSpiralCustomerByEmail(pendingSignup.email);
      if (existing) {
        req.session.pendingSignup = undefined;
        return res.status(400).json({ error: "An account with this email already exists" });
      }

      // Create the account now that email is verified
      const customer = await storage.createSpiralCustomer({
        email: pendingSignup.email,
        firstName: pendingSignup.firstName,
        lastName: pendingSignup.lastName,
        country: pendingSignup.country,
        passwordHash: pendingSignup.passwordHash,
        isActive: true,
        emailVerified: true,
      });

      // Clear pending signup and set customer session
      req.session.pendingSignup = undefined;
      req.session.customerId = customer.id;

      // Send welcome email (don't block on failure)
      sendWelcomeEmail(customer.id, customer.email, customer.firstName).catch((err) => {
        console.error("Welcome email send failed:", err);
      });

      res.json({ 
        success: true, 
        message: "Email verified successfully",
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        emailVerified: true,
      });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification code - works with pending signup session
  app.post("/api/customer/resend-code", async (req, res) => {
    try {
      const pendingSignup = req.session.pendingSignup;
      if (!pendingSignup) {
        return res.status(401).json({ error: "No pending signup found. Please sign up again." });
      }

      // Generate new code
      const verificationCode = generateVerificationCode();
      const verificationExpiry = new Date(Date.now() + 10 * 60 * 1000);

      // Update pending signup with new code
      req.session.pendingSignup = {
        ...pendingSignup,
        verificationCode,
        verificationExpiry,
      };

      // Send email
      const emailSent = await sendVerificationEmail(pendingSignup.email, verificationCode, pendingSignup.firstName);
      if (!emailSent) {
        return res.status(500).json({ error: "Failed to send verification email" });
      }

      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Resend code error:", error);
      res.status(500).json({ error: "Failed to resend code" });
    }
  });

  // Customer Login
  app.post("/api/customer/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      const customer = await storage.getSpiralCustomerByEmail(normalizedEmail);
      if (!customer) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Verify password with salt
      const [storedHash, salt] = customer.passwordHash.split(":");
      let isValid = false;
      
      if (salt) {
        // New salted format
        const passwordHash = crypto.createHash("sha256").update(salt + password).digest("hex");
        isValid = storedHash === passwordHash;
      } else {
        // Legacy format (unsalted)
        const passwordHash = crypto.createHash("sha256").update(password).digest("hex");
        isValid = customer.passwordHash === passwordHash;
      }

      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update last login
      await storage.updateSpiralCustomerLastLogin(customer.id);

      // Set session
      req.session.customerId = customer.id;

      res.json({
        id: customer.id,
        email: customer.email,
        emailVerified: customer.emailVerified,
        instagramHandle: customer.instagramHandle,
        followerCount: customer.followerCount,
      });
    } catch (error) {
      console.error("Customer login error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  // Customer Logout
  app.post("/api/customer/logout", async (req, res) => {
    req.session.customerId = undefined;
    res.json({ success: true });
  });

  // App Store 5.1.1(v): functional in-app account deletion. Hard-deletes the
  // customer + spiral_codes + merchant_scoped_user_map entries; orders are
  // anonymized (spiralCustomerId set to null) so historical analytics survive.
  // Ends the session as the final step.
  app.delete("/api/customer/me", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const customer = await storage.getSpiralCustomerById(customerId);
      if (!customer) {
        req.session.customerId = undefined;
        return res.status(204).end();
      }
      await storage.deleteSpiralCustomerCompletely(customerId);
      req.session.customerId = undefined;
      console.log(`[delete-account] Hard-deleted customer ${customerId} (${customer.email})`);
      res.status(204).end();
    } catch (error) {
      console.error("Delete account error:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });

  // Get current customer profile
  app.get("/api/customer/me", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const customer = await storage.getSpiralCustomerById(customerId);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      let profilePicture = customer.instagramProfilePicture;
      let followerCount = customer.followerCount;
      let instagramHandle = customer.instagramHandle;

      if (customer.instagramUserId && process.env.RAPIDAPI_KEY) {
        const lastUpdated = customer.followerCountUpdatedAt ? new Date(customer.followerCountUpdatedAt).getTime() : 0;
        const oneDayMs = 24 * 60 * 60 * 1000;
        const isStale = Date.now() - lastUpdated > oneDayMs;

        if (isStale || !profilePicture) {
          try {
            const igData = await fetchInstagramDataByUserId(customer.instagramUserId, process.env.RAPIDAPI_KEY);
            if (igData.followerCount != null) followerCount = igData.followerCount;
            if (igData.profilePicture) profilePicture = igData.profilePicture;
            if (igData.username) instagramHandle = igData.username;
            await storage.updateSpiralCustomerInstagram(customer.id, {
              instagramHandle: instagramHandle,
              instagramUserId: customer.instagramUserId,
              instagramAccessToken: null,
              instagramTokenExpiry: null,
              instagramProfilePicture: profilePicture,
              instagramAccountType: customer.instagramAccountType || "UNKNOWN",
              followerCount: followerCount ?? 0,
            });
          } catch (igError) {
            console.error("Failed to refresh Instagram data:", igError);
          }
        }
      }

      res.json({
        id: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        emailVerified: customer.emailVerified,
        instagramHandle,
        instagramUserId: customer.instagramUserId,
        instagramProfilePicture: profilePicture,
        instagramAccountType: customer.instagramAccountType,
        followerCount,
        dateOfBirth: customer.dateOfBirth,
        address: customer.address,
        country: customer.country,
        accountStatus: customer.accountStatus,
        softBannedReason: customer.softBannedReason,
      });
    } catch (error) {
      console.error("Get customer profile error:", error);
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  // Proxy Instagram profile pictures to avoid CORS/expiry issues
  app.get("/api/customer/instagram-avatar", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).end();
      }

      const customer = await storage.getSpiralCustomerById(customerId);
      if (!customer?.instagramUserId) {
        return res.status(404).end();
      }

      let picUrl = customer.instagramProfilePicture;

      if (!picUrl && process.env.RAPIDAPI_KEY) {
        try {
          const igData = await fetchInstagramDataByUserId(customer.instagramUserId, process.env.RAPIDAPI_KEY);
          if (igData.profilePicture) {
            picUrl = igData.profilePicture;
            await storage.updateSpiralCustomerInstagram(customer.id, {
              instagramHandle: customer.instagramHandle,
              instagramUserId: customer.instagramUserId,
              instagramAccessToken: null,
              instagramTokenExpiry: null,
              instagramProfilePicture: picUrl,
              instagramAccountType: customer.instagramAccountType || "UNKNOWN",
              followerCount: igData.followerCount || customer.followerCount || 0,
            });
          }
        } catch (e) {
          console.error("Failed to fetch IG pic from RapidAPI:", e);
        }
      }

      if (!picUrl) {
        return res.status(404).end();
      }

      const imgResponse = await fetch(picUrl);
      if (!imgResponse.ok) {
        // URL expired — refetch from RapidAPI
        if (process.env.RAPIDAPI_KEY) {
          try {
            const igData = await fetchInstagramDataByUserId(customer.instagramUserId, process.env.RAPIDAPI_KEY);
            if (igData.profilePicture) {
              picUrl = igData.profilePicture;
              await storage.updateSpiralCustomerInstagram(customer.id, {
                instagramHandle: customer.instagramHandle,
                instagramUserId: customer.instagramUserId,
                instagramAccessToken: null,
                instagramTokenExpiry: null,
                instagramProfilePicture: picUrl,
                instagramAccountType: customer.instagramAccountType || "UNKNOWN",
                followerCount: igData.followerCount || customer.followerCount || 0,
              });
              const retryResponse = await fetch(picUrl);
              if (retryResponse.ok) {
                const contentType = retryResponse.headers.get("content-type") || "image/jpeg";
                res.setHeader("Content-Type", contentType);
                res.setHeader("Cache-Control", "public, max-age=3600");
                const buffer = await retryResponse.arrayBuffer();
                return res.send(Buffer.from(buffer));
              }
            }
          } catch (e) {
            console.error("Failed to refetch IG pic:", e);
          }
        }
        return res.status(404).end();
      }

      const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=3600");
      const buffer = await imgResponse.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Instagram avatar proxy error:", error);
      res.status(500).end();
    }
  });

  // Register or clear the iOS device push token for the authenticated customer.
  // Body: { token: string | null } — pass null to unregister (e.g. on logout / permission revoked).
  // Tokens are used ONLY for failure/reminder pushes — never for success notifications.
  app.post("/api/customer/push-token", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { token } = req.body as { token?: string | null };
      const normalized = typeof token === 'string' && token.trim().length > 0 ? token.trim() : null;
      await storage.updateSpiralCustomerPushToken(customerId, normalized);
      res.json({ success: true, registered: normalized !== null });
    } catch (error) {
      console.error('Failed to register push token:', error);
      res.status(500).json({ error: 'Failed to register push token' });
    }
  });

  // Disconnect Instagram account
  app.post("/api/customer/disconnect-instagram", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Clear all Instagram data in storage
      const updated = await storage.updateSpiralCustomerInstagram(customerId, {
        instagramHandle: null,
        instagramUserId: null,
        instagramAccessToken: null,
        instagramTokenExpiry: null,
        instagramProfilePicture: null,
        instagramAccountType: null,
        followerCount: null,
      });

      res.json({
        instagramHandle: updated.instagramHandle,
        instagramUserId: updated.instagramUserId,
        followerCount: updated.followerCount,
      });
    } catch (error) {
      console.error("Instagram disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect Instagram" });
    }
  });

  app.patch("/api/customer/profile", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const profileUpdateSchema = z.object({
        firstName: z.string().max(50).nullable().optional(),
        lastName: z.string().max(50).nullable().optional(),
        dateOfBirth: z.string().max(20).nullable().optional(),
        address: z.string().max(500).nullable().optional(),
        country: z.string().regex(/^[A-Z]{2}$/, "Country must be a 2-letter ISO-3166 code").nullable().optional(),
      });

      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { firstName, lastName, dateOfBirth, address, country } = parsed.data;
      const updateData: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; address?: string | null; country?: string | null } = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
      if (address !== undefined) updateData.address = address;
      if (country !== undefined) updateData.country = country;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const updated = await storage.updateSpiralCustomerProfile(customerId, updateData);
      res.json({
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        dateOfBirth: updated.dateOfBirth,
        address: updated.address,
        country: updated.country,
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Get customer orders (scoped to authenticated customer)
  app.get("/api/customer/orders", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const orders = await storage.getOrdersByCustomerId(customerId);
      res.json(orders);
    } catch (error) {
      console.error("Failed to fetch customer orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Get single order (scoped to authenticated customer)
  app.get("/api/customer/orders/:id", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Verify order belongs to authenticated customer
      if (order.spiralCustomerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // merchantInstagramHandle is snapshotted onto the order row at creation
      // time by getBrandHandleForShopDomain (see orders/create webhook). For
      // older orders (or orders created when the brands feed was unreachable)
      // the snapshot may be null — do a live storeName-based fallback so the
      // OrderDetail page can always show the brand's @handle in the
      // "tag the brand" CTA.
      let responseOrder = order;
      if (!order.merchantInstagramHandle && order.storeName) {
        const fallbackHandle = await getBrandHandleForStoreName(order.storeName);
        if (fallbackHandle) {
          responseOrder = { ...order, merchantInstagramHandle: fallbackHandle };
        }
      }
      res.json(responseOrder);
    } catch (error) {
      console.error("Failed to fetch order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Shopper-triggered "I've received this order" — the universal manual override
  // that covers every case Shopify can't tell us about in real time:
  //   - Click-and-collect: merchant rarely marks "Picked up" in Shopify
  //   - Manual ship with no carrier integration: no tracking events ever fire
  //   - Carrier scan lag: shopper has the parcel in hand before the carrier reports
  // Gates: must be authenticated owner, order must be fulfilled and not yet
  // delivered (can't receive what hasn't shipped; already-delivered is a no-op).
  // Idempotent via transitionOrderToDelivered.
  const handleMarkReceived = async (req: any, res: any) => {
    try {
      // Lightweight CSRF defence: require the request to originate from our
      // own host. Session cookie is sameSite=none for Replit cross-origin
      // preview, so we can't rely on the browser to block cross-site POSTs.
      const origin = req.get('origin') || req.get('referer') || '';
      const host = req.get('host') || '';
      if (origin && host && !origin.includes(host)) {
        return res.status(403).json({ error: "Cross-origin request rejected" });
      }
      const customerId = req.session.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });

      const order = await storage.getOrderById(req.params.id);
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.spiralCustomerId !== customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (order.status === 'delivered') {
        return res.json({ success: true, alreadyDelivered: true });
      }
      // Accept any non-delivered order. Many tiny indie merchants never click
      // "Mark as fulfilled" in Shopify admin and never add tracking, so the
      // order can sit in `pending` forever even though the shopper has it in
      // their hands. We trust the shopper here — they have no incentive to
      // lie since marking received only starts their own Story obligation.
      await transitionOrderToDelivered(order.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[delivery] customer mark-received failed:", err);
      res.status(500).json({ error: "Failed to mark received" });
    }
  };
  app.post("/api/customer/orders/:id/mark-received", handleMarkReceived);
  // Back-compat alias: the original endpoint name used by the first cut of the
  // click-and-collect button. Same semantics now.
  app.post("/api/customer/orders/:id/mark-collected", handleMarkReceived);

  // Get customer stats (scoped to authenticated customer)
  app.get("/api/customer/stats", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const orders = await storage.getOrdersByCustomerId(customerId);

      // Total saved counts the discount the shopper has *already locked in*
      // — i.e. every order they've placed where Spiral applied a discount,
      // regardless of Story verification state. This keeps the headline
      // figure stable from the moment of checkout instead of dropping to
      // £0 while we wait for the Story → final-check window to close.
      const totalSaved = orders.reduce((sum, o) => {
        const n = parseFloat(o.discountAmount || "0");
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      const verifiedOrders = orders.filter(o => o.verificationStatus === "verified");
      const pendingOrders = await storage.getUnverifiedDeliveredOrdersByCustomerId(customerId);
      
      const customer = await storage.getSpiralCustomerById(customerId);
      let discountPercent: number = 0;
      if (customer?.followerCount && customer.followerCount > 0) {
        const tiers = await storage.getDiscountTiers();
        const sorted = [...tiers].sort((a, b) => a.fromFollowers - b.fromFollowers);
        const fc = customer.followerCount;
        // Find the exact tier the customer falls into
        for (const tier of sorted) {
          const inTier = fc >= tier.fromFollowers && (tier.toFollowers === null || fc <= tier.toFollowers);
          if (inTier) {
            discountPercent = parseFloat(tier.discountPercent);
            break;
          }
        }
      }
      
      res.json({
        totalSaved,
        ordersCompleted: verifiedOrders.length,
        discountPercent,
        pendingVerificationCount: pendingOrders.length,
        pendingOrders: pendingOrders.map(o => ({
          id: o.id,
          storeName: o.storeName,
          shopifyOrderId: o.shopifyOrderId,
        })),
      });
    } catch (error) {
      console.error("Failed to fetch customer stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // ============================================
  // Spiral Code API (DM-based Instagram verification)
  // ============================================

  // Generate a new Spiral code for Instagram verification
  function generateSpiralCode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars like 0,O,I,1
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Get or create a Spiral code for the authenticated customer
  app.post("/api/customer/spiral-code", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Check for existing pending code
      let spiralCode = await storage.getPendingSpiralCodeByCustomerId(customerId);
      
      // If existing code is expired, create a new one
      if (spiralCode && new Date(spiralCode.expiresAt) < new Date()) {
        spiralCode = undefined;
      }

      if (!spiralCode) {
        // Generate new code (24 hour expiry)
        const code = generateSpiralCode();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        spiralCode = await storage.createSpiralCode({
          code,
          customerId,
          status: "pending",
          expiresAt,
        });
      }

      res.json({
        code: spiralCode.code,
        expiresAt: spiralCode.expiresAt,
        status: spiralCode.status,
      });
    } catch (error) {
      console.error("Failed to generate spiral code:", error);
      res.status(500).json({ error: "Failed to generate verification code" });
    }
  });

  // Check verification status (polling endpoint)
  app.get("/api/customer/spiral-code/status", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const spiralCode = await storage.getSpiralCodeByCustomerId(customerId);
      
      if (!spiralCode) {
        return res.json({ status: "no_code" });
      }

      // Check if code is expired
      if (new Date(spiralCode.expiresAt) < new Date()) {
        return res.json({ status: "expired" });
      }

      // If verified, also return the Instagram data
      if (spiralCode.status === "verified") {
        // Get the customer to return their updated Instagram info
        const customer = await storage.getSpiralCustomerById(customerId);
        return res.json({
          status: "verified",
          instagramHandle: customer?.instagramHandle,
          instagramUserId: customer?.instagramUserId,
          followerCount: customer?.followerCount,
        });
      }

      res.json({ status: spiralCode.status });
    } catch (error) {
      console.error("Failed to check spiral code status:", error);
      res.status(500).json({ error: "Failed to check verification status" });
    }
  });

  // Regenerate Spiral code (invalidates old one)
  app.post("/api/customer/spiral-code/regenerate", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Generate new code (24 hour expiry)
      const code = generateSpiralCode();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const spiralCode = await storage.createSpiralCode({
        code,
        customerId,
        status: "pending",
        expiresAt,
      });

      res.json({
        code: spiralCode.code,
        expiresAt: spiralCode.expiresAt,
        status: spiralCode.status,
      });
    } catch (error) {
      console.error("Failed to regenerate spiral code:", error);
      res.status(500).json({ error: "Failed to regenerate verification code" });
    }
  });

  // Save customer's claimed Instagram handle (used for follower count lookup)
  app.patch("/api/customer/spiral-code/handle", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) return res.status(401).json({ error: "Not authenticated" });
      const { handle } = req.body;
      if (!handle || typeof handle !== "string") return res.status(400).json({ error: "Invalid handle" });
      const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
      if (!cleanHandle) return res.status(400).json({ error: "Invalid handle" });
      await storage.updateSpiralCodeClaimedHandle(customerId, cleanHandle);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to save claimed handle:", error);
      res.status(500).json({ error: "Failed to save handle" });
    }
  });

  // ============================================
  // Re-subscribe Facebook Page to Instagram messaging webhooks
  // ============================================

  app.get("/api/admin/email-failures", async (req, res) => {
    try {
      const limitParam = req.query.limit;
      const parsed = typeof limitParam === "string" ? parseInt(limitParam, 10) : NaN;
      const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 500) : 50;
      const failures = await storage.getRecentEmailSendFailures(limit);
      res.json(failures);
    } catch (error) {
      console.error("Failed to load email failures:", error);
      res.status(500).json({ error: "Failed to load email failures" });
    }
  });

  app.post("/api/admin/resubscribe-webhooks", async (_req, res) => {
    try {
      const pageId = process.env.SPIRAL_INSTAGRAM_BUSINESS_ID;
      const accessToken = await getJoinspiralToken();

      if (!pageId || !accessToken) {
        return res.status(400).json({ error: "Missing SPIRAL_INSTAGRAM_BUSINESS_ID or SPIRAL_INSTAGRAM_ACCESS_TOKEN env vars" });
      }

      const subscribeUrl = `https://graph.facebook.com/v18.0/${pageId}/subscribed_apps`;
      const subscribeRes = await fetch(subscribeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscribed_fields: ['messages', 'messaging_postbacks'],
          access_token: accessToken,
        }),
      });

      const result = await subscribeRes.json();
      console.log('Resubscribe webhook result:', JSON.stringify(result));

      if (subscribeRes.ok) {
        return res.json({ success: true, result });
      } else {
        return res.status(400).json({ success: false, error: result });
      }
    } catch (error: any) {
      console.error('Resubscribe webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Instagram DM Webhook (for receiving verification DMs)
  // ============================================

  // Forward story_mention webhook events to the merchant dashboard so it can
  // build its Promotions gallery from shopper Story images. Fire-and-forget;
  // never blocks our 200 ack back to Meta and never throws. On any failure
  // (non-2xx, timeout, network error) the payload is persisted to
  // `dashboard_forward_queue` and retried by `processDashboardForwardQueue`
  // on a 1m / 5m / 30m backoff (gives up after ~24h).
  let storyForwardKeyMissingWarned = false;

  type ForwardAttemptResult =
    | { ok: true }
    | { ok: false; reason: string; statusCode: number | null; retriable: boolean };

  async function attemptDashboardForward(payload: { messaging: any[]; shopDomain?: string; instagramBusinessAccountId?: string; storyImageUrl?: string }): Promise<ForwardAttemptResult> {
    const internalKey = process.env.SPIRAL_INTERNAL_KEY;
    if (!internalKey) {
      if (!storyForwardKeyMissingWarned) {
        console.warn('[STORY-FORWARD] SPIRAL_INTERNAL_KEY not set — skipping forward to merchant dashboard');
        storyForwardKeyMissingWarned = true;
      }
      // Not retriable: missing config, not a transient dashboard outage.
      return { ok: false, reason: 'missing_internal_key', statusCode: null, retriable: false };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch('https://spiral-merchant-dashboard.replit.app/api/instagram/story-mention', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-spiral-internal-key': internalKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        // 4xx (other than 408/429) almost always means the dashboard rejected
        // the payload shape or auth — retrying won't help. 5xx and 408/429
        // are transient and worth retrying.
        const retriable = res.status >= 500 || res.status === 408 || res.status === 429;
        return { ok: false, reason: `http_${res.status}`, statusCode: res.status, retriable };
      }
      return { ok: true };
    } catch (err: any) {
      const reason = err?.name === 'AbortError' ? 'timeout_3s' : (err?.message || String(err));
      return { ok: false, reason, statusCode: null, retriable: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  async function forwardStoryMentionToDashboard(
    messaging: any[],
    merchant?: { shopDomain?: string | null; instagramBusinessAccountId?: string | null },
    storyImageUrl?: string | null,
  ): Promise<void> {
    // Include the matched merchant's stable identifiers so the dashboard can map
    // the Story to the right merchant without converting between Instagram's
    // app-scoped id (what the dashboard stores) and the webhook/global id (what
    // arrives in entry.id). shopDomain is the primary key; the business id is a
    // secondary fallback. Omit blank values rather than forward empty strings.
    //
    // storyImageUrl, when present, is the PERMANENT S3 link to the captured Story
    // media (image or video — the .jpg/.mp4 extension distinguishes them). The
    // dashboard stores it as-is and ignores the ephemeral link inside `messaging`.
    // When media capture/upload couldn't run (S3 unconfigured or download failed)
    // we omit it and the dashboard falls back to its existing behaviour.
    const payload: { messaging: any[]; shopDomain?: string; instagramBusinessAccountId?: string; storyImageUrl?: string } = { messaging };
    if (merchant?.shopDomain) payload.shopDomain = merchant.shopDomain;
    if (merchant?.instagramBusinessAccountId) payload.instagramBusinessAccountId = merchant.instagramBusinessAccountId;
    if (storyImageUrl) payload.storyImageUrl = storyImageUrl;
    const result = await attemptDashboardForward(payload);
    if (result.ok) {
      console.log(`[STORY-FORWARD] Forwarded ${messaging.length} event(s) to merchant dashboard`);
      return;
    }
    // Persist every failure (non-2xx, timeout, network error) so we never
    // silently lose a shopper Story post. The worker decides whether to retry
    // (transient: 5xx/408/429/timeout/network) or drop with a logged error
    // (terminal: other 4xx, missing internal key) on its next tick.
    const retryLabel = result.retriable ? 'enqueuing for retry' : 'enqueuing for investigation (non-retriable)';
    console.warn(`[STORY-FORWARD] Forward failed: ${result.reason} — ${retryLabel}`);
    try {
      // Seed nextAttemptAt to "now + 1m" for retriable failures so the worker
      // picks it up on its next tick. Non-retriable rows are scheduled
      // immediately so the worker can drop them quickly with a clear log.
      const seedDelayMs = result.retriable ? DASHBOARD_FORWARD_RETRY_DELAYS_MS[0] : 0;
      await storage.enqueueDashboardForward({
        payload,
        nextAttemptAt: new Date(Date.now() + seedDelayMs),
        lastError: result.reason,
        lastStatusCode: result.statusCode,
      });
    } catch (err: any) {
      console.error(`[STORY-FORWARD] Failed to enqueue forward retry: ${err?.message || err}`);
    }
  }

  // Retry worker for failed dashboard forwards. Runs every minute. Backoff is
  // attempt-count based: after attempt N (1-indexed) the next retry is at
  // [1m, 5m, 30m, 30m, ...]. Rows older than 24h are dropped (logged) so the
  // queue stays bounded.
  const DASHBOARD_FORWARD_RETRY_DELAYS_MS = [
    60 * 1000,        // after 1st failure → 1 minute
    5 * 60 * 1000,    // after 2nd failure → 5 minutes
    30 * 60 * 1000,   // after 3rd failure → 30 minutes
  ];
  const DASHBOARD_FORWARD_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  const DASHBOARD_FORWARD_INTERVAL_MS = 60 * 1000;

  function nextDashboardForwardDelayMs(attemptsAfter: number): number {
    const idx = Math.min(attemptsAfter - 1, DASHBOARD_FORWARD_RETRY_DELAYS_MS.length - 1);
    return DASHBOARD_FORWARD_RETRY_DELAYS_MS[Math.max(0, idx)];
  }

  let dashboardForwardWorkerBusy = false;
  async function processDashboardForwardQueue(): Promise<void> {
    if (dashboardForwardWorkerBusy) return;
    dashboardForwardWorkerBusy = true;
    try {
      const now = new Date();
      const due = await storage.getDueDashboardForwards(now, 25);
      if (due.length === 0) return;
      for (const row of due) {
        const ageMs = now.getTime() - new Date(row.createdAt).getTime();
        if (ageMs > DASHBOARD_FORWARD_MAX_AGE_MS) {
          console.error(
            `[STORY-FORWARD] Giving up on queued forward ${row.id} after ${row.attempts} attempt(s) — ` +
            `${Math.round(ageMs / 3600000)}h old, last error: ${row.lastError || 'unknown'}`
          );
          await storage.deleteDashboardForward(row.id);
          continue;
        }
        const payload = row.payload as { messaging: any[]; shopDomain?: string; instagramBusinessAccountId?: string; storyImageUrl?: string };
        const result = await attemptDashboardForward(payload);
        if (result.ok) {
          console.log(`[STORY-FORWARD] Retry succeeded for ${row.id} on attempt ${row.attempts + 1}`);
          await storage.deleteDashboardForward(row.id);
          continue;
        }
        if (!result.retriable) {
          console.error(`[STORY-FORWARD] Dropping queued forward ${row.id} — non-retriable: ${result.reason}`);
          await storage.deleteDashboardForward(row.id);
          continue;
        }
        const attemptsAfter = row.attempts + 1;
        const delayMs = nextDashboardForwardDelayMs(attemptsAfter);
        const nextAttemptAt = new Date(now.getTime() + delayMs);
        await storage.rescheduleDashboardForward(row.id, {
          nextAttemptAt,
          lastError: result.reason,
          lastStatusCode: result.statusCode,
        });
        console.warn(
          `[STORY-FORWARD] Retry ${attemptsAfter} failed for ${row.id} (${result.reason}); ` +
          `next attempt in ${Math.round(delayMs / 1000)}s`
        );
      }
    } catch (err: any) {
      console.error(`[STORY-FORWARD] Worker tick failed: ${err?.message || err}`);
    } finally {
      dashboardForwardWorkerBusy = false;
    }
  }

  // Webhook verification endpoint (Meta requires this for setup)
  app.get("/webhooks/instagram-dm", (req, res) => {
    const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'spiral_verify_token';
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Instagram DM webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      console.error('Instagram DM webhook verification failed');
      res.status(403).send('Verification failed');
    }
  });

  // Webhook endpoint for receiving DMs to @joinspiral
  app.post("/webhooks/instagram-dm", async (req, res) => {
    try {
      // Verify webhook signature using app secret.
      // Meta signs the payload with the secret of the app that owns the webhook
      // subscription. For this Meta app the signing secret can be EITHER the
      // top-level Spiral app secret (FACEBOOK_APP_SECRET) or the nested
      // Instagram app secret (INSTAGRAM_APP_SECRET) depending on how the
      // Instagram product webhook is wired — so we accept a match against
      // either. We log which secret matched (label only, never the value) so a
      // mismatch is diagnosable; if neither matches, the configured prod secret
      // values are stale and must be re-copied from the Meta dashboard.
      const signature = req.headers['x-hub-signature-256'] as string;
      const candidateSecrets: { label: string; value: string }[] = [];
      if (process.env.FACEBOOK_APP_SECRET) {
        candidateSecrets.push({ label: 'FACEBOOK_APP_SECRET', value: process.env.FACEBOOK_APP_SECRET });
      }
      if (process.env.INSTAGRAM_APP_SECRET) {
        candidateSecrets.push({ label: 'INSTAGRAM_APP_SECRET', value: process.env.INSTAGRAM_APP_SECRET });
      }

      if (candidateSecrets.length > 0) {
        if (!signature) {
          console.error('Instagram DM webhook missing required signature header');
          return res.status(403).json({ error: 'Missing signature' });
        }

        const rawBody = (req as any).rawBody;

        if (!rawBody) {
          console.error('Raw body not available for signature verification');
          return res.status(500).json({ error: 'Server configuration error' });
        }

        const signatureBuffer = Buffer.from(signature, 'utf8');
        let matchedLabel: string | null = null;
        for (const secret of candidateSecrets) {
          const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret.value)
            .update(rawBody)
            .digest('hex');
          const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
          if (signatureBuffer.length === expectedBuffer.length &&
              crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
            matchedLabel = secret.label;
            break;
          }
        }

        if (!matchedLabel) {
          console.error(`Invalid Instagram DM webhook signature (tried ${candidateSecrets.map(s => s.label).join(', ')} — none matched; prod secret value(s) likely stale)`);
          return res.status(403).json({ error: 'Invalid signature' });
        }

        console.log(`Instagram DM webhook signature verified using ${matchedLabel}`);
      } else {
        console.warn('FACEBOOK_APP_SECRET/INSTAGRAM_APP_SECRET not configured - skipping signature verification (DEV MODE)');
      }

      console.log('Instagram DM webhook received:', JSON.stringify(req.body, null, 2));

      const body = req.body;

      // Process messaging events
      if (body.object === 'instagram' && body.entry) {
        for (const entry of body.entry) {
          if (entry.messaging) {
            for (const event of entry.messaging) {
              // Handle incoming message
              if (event.message?.text) {
                const senderInstagramId = event.sender?.id;
                const messageText = event.message.text.trim().toUpperCase();
                
                console.log(`Received DM from ${senderInstagramId}: ${messageText}`);

                // Extract 6-character code from anywhere in message
                // Code uses: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0,O,I,1)
                // Allow codes adjacent to punctuation (e.g., "CODE:ABC123!" works)
                const codePattern = /(?<![A-Z0-9])[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}(?![A-Z0-9])/gi;
                const potentialCodes = (messageText.match(codePattern) || []).map((c: string) => c.toUpperCase());
                
                // Find all matching codes and categorize them
                let pendingValidCode = null;
                let pendingValidMatchedCode = "";
                let expiredCode = null;
                let expiredMatchedCode = "";
                let verifiedCode = null;
                let verifiedMatchedCode = "";
                
                for (const code of potentialCodes) {
                  const found = await storage.getSpiralCodeByCode(code);
                  if (found) {
                    if (found.status === "pending" && new Date(found.expiresAt) >= new Date()) {
                      // Found a valid pending code - use this one
                      pendingValidCode = found;
                      pendingValidMatchedCode = code;
                      break; // Prioritize first valid pending code
                    } else if (found.status === "pending" && !expiredCode) {
                      expiredCode = found;
                      expiredMatchedCode = code;
                    } else if (found.status === "verified" && !verifiedCode) {
                      verifiedCode = found;
                      verifiedMatchedCode = code;
                    }
                  }
                }
                
                if (pendingValidCode) {
                  // Valid pending code found - process verification
                  // Fetch Instagram user info via RapidAPI (if configured)
                  let followerCount = 0;
                  let instagramHandle = "";
                  let profilePicture = "";
                  
                  // Use claimed handle from code if customer entered it before DMing
                  const claimedHandle = pendingValidCode.claimedHandle || "";

                  // Try to get Instagram data (uses claimed handle as fallback for username)
                  try {
                    const rapidApiKey = process.env.RAPIDAPI_KEY;
                    if (rapidApiKey) {
                      const igData = await fetchInstagramDataByUserId(senderInstagramId, rapidApiKey, claimedHandle);
                      followerCount = igData.followerCount || 0;
                      instagramHandle = igData.username || claimedHandle;
                      profilePicture = igData.profilePicture || "";
                    } else if (claimedHandle) {
                      instagramHandle = claimedHandle;
                    }
                  } catch (igError) {
                    console.error("Failed to fetch Instagram data:", igError);
                    if (claimedHandle) instagramHandle = claimedHandle;
                  }

                  // Fall back to sender ID as handle so profile is always saved as connected
                  if (!instagramHandle) {
                    instagramHandle = senderInstagramId;
                  }

                  // Verify the code and link Instagram
                  await storage.verifySpiralCode(pendingValidMatchedCode, senderInstagramId, instagramHandle);

                  // Send the welcome DM IMMEDIATELY after the code is marked
                  // verified, BEFORE any of the secondary side-effects below
                  // (global-ID lookup, customer record update, soft-ban
                  // inheritance check). Those calls have historically thrown
                  // and bubbled to the outer webhook catch, silently skipping
                  // this DM. We're inside the 24h messaging window because the
                  // shopper just DM'd us their code, so this is a safe send.
                  try {
                    console.log(`Sending welcome DM to ${senderInstagramId}...`);
                    const dmResult = await sendInstagramDM(
                      senderInstagramId,
                      "🛍️ Welcome to Spiral! You're verified — start earning instant discounts at your favourite online stores."
                    );
                    const persistStatus: "sent" | "failed" | "skipped_no_token" | "threw" = dmResult.ok
                      ? "sent"
                      : dmResult.reason === "skipped_no_token"
                        ? "skipped_no_token"
                        : dmResult.reason === "threw"
                          ? "threw"
                          : "failed";
                    console.log(`Welcome DM result for ${senderInstagramId}: ${persistStatus}`, dmResult);
                    try {
                      await storage.recordWelcomeDmAttempt(
                        pendingValidCode.customerId,
                        persistStatus,
                        { recipientId: senderInstagramId, ...dmResult }
                      );
                    } catch (persistErr) {
                      console.error('Failed to persist welcome DM result:', persistErr);
                    }
                  } catch (welcomeErr) {
                    console.error('Welcome DM send threw unexpectedly:', welcomeErr);
                    try {
                      await storage.recordWelcomeDmAttempt(
                        pendingValidCode.customerId,
                        "threw",
                        { recipientId: senderInstagramId, errorMessage: welcomeErr instanceof Error ? welcomeErr.message : String(welcomeErr) }
                      );
                    } catch (_) { /* swallow */ }
                  }

                  // Resolve the account-wide Instagram user ID (the `pk`).
                  // This is the only identifier that reliably matches negative
                  // cache rows across merchants, since every page-scoped ID
                  // (DM sender, story_mention sender, Graph API ID) differs
                  // for the same person across pages.
                  let globalInstagramUserId: string | null = null;
                  try {
                    if (process.env.RAPIDAPI_KEY && instagramHandle) {
                      globalInstagramUserId = await fetchInstagramGlobalUserIdByUsername(instagramHandle, process.env.RAPIDAPI_KEY);
                      if (globalInstagramUserId) {
                        try {
                          await storage.updateSpiralCustomerGlobalUserId(pendingValidCode.customerId, globalInstagramUserId);
                        } catch (err) {
                          console.error('Failed to persist global IG user ID on customer:', err);
                        }
                      }
                    }
                  } catch (globalIdErr) {
                    console.error('Global IG user ID lookup failed (non-fatal):', globalIdErr);
                  }

                  // This Instagram account is now a Spiral customer. Wipe any
                  // negative-cache rows previously written for this identity
                  // under any merchant so their next Story mention resolves
                  // correctly instead of short-circuiting on a stale "not a
                  // Spiral customer" row. Match by every identity key we have
                  // available — global ID is the primary cross-merchant key;
                  // handle is a fallback for legacy rows lacking a global ID.
                  try {
                    const cleared = await storage.clearNegativeCacheForInstagramIdentity({
                      senderScopedId: senderInstagramId,
                      instagramUserId: senderInstagramId,
                      instagramGlobalUserId: globalInstagramUserId,
                      instagramHandle,
                    });
                    if (cleared > 0) {
                      console.log(`Cleared ${cleared} stale negative-cache row(s) for newly-verified @${instagramHandle} (global IG id ${globalInstagramUserId ?? 'unknown'})`);
                    }
                  } catch (clearErr) {
                    console.error('Failed to clear negative cache after Spiral verification:', clearErr);
                  }

                  // Update customer's Instagram info — wrapped because a unique
                  // constraint conflict (e.g. the same IG account previously
                  // linked to another customer that wasn't fully cleaned up)
                  // would otherwise bubble out and skip soft-ban inheritance.
                  try {
                    await storage.updateSpiralCustomerInstagram(pendingValidCode.customerId, {
                      instagramHandle,
                      instagramUserId: senderInstagramId,
                      instagramAccessToken: null,
                      instagramTokenExpiry: null,
                      instagramProfilePicture: profilePicture || null,
                      instagramAccountType: "UNKNOWN",
                      followerCount,
                    });
                  } catch (updateErr) {
                    console.error('Failed to update customer Instagram info (non-fatal, code already verified):', updateErr);
                  }

                  // Soft-ban inheritance: if any sibling Spiral account sharing
                  // this newly-resolved Instagram identity has owed Story debt,
                  // carry that ban over to the just-verified account so a new
                  // email can't be used to dodge debt anchored to the IG profile.
                  try {
                    const inheritedDebt = await getOwedOrdersForInstagramIdentity({
                      instagramGlobalUserId: globalInstagramUserId,
                      instagramUserId: senderInstagramId,
                      excludeCustomerId: pendingValidCode.customerId,
                    });
                    if (inheritedDebt.length > 0) {
                      await storage.setCustomerSoftBanned(pendingValidCode.customerId, "inherited_from_instagram");
                      console.log(`[soft-ban] Customer ${pendingValidCode.customerId} inherited soft-ban from Instagram identity (@${instagramHandle}, ${inheritedDebt.length} owed order(s) on sibling accounts)`);
                    }
                  } catch (inheritErr) {
                    console.error('Failed to evaluate IG-anchored soft-ban inheritance:', inheritErr);
                  }

                  console.log(`Verified Spiral code ${pendingValidMatchedCode} for customer ${pendingValidCode.customerId} - Instagram: @${instagramHandle} (${senderInstagramId})`);
                  // (Welcome DM was already sent immediately after verifySpiralCode above.)
                } else if (expiredCode) {
                  console.log(`Spiral code ${expiredMatchedCode} is expired`);
                  await sendInstagramDM(senderInstagramId, "This code has expired. Open the Spiral app to get a new one.");
                } else if (verifiedCode) {
                  console.log(`Spiral code ${verifiedMatchedCode} was already used`);
                  await sendInstagramDM(senderInstagramId, "This code has already been used. You're already verified.");
                } else if (potentialCodes.length > 0) {
                  // Message contained something code-shaped (6 chars in
                  // Spiral's alphabet) but none matched a real row — almost
                  // certainly a typo from a real shopper, so reply with a
                  // gentle nudge instead of staying silent. We deliberately
                  // do NOT reply when no code-shape is present at all (next
                  // branch), because that would spam strangers who DM
                  // @joinspiral with "hi"/etc.
                  console.log(`No matching Spiral code found in message. Tried: ${potentialCodes.join(", ")}`);
                  await sendInstagramDM(senderInstagramId, "That code doesn't look right. Double-check it in the Spiral app and try again.");
                } else {
                  console.log(`No code pattern found in message: ${messageText}`);
                }
              }
            }
          }
        }
      }

      // Process story_mention events (customer tags merchant in their Story)
      if (body.object === 'instagram' && body.entry) {
        for (const entry of body.entry) {
          const recipientId = entry.id;
          if (entry.messaging) {
            let hasStoryMention = false;
            // Per-event resolved global IG user IDs, keyed by sender scoped ID.
            // Used to annotate the forwarded payload so the merchant dashboard
            // can match the Story to its verification records without an extra
            // Graph API hop. Resolution happens inside handleStoryMention.
            const resolvedBySender = new Map<string, string>();
            // Per-entry merchant attribution (entry.id is one recipient/merchant
            // for all its events). Captured from handleStoryMention so the forward
            // can tell the dashboard which connected merchant the Story belongs to.
            let matchedShopDomain: string | null = null;
            let matchedMerchantBizId: string | null = null;
            // Context for the media capture (download → S3 → permanent link). One
            // story_mention per entry is the norm; the first one captured wins.
            let storyMediaCtx: { globalUserId: string | null; webhookUrl: string; webhookReceivedAt: Date; verificationId: string | null } | null = null;
            console.log(`[STORY-DIAG] dm-webhook entry.id=${entry.id} entryKeys=${Object.keys(entry).join('|')} hasMessaging=${!!entry.messaging} hasChanges=${!!(entry as any).changes}`);
            if ((entry as any).changes) {
              try { console.log(`[STORY-DIAG] dm-webhook changes=${JSON.stringify((entry as any).changes).slice(0, 600)}`); } catch {}
            }
            for (const event of entry.messaging) {
              try {
                const attTypes = Array.isArray(event.message?.attachments)
                  ? event.message.attachments.map((a: any) => a?.type).join(',')
                  : '(none)';
                console.log(`[STORY-DIAG] dm-webhook event sender=${event.sender?.id} recipient=${event.recipient?.id} eventKeys=${Object.keys(event).join('|')} msgKeys=${event.message ? Object.keys(event.message).join('|') : '-'} attTypes=${attTypes}`);
                if (Array.isArray(event.message?.attachments)) {
                  for (const a of event.message.attachments) {
                    console.log(`[STORY-DIAG] dm-webhook attachment type=${a?.type} json=${JSON.stringify(a).slice(0, 400)}`);
                  }
                }
              } catch (diagErr) {
                console.log('[STORY-DIAG] dm-webhook log failed:', String(diagErr));
              }
              if (event.message?.attachments) {
                for (const attachment of event.message.attachments) {
                  if (attachment.type === 'story_mention') {
                    hasStoryMention = true;
                    const senderScopedId = event.sender?.id;
                    const storyUrl = attachment.payload?.url || '';
                    
                    console.log(`Story mention received from scoped ID ${senderScopedId} on merchant IG ${recipientId}`);
                    console.log(`  Story URL: ${storyUrl}`);
                    
                    try {
                      const result = await handleStoryMention(recipientId, senderScopedId, storyUrl);
                      if (result.resolved && result.instagramUserId && senderScopedId) {
                        resolvedBySender.set(senderScopedId, result.instagramUserId);
                      }
                      // Attribution is only set once the merchant guard passes,
                      // so a Story tagging a different known account never names
                      // this merchant. First non-blank value wins for the entry.
                      if (result.merchantShopDomain && !matchedShopDomain) {
                        matchedShopDomain = result.merchantShopDomain;
                      }
                      if (result.merchantInstagramBusinessId && !matchedMerchantBizId) {
                        matchedMerchantBizId = result.merchantInstagramBusinessId;
                      }
                      // Capture context for the media pipeline (first story wins).
                      // globalUserId drives the canonical media lookup; webhookUrl
                      // is the fallback source; verificationId is where we persist
                      // the permanent link. Set even when unresolved so we can still
                      // download+upload the webhook media for spontaneous tags.
                      if (!storyMediaCtx) {
                        storyMediaCtx = {
                          globalUserId: result.resolved ? (result.instagramUserId ?? null) : null,
                          webhookUrl: storyUrl,
                          webhookReceivedAt: new Date(),
                          verificationId: result.resolved ? (result.verificationId ?? null) : null,
                        };
                      }
                    } catch (resolveErr) {
                      // Resolution failure must NEVER block the forward. The
                      // dashboard still gets the raw entry (without the
                      // instagramUserId annotation) so it can fall back to its
                      // own Graph API resolution.
                      console.error('Story mention handler threw — forwarding raw entry without instagramUserId annotation:', resolveErr);
                    }
                  }
                }
              }
            }
            // Fire-and-forget forward to merchant dashboard (Promotions gallery).
            // Only forwards entries that actually contained a story_mention; DM
            // verification-code messages are skipped. Each entry is shallow-cloned
            // and annotated with the resolved global IG user ID when we have one
            // — Meta's original payload object is never mutated.
            if (hasStoryMention) {
              const annotated = entry.messaging.map((event: any) => {
                const senderScopedId = event.sender?.id;
                const igUserId = senderScopedId ? resolvedBySender.get(senderScopedId) : undefined;
                return igUserId ? { ...event, instagramUserId: igUserId } : event;
              });
              const merchantForForward = {
                shopDomain: matchedShopDomain,
                instagramBusinessAccountId: matchedMerchantBizId,
              };
              // Capture the Story media (download → S3) and forward the permanent
              // link. Fire-and-forget so the 200 ack to Meta is never blocked.
              // Falls back to forwarding without a permanent link if capture can't
              // run (no context, S3 unconfigured, or download/upload failure).
              if (storyMediaCtx) {
                void captureStoryMediaAndForward(annotated, merchantForForward, storyMediaCtx);
              } else {
                void forwardStoryMentionToDashboard(annotated, merchantForForward);
              }
            }
          }
        }
      }

      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('Error processing Instagram DM webhook:', error);
      res.status(200).json({ received: true });
    }
  });

  // Helper: Fetch Instagram data by user ID via RapidAPI
  async function fetchInstagramDataByUserId(userId: string, rapidApiKey: string, preClaimedHandle?: string): Promise<{ username: string; followerCount: number; profilePicture: string }> {
    try {
      // Step 1: Try to resolve username via Graph API, fall back to pre-claimed handle
      let username = '';
      let profilePicFromGraph = '';

      const pageToken = await getJoinspiralToken();
      if (pageToken) {
        try {
          const graphUrl = `https://graph.instagram.com/v21.0/${userId}?fields=name,username,profile_pic&access_token=${pageToken}`;
          const graphRes = await fetch(graphUrl);
          const graphData = await graphRes.json() as { name?: string; username?: string; profile_pic?: string; error?: { message: string; code?: number; type?: string } };
          if (!graphData.error) {
            username = graphData.username || graphData.name || '';
            profilePicFromGraph = graphData.profile_pic || '';
          } else {
            console.error(`Graph API error:`, graphData.error.message);
            if (isInstagramAuthError(graphData.error)) {
              void markJoinspiralTokenInvalid(`sender lookup: ${graphData.error.message}`);
            }
          }
        } catch (graphErr) {
          console.error('Graph API fetch error:', graphErr);
        }
      }

      // Use pre-claimed handle if Graph API didn't return a username
      if (!username && preClaimedHandle) {
        username = preClaimedHandle;
        console.log(`Using pre-claimed handle @${username} for IGSID ${userId}`);
      }

      if (!username) {
        console.log(`No username available for IGSID ${userId} — skipping follower lookup`);
        return { username: '', followerCount: 0, profilePicture: profilePicFromGraph };
      }

      console.log(`Fetching RapidAPI data for @${username}`);

      // Step 2: Fetch profile data from new RapidAPI using username
      const rapidApiHost = 'instagram-scraper-stable-api.p.rapidapi.com';
      const scraperUrl = `https://${rapidApiHost}/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(username)}`;

      const response = await fetch(scraperUrl, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': rapidApiHost,
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`RapidAPI error (${response.status}):`, errorText);
        throw new Error(`RapidAPI request failed: ${response.status}`);
      }

      const data = await response.json() as { user_data?: { username?: string; follower_count?: number; profile_pic_url?: string; hd_profile_pic_url_info?: { url?: string } }; error?: string };
      console.log('RapidAPI Instagram user_data:', JSON.stringify(data?.user_data || {}, null, 2));

      if (data.error) {
        console.error('RapidAPI returned error (full payload):', JSON.stringify(data, null, 2));
        throw new Error(`RapidAPI error: ${data.error}`);
      }

      const userData = data.user_data || {};
      const resolvedUsername = userData.username || username;
      const followerCount = userData.follower_count || 0;
      const profilePicture = userData.profile_pic_url || userData.hd_profile_pic_url_info?.url || '';

      return { username: resolvedUsername, followerCount, profilePicture };
    } catch (error) {
      console.error('Failed to fetch Instagram data from RapidAPI:', error);
      throw error;
    }
  }

  // Resolve a handle to its account-wide Instagram numeric user ID (the `pk`
  // from public Instagram data). This is the canonical, immutable identity for
  // a person on Instagram — stable across handle changes and across all pages.
  // Meta deliberately hides this from page-scoped contexts (Graph API, DM
  // sender IDs, story_mention sender IDs are all page-scoped), so the only way
  // to obtain it is the public-data scraper. Returns null on any failure;
  // callers must treat null as "unknown" and fall back to handle matching.
  async function fetchInstagramGlobalUserIdByUsername(username: string, rapidApiKey: string): Promise<string | null> {
    if (!username) return null;
    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) return null;
    try {
      const host = 'instagram-api-fast-reliable-data-scraper.p.rapidapi.com';
      const url = `https://${host}/profile?username=${encodeURIComponent(cleanUsername)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': host,
        },
      });
      if (!res.ok) {
        console.error(`Global IG ID lookup failed for @${cleanUsername}: HTTP ${res.status}`);
        return null;
      }
      const data = await res.json() as { pk?: number | string; pk_id?: string };
      const pk = data.pk_id ?? (data.pk != null ? String(data.pk) : null);
      if (!pk) {
        console.error(`Global IG ID lookup returned no pk for @${cleanUsername}`);
        return null;
      }
      return pk;
    } catch (err) {
      console.error(`Global IG ID lookup error for @${cleanUsername}:`, err);
      return null;
    }
  }

  // Alias for the /webhooks/instagram endpoint (uses same logic)
  // Resolution result returned to the /webhooks/instagram-dm caller so it can
  // annotate the forwarded payload with the shopper's real (global) IG user ID
  // — the merchant dashboard uses this to match Stories to its verification
  // records without re-hitting the Graph API.
  type StoryMentionResolution =
    | { resolved: true; instagramUserId: string | null; verificationId?: string | null; merchantShopDomain?: string | null; merchantInstagramBusinessId?: string | null }
    | { resolved: false; merchantShopDomain?: string | null; merchantInstagramBusinessId?: string | null };

  async function handleStoryMentionWebhook(merchantInstagramId: string, senderScopedId: string, storyUrl: string): Promise<StoryMentionResolution> {
    return handleStoryMention(merchantInstagramId, senderScopedId, storyUrl);
  }

  // Single source of truth for "given a merchant + a page-scoped IG sender id,
  // who is this shopper?". Performs the full lookup-or-resolve flow:
  //   1. Scoped-id mapping hit → return cached identity (positive or negative).
  //      Touches lastSeenAt on either hit.
  //   2. Miss → Instagram Profile API (handle), RapidAPI (global numeric pk),
  //      match against Spiral customers by handle.
  //   3. On match → upsert positive mapping, backfill global id, refresh
  //      display handle on the customer record if Instagram now reports a
  //      different username for the same scoped id.
  //   4. On confirmed non-customer → write a negative-cache row so future
  //      story_mentions from this sender exit in one indexed lookup.
  //   5. On transient resolution failure (no token / Profile API down) →
  //      return `resolution: 'unresolvable'` WITHOUT writing a negative cache,
  //      so the next event retries instead of permanently blacklisting a real
  //      shopper.
  //
  // Used by:
  //   - handleStoryMention (production webhook path)
  //   - POST /api/internal/identity/resolve (universal core API)
  //
  // Mutating helper by design — every successful path either creates a mapping
  // or refreshes lastSeenAt, which is exactly what the webhook needs anyway.
  async function resolveScopedSender(settings: StoreSettings, senderScopedId: string): Promise<{
    resolution: 'positive_cache' | 'negative_cache' | 'resolved_match' | 'resolved_no_match' | 'unresolvable';
    customerId: string | null;
    customer: SpiralCustomer | null;
    instagramHandle: string | null;
    instagramGlobalUserId: string | null;
  }> {
    // Step 1: scoped-id mapping (positive OR negative cache)
    const mapping = await storage.getMerchantScopedUserMap(settings.id, senderScopedId);

    if (mapping && mapping.isSpiral === false) {
      await storage.touchMerchantScopedUserMap(mapping.id);
      console.log(`[identity] Skipping non-Spiral sender ${senderScopedId} (negative cache hit)`);
      return {
        resolution: 'negative_cache',
        customerId: null,
        customer: null,
        instagramHandle: mapping.instagramHandle ?? null,
        instagramGlobalUserId: mapping.instagramGlobalUserId ?? null,
      };
    }

    if (mapping && mapping.spiralCustomerId) {
      // Repeat sighting from a known Spiral customer — touch lastSeenAt.
      // Display-handle refresh happens at IG-connect time on the customer record.
      await storage.touchMerchantScopedUserMap(mapping.id);
      const cachedCustomer = await storage.getSpiralCustomerById(mapping.spiralCustomerId);
      return {
        resolution: 'positive_cache',
        customerId: mapping.spiralCustomerId,
        customer: cachedCustomer ?? null,
        instagramHandle: cachedCustomer?.instagramHandle ?? mapping.instagramHandle ?? null,
        instagramGlobalUserId: cachedCustomer?.instagramGlobalUserId ?? mapping.instagramGlobalUserId ?? null,
      };
    }

    // Step 2: miss — resolve username via Instagram Profile API
    console.log(`[identity] No scoped ID mapping for ${senderScopedId}, attempting profile lookup`);
    let resolvedUsername = '';
    try {
      if (settings.instagramAccessToken) {
        const profileUrl = `https://graph.instagram.com/v18.0/${senderScopedId}?fields=username&access_token=${settings.instagramAccessToken}`;
        const profileRes = await fetch(profileUrl);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          resolvedUsername = profileData.username || '';
          console.log(`[identity] Resolved scoped ID ${senderScopedId} to @${resolvedUsername}`);
        } else {
          console.log(`[identity] Could not resolve profile for ${senderScopedId} (${profileRes.status})`);
        }
      }
    } catch (err) {
      console.error('[identity] Error resolving profile:', err);
    }

    // Transient failure — DON'T negative-cache. Next event will retry.
    if (!resolvedUsername) {
      return { resolution: 'unresolvable', customerId: null, customer: null, instagramHandle: null, instagramGlobalUserId: null };
    }

    // Step 3: resolve global numeric pk via RapidAPI (persisted on both
    // positive and negative cache rows so future signups can invalidate
    // negative rows reliably across merchants).
    let resolvedGlobalUserId: string | null = null;
    if (process.env.RAPIDAPI_KEY) {
      resolvedGlobalUserId = await fetchInstagramGlobalUserIdByUsername(resolvedUsername, process.env.RAPIDAPI_KEY);
    }

    // Step 4: match against Spiral customers by handle
    const customer = await storage.getSpiralCustomerByInstagramHandle(resolvedUsername);

    if (customer) {
      // Positive: cache mapping using the customer's IMMUTABLE Instagram user
      // ID as canonical identity. Handle is display-only.
      await storage.createMerchantScopedUserMap({
        merchantId: settings.id,
        senderScopedId,
        spiralCustomerId: customer.id,
        instagramUserId: customer.instagramUserId,
        instagramGlobalUserId: resolvedGlobalUserId,
        instagramHandle: resolvedUsername,
        isSpiral: true,
      });
      // Backfill the customer's global ID if we have one and they don't.
      if (resolvedGlobalUserId && !customer.instagramGlobalUserId) {
        try {
          await storage.updateSpiralCustomerGlobalUserId(customer.id, resolvedGlobalUserId);
        } catch (err) {
          console.error('[identity] Failed to backfill customer global IG user ID:', err);
        }
      }
      // Refresh the customer's display handle if Instagram now reports a
      // different username for the same immutable user ID.
      if (customer.instagramHandle !== resolvedUsername) {
        await storage.updateSpiralCustomerHandle(customer.id, resolvedUsername);
        console.log(`[identity] Refreshed @${customer.instagramHandle} → @${resolvedUsername} for customer ${customer.id}`);
      }
      console.log(`[identity] Created scoped ID mapping: ${senderScopedId} -> customer ${customer.id} (@${resolvedUsername}, IG user id ${customer.instagramUserId ?? 'unknown'}, global IG id ${resolvedGlobalUserId ?? 'unknown'})`);
      return {
        resolution: 'resolved_match',
        customerId: customer.id,
        customer,
        instagramHandle: resolvedUsername,
        instagramGlobalUserId: resolvedGlobalUserId ?? customer.instagramGlobalUserId ?? null,
      };
    }

    // Negative: confirmed non-Spiral shopper — negative-cache row.
    await storage.recordNonSpiralScopedId(settings.id, senderScopedId, resolvedUsername, resolvedGlobalUserId);
    console.log(`[identity] No Spiral customer for @${resolvedUsername} (global IG id ${resolvedGlobalUserId ?? 'unknown'}) — negative-cached scoped ID ${senderScopedId}`);
    return {
      resolution: 'resolved_no_match',
      customerId: null,
      customer: null,
      instagramHandle: resolvedUsername,
      instagramGlobalUserId: resolvedGlobalUserId,
    };
  }

  // Handle story_mention webhook: match sender to customer and verify their pending order.
  // Returns the resolved Spiral customer's global IG user ID (when known) so the
  // outer webhook handler can attach it to the merchant-dashboard forward.
  async function handleStoryMention(merchantInstagramId: string, senderScopedId: string, storyUrl: string): Promise<StoryMentionResolution> {
    try {
      const settings = await storage.getStoreSettings();
      if (!settings) {
        console.error('Story mention: No store settings found');
        return { resolved: false };
      }

      // Update last webhook received timestamp
      await storage.updateStoreLastWebhookReceived(settings.id);

      // Check if the merchant IG ID matches our store's connected Instagram.
      // Instagram Login surfaces TWO ids for one account: the app-scoped `id`
      // (e.g. 27618…, what the dashboard may register) and the `user_id`
      // (e.g. 17841…) that Instagram actually puts in webhook entry.id. If the
      // store was registered under the app-scoped id, story webhooks arrive
      // under the user_id and never match — silently killing every verification.
      // We are single-tenant today (getStoreSettings returns the one connected
      // store), so rather than drop the story, accept it for that store and log
      // loudly. TODO(multi-tenant): look the merchant up by webhook id instead
      // of relying on the single connected store.
      const merchantMatches =
        merchantInstagramId === settings.instagramBusinessAccountId ||
        merchantInstagramId === settings.instagramPageId;
      if (!merchantMatches) {
        // Guard the fallback: only the genuine dual-id case (the webhook id is
        // recorded on NO store row) may pass. A story tagging a DIFFERENT known
        // account — e.g. @joinspiral, which has its own store_settings row — must
        // never verify this merchant's orders (that would be a verification
        // bypass), so reject when the id belongs to any other store row.
        const allStores = await storage.getAllStoreSettings();
        const belongsToOtherAccount = allStores.some(s =>
          s.id !== settings.id &&
          (merchantInstagramId === s.instagramBusinessAccountId ||
           merchantInstagramId === s.instagramPageId));
        if (belongsToOtherAccount) {
          console.log(`Story mention: merchant ${merchantInstagramId} belongs to a different connected account, not ${settings.id}; ignoring`);
          return { resolved: false };
        }
        console.warn(`[STORY-MERCHANT] webhook merchant ${merchantInstagramId} != stored biz=${settings.instagramBusinessAccountId}/page=${settings.instagramPageId} and matches no other store; accepting for single connected store ${settings.id} (Instagram Login dual-id)`);
      }

      // The merchant guard passed (direct id match or accepted dual-id fallback),
      // so this Story is attributed to `settings`. Carry the store's stable
      // identifiers back to the webhook handler so the dashboard forward can name
      // the merchant without converting between Instagram's id systems.
      const merchantAttribution = {
        merchantShopDomain: settings.shopDomain ?? null,
        merchantInstagramBusinessId: settings.instagramBusinessAccountId ?? null,
      };

      // Resolve sender via the shared identity helper (single source of truth
      // for cache hits, Profile API + RapidAPI lookups, mapping upserts, and
      // negative-caching). Same logic now powers POST /api/internal/identity/resolve.
      const resolved = await resolveScopedSender(settings, senderScopedId);
      if (resolved.resolution === 'negative_cache') {
        return { resolved: false, ...merchantAttribution };
      }
      const customerId = resolved.customerId ?? undefined;
      if (!customerId) {
        console.log(`Story mention: Could not identify customer for scoped ID ${senderScopedId} (resolution=${resolved.resolution})`);
        return { resolved: false, ...merchantAttribution };
      }

      // Step 3: Find orders that this Story can verify. Combines:
      //   (a) the current customer's own orders in any verification-eligible state, AND
      //   (b) anonymized historical orders sharing the same Instagram identity
      //       (orders.spiralCustomerId may be null after the previous account was
      //       deleted — without this, inherited debt has no resolution path).
      // Owed-by-IG covers {taken_down_early always, pending/awaiting_review/not_public
      // when delivered}; we also pull the customer's own pending/story_detected
      // pre-delivery orders so a Story posted before delivery still latches.
      const customerObj = await storage.getSpiralCustomerById(customerId);
      const customerOrders = await storage.getOrdersByCustomerId(customerId);
      const ownEligible = customerOrders.filter(o =>
        o.verificationStatus === 'pending' ||
        o.verificationStatus === 'story_detected' ||
        o.verificationStatus === 'awaiting_review' ||
        o.verificationStatus === 'not_public' ||
        o.verificationStatus === 'taken_down_early'
      );
      const igOwed = (customerObj?.instagramGlobalUserId || customerObj?.instagramUserId)
        ? await storage.getOwedOrdersByInstagramIdentity({
            instagramGlobalUserId: customerObj?.instagramGlobalUserId ?? null,
            instagramUserId: customerObj?.instagramUserId ?? null,
          })
        : [];
      const byId = new Map<string, typeof customerOrders[number]>();
      for (const o of [...ownEligible, ...igOwed]) byId.set(o.id, o);
      const pendingOrders = Array.from(byId.values());

      if (pendingOrders.length === 0) {
        console.log(`Story mention: No pending orders for customer ${customerId}`);
        // No DM — shopper will see status in-app; we don't spam non-customers either.
        // Still treat as resolved so the merchant dashboard can attribute the Story
        // to this shopper even when no Spiral order is owed (e.g. spontaneous tag).
        return { resolved: true, instagramUserId: customerObj?.instagramGlobalUserId ?? null, verificationId: null, ...merchantAttribution };
      }

      // Step 4: Verify the most recent pending order
      const orderToVerify = pendingOrders.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      console.log(`Story mention: Verifying order ${orderToVerify.id} for customer ${customerId}`);

      // Extract Instagram story media id from the webhook URL (asset_id query param) when possible.
      const storyMediaId = extractStoryMediaIdFromUrl(storyUrl);
      const webhookReceivedAt = new Date();

      // Defer verification: mark as awaiting_review and schedule a publicity cross-check ~10h out.
      let verificationId = orderToVerify.verificationId ?? null;
      const customer = await storage.getSpiralCustomerById(customerId);
      if (verificationId) {
        await storage.markStoryDetected(verificationId, storyMediaId || '', storyUrl, senderScopedId);
        await storage.markVerificationAwaitingReview(verificationId, storyMediaId);
      } else if (customer) {
        const verification = await storage.createVerification({
          orderId: orderToVerify.id,
          shopperEmail: orderToVerify.shopperEmail,
          instagramHandle: customer.instagramHandle || '',
          instagramUserId: customer.instagramUserId || '',
          followerCount: customer.followerCount || 0,
          discountAmount: orderToVerify.discountAmount,
          status: 'awaiting_review',
          storyMediaId: storyMediaId || null,
          storyUrl,
          senderScopedId,
        });
        verificationId = verification.id;
        await storage.updateOrderVerificationId(orderToVerify.id, verification.id);
      }

      await storage.updateOrderVerificationStatus(orderToVerify.id, 'awaiting_review');
      await storage.updateOrderWebhookTimestamp(orderToVerify.id);

      if (verificationId && customer?.instagramUserId) {
        // Dedupe: skip if there's already an incomplete check for this verification.
        const existing = await storage.getIncompletePublicityCheckByVerification(verificationId);
        if (existing) {
          console.log(`[publicity-check] Skipping schedule — incomplete check ${existing.id} already exists for verification ${verificationId}`);
        } else {
          // Stage 1 (quick): in ~3 min, prove the Story is publicly visible (not Close Friends).
          const scheduledAt = new Date(webhookReceivedAt.getTime() + PUBLICITY_CHECK_QUICK_DELAY_MS);
          await storage.createPublicityCheck({
            verificationId,
            orderId: orderToVerify.id,
            customerId,
            instagramUserId: customer.instagramUserId,
            senderScopedId,
            storyMediaId: storyMediaId || null,
            storyUrl,
            webhookReceivedAt,
            scheduledAt,
            stage: 'quick',
          });
          console.log(`[publicity-check] Quick check scheduled for order ${orderToVerify.id} at ${scheduledAt.toISOString()} (storyMediaId=${storyMediaId || 'none'})`);
        }
      } else {
        console.warn(`[publicity-check] Could not schedule — verificationId=${verificationId} igUserId=${customer?.instagramUserId}`);
      }

      console.log(`Story mention: Order ${orderToVerify.id} marked AWAITING_REVIEW; quick publicity check scheduled`);

      // No DM — shopper sees "Story received — confirming" status live in-app.
      return { resolved: true, instagramUserId: customerObj?.instagramGlobalUserId ?? null, verificationId, ...merchantAttribution };
    } catch (error) {
      console.error('Error handling story mention:', error);
      return { resolved: false };
    }
  }

  // Extract the Instagram story media id from a story_mention webhook URL.
  // Instagram's CDN URLs include the underlying media id as the `asset_id` query param.
  function extractStoryMediaIdFromUrl(url: string): string | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const assetId = parsed.searchParams.get('asset_id');
      if (assetId && /^\d+$/.test(assetId)) return assetId;
      return null;
    } catch {
      return null;
    }
  }

  // Deferred public-story cross-check (anti Close Friends + anti early-takedown).
  // Two-stage:
  //   - QUICK (~3 min after webhook): proves the Story is publicly visible (not Close Friends).
  //     If it fails, the customer hears about it right away — Close Friends DM.
  //   - FINAL (~10 h after webhook): proves the Story stayed up.
  //     If it fails, the customer hears the "Stories must stay up for 24 hours" message.
  // Constants
  const PUBLICITY_CHECK_QUICK_DELAY_MS = 3 * 60 * 1000;     // 3 minutes (let scraper see new story)
  const PUBLICITY_CHECK_FINAL_DELAY_MS = 10 * 60 * 60 * 1000; // 10 hours
  const PUBLICITY_CHECK_RETRY_MS = 30 * 60 * 1000;          // 30 minutes between scraper-error retries
  const PUBLICITY_CHECK_QUICK_RETRY_MS = 2 * 60 * 1000;     // 2 minutes between quick-stage retries
  const PUBLICITY_CHECK_MAX_ATTEMPTS = 3;
  // Keep retrying a quick-stage "not public" until this long after the original
  // webhook, then finalize. Time-based (not attempt-count based) so prior
  // scraper-error retries can never consume the not_public retry budget — a
  // genuinely-public Story the scraper was just slow to index keeps getting looks.
  const PUBLICITY_CHECK_QUICK_NOT_PUBLIC_WINDOW_MS = 12 * 60 * 1000; // ~12 min of grace from webhook
  const PUBLICITY_CHECK_INTERVAL_MS = 60 * 1000;            // poll every 1 min (quick checks need fast pickup)
  const PUBLICITY_CHECK_TIMESTAMP_TOLERANCE_MS = 30 * 60 * 1000; // 30 min wiggle vs webhook time

  type PublicityResult =
    | { kind: 'verified' }
    | { kind: 'not_public'; reason: 'http_404' | 'empty_story_list' | 'no_story_in_window'; detail: string }
    | { kind: 'error'; message: string };

  // Hit the RapidAPI Instagram scraper to find out whether the customer's story
  // is currently visible on the public Story tray.
  //
  // The scraper indexes stories by the shopper's GLOBAL Instagram user id (the
  // numeric profile pk) — NOT the app-scoped id that arrives on the messaging
  // webhook, and NOT the `asset_id` embedded in the story CDN URL. Earlier code
  // tried a direct `/story?id=<asset_id>` lookup and a `/stories?user_id=<scoped
  // id>` fallback; both returned a hard 404 / "invalid target user" for every
  // genuinely-public story, which then wrongly marked it not_public and soft-
  // banned the shopper.
  //
  // Strategy: list the shopper's active stories by global id and confirm a public
  // story exists inside the original webhook's time window. The scoped id is only
  // a last-ditch fallback for the rare case where the global id is missing.
  async function performPublicityScrape(
    instagramGlobalUserId: string | null,
    instagramScopedUserId: string | null,
    webhookReceivedAt: Date,
  ): Promise<PublicityResult> {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!rapidApiKey) {
      return { kind: 'error', message: 'RAPIDAPI_KEY not configured' };
    }
    const host = 'instagram-api-fast-reliable-data-scraper.p.rapidapi.com';
    const headers = {
      'x-rapidapi-key': rapidApiKey,
      'x-rapidapi-host': host,
    };

    const lookupUserId =
      (instagramGlobalUserId && instagramGlobalUserId.trim()) ||
      (instagramScopedUserId && instagramScopedUserId.trim()) ||
      null;
    if (!lookupUserId) {
      return { kind: 'error', message: 'no instagram user id available for publicity scrape' };
    }

    try {
      // List the shopper's active stories and verify a public story exists in the
      // expected time window of the original webhook.
      const listUrl = `https://${host}/stories?user_id=${encodeURIComponent(lookupUserId)}`;
      const listRes = await fetch(listUrl, { method: 'GET', headers });
      // 404 → the scraper sees no active public stories for this user.
      if (listRes.status === 404) {
        return { kind: 'not_public', reason: 'http_404', detail: `queried user_id=${lookupUserId}; scraper returned 404 (no public stories / id not recognized)` };
      }
      // Any other non-OK status (rate limit, transient upstream error, bad id) is
      // a retryable error — never an immediate "not public" soft-ban.
      if (!listRes.ok) {
        const text = await listRes.text();
        return { kind: 'error', message: `scraper /stories status ${listRes.status}: ${text.slice(0, 200)}` };
      }
      const listData = (await listRes.json()) as unknown;
      const items = extractStoryItems(listData);
      if (!items || items.length === 0) {
        return { kind: 'not_public', reason: 'empty_story_list', detail: `queried user_id=${lookupUserId}; scraper returned an empty story list (0 items)` };
      }

      const webhookSec = Math.floor(webhookReceivedAt.getTime() / 1000);
      const lo = webhookSec - Math.floor(PUBLICITY_CHECK_TIMESTAMP_TOLERANCE_MS / 1000);
      const hi = webhookSec + Math.floor(PUBLICITY_CHECK_TIMESTAMP_TOLERANCE_MS / 1000);
      const takenAts = items.map((it) => extractTakenAtSec(it));
      const inWindow = takenAts.some((taken) => taken !== null && taken >= lo && taken <= hi);
      if (inWindow) return { kind: 'verified' };
      return {
        kind: 'not_public',
        reason: 'no_story_in_window',
        detail: `queried user_id=${lookupUserId}; ${items.length} story(ies) returned but none in webhook window [${lo},${hi}] — taken_at=[${takenAts.join(',')}]`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { kind: 'error', message: msg };
    }
  }

  function extractStoryItems(data: unknown): Array<Record<string, unknown>> | null {
    if (!data || typeof data !== 'object') return null;
    // The fast-reliable scraper returns a bare top-level array of story items.
    if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
    const obj = data as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.items, obj.stories, obj.data, obj.results,
      (obj.reel as Record<string, unknown> | undefined)?.items,
      (obj.user as Record<string, unknown> | undefined)?.items,
    ];
    for (const c of candidates) {
      if (Array.isArray(c)) return c as Array<Record<string, unknown>>;
    }
    return null;
  }

  function storyIdsMatch(item: Record<string, unknown>, target: string): boolean {
    const candidates: Array<unknown> = [item.id, item.pk, item.media_id, item.story_id];
    return candidates.some((c) => {
      if (c === undefined || c === null) return false;
      const s = String(c);
      // Instagram ids sometimes appear as "{pk}_{userid}" — match the pk prefix too.
      return s === target || s.split('_')[0] === target;
    });
  }

  function extractTakenAtSec(item: Record<string, unknown>): number | null {
    const t = item.taken_at ?? item.timestamp ?? item.created_at;
    if (typeof t === 'number') return t;
    if (typeof t === 'string') {
      const n = Number(t);
      if (Number.isFinite(n)) return n;
      const d = Date.parse(t);
      if (Number.isFinite(d)) return Math.floor(d / 1000);
    }
    return null;
  }

  // ============================================
  // Story media capture (image OR video) → S3
  // ============================================
  // When a shopper posts a Story tagging the merchant, Instagram's media URL is
  // short-lived. This app owns the media pipeline: while the Story is live we
  // download the real media (photo or video) and upload a permanent copy to the
  // shared S3 bucket, then forward only the permanent link to the dashboard.

  const STORY_MEDIA_TAKEN_AT_TOLERANCE_SEC = 30 * 60; // 30 min wiggle vs webhook time
  const STORY_MEDIA_DOWNLOAD_TIMEOUT_MS = 15 * 1000;
  const STORY_MEDIA_MAX_BYTES = 60 * 1024 * 1024; // 60 MB guard (videos)

  interface ResolvedStoryMedia {
    mediaUrl: string;
    mediaType: 'image' | 'video';
  }

  // Pull the best downloadable media URL + type out of a single story item.
  // media_type: 1 = image, 2 = video. Video items still carry an image cover, so
  // prefer the video stream when present.
  function extractMediaFromStoryItem(item: Record<string, unknown>): ResolvedStoryMedia | null {
    const videoVersions = item.video_versions;
    if (Array.isArray(videoVersions) && videoVersions.length > 0) {
      const first = videoVersions[0] as Record<string, unknown>;
      const url = typeof first?.url === 'string' ? first.url : null;
      if (url) return { mediaUrl: url, mediaType: 'video' };
    }
    const iv2 = item.image_versions2 as Record<string, unknown> | undefined;
    const candidates = iv2?.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
      const first = candidates[0] as Record<string, unknown>;
      const url = typeof first?.url === 'string' ? first.url : null;
      if (url) return { mediaUrl: url, mediaType: 'image' };
    }
    return null;
  }

  // Reuse the RapidAPI stories listing (same source as the publicity check) to
  // resolve the canonical media for a just-posted Story. Indexed by GLOBAL IG id.
  // Picks the story item closest to the webhook time within tolerance. Returns
  // null on any failure so the caller falls back to Instagram's webhook URL.
  async function resolveStoryMediaForUpload(
    instagramGlobalUserId: string | null,
    webhookReceivedAt: Date,
  ): Promise<ResolvedStoryMedia | null> {
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const lookupUserId = instagramGlobalUserId && instagramGlobalUserId.trim();
    if (!rapidApiKey || !lookupUserId) return null;
    const host = 'instagram-api-fast-reliable-data-scraper.p.rapidapi.com';
    try {
      const listUrl = `https://${host}/stories?user_id=${encodeURIComponent(lookupUserId)}`;
      const listRes = await fetch(listUrl, {
        method: 'GET',
        headers: { 'x-rapidapi-key': rapidApiKey, 'x-rapidapi-host': host },
      });
      if (!listRes.ok) return null;
      const items = extractStoryItems(await listRes.json());
      if (!items || items.length === 0) return null;

      const webhookSec = Math.floor(webhookReceivedAt.getTime() / 1000);
      // Prefer the in-window story closest to the webhook time; if none fall in
      // the window, use the most recent item as a best effort.
      let best: { item: Record<string, unknown>; distance: number } | null = null;
      let newest: { item: Record<string, unknown>; taken: number } | null = null;
      for (const it of items) {
        const taken = extractTakenAtSec(it);
        if (taken === null) continue;
        if (!newest || taken > newest.taken) newest = { item: it, taken };
        const distance = Math.abs(taken - webhookSec);
        if (distance <= STORY_MEDIA_TAKEN_AT_TOLERANCE_SEC && (!best || distance < best.distance)) {
          best = { item: it, distance };
        }
      }
      const chosen = best?.item ?? newest?.item ?? items[0];
      return extractMediaFromStoryItem(chosen);
    } catch (err) {
      console.warn(`[STORY-MEDIA] stories lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  // Download media from a (short-lived) URL. Aborts on timeout and rejects
  // oversized payloads. Returns the bytes plus the server-reported content type.
  async function downloadStoryMedia(url: string): Promise<{ buffer: Buffer; contentType: string | null } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STORY_MEDIA_DOWNLOAD_TIMEOUT_MS);
    try {
      // SSRF guard. The source URL comes from webhook/RapidAPI data, so validate
      // it (protocol + private-IP rejection) before fetching, and re-validate
      // every redirect hop so a 30x can't bounce us to an internal address.
      let currentUrl = url;
      let res: Response | null = null;
      for (let hop = 0; hop < 4; hop++) {
        if (!(await isSafeProbeUrl(currentUrl))) {
          console.warn('[STORY-MEDIA] download blocked: URL failed SSRF safety check');
          return null;
        }
        res = await fetch(currentUrl, { signal: controller.signal, redirect: 'manual' });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get('location');
          if (!location) {
            console.warn('[STORY-MEDIA] download failed: redirect without location');
            return null;
          }
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }
        break;
      }
      if (!res) {
        console.warn('[STORY-MEDIA] download failed: too many redirects');
        return null;
      }
      if (!res.ok) {
        console.warn(`[STORY-MEDIA] download failed: HTTP ${res.status}`);
        return null;
      }
      const contentType = res.headers.get('content-type');
      const lenHeader = res.headers.get('content-length');
      if (lenHeader && Number(lenHeader) > STORY_MEDIA_MAX_BYTES) {
        console.warn(`[STORY-MEDIA] download skipped: content-length ${lenHeader} exceeds cap`);
        return null;
      }
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > STORY_MEDIA_MAX_BYTES) {
        console.warn(`[STORY-MEDIA] download skipped: ${arrayBuf.byteLength} bytes exceeds cap`);
        return null;
      }
      return { buffer: Buffer.from(arrayBuf), contentType };
    } catch (err) {
      console.warn(`[STORY-MEDIA] download error: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Orchestrates the full capture: resolve canonical media (fallback to webhook
  // URL) → download → upload to S3 → persist on the verification → forward to the
  // dashboard with the permanent link. Fire-and-forget; never throws. If S3 is
  // unconfigured or any step fails, the forward still goes out without
  // storyImageUrl (the raw entry still carries Instagram's link as before).
  async function captureStoryMediaAndForward(
    annotated: any[],
    merchant: { shopDomain?: string | null; instagramBusinessAccountId?: string | null },
    ctx: { globalUserId: string | null; webhookUrl: string; webhookReceivedAt: Date; verificationId: string | null },
  ): Promise<void> {
    let permanentUrl: string | null = null;
    let mediaTypeForRecord: 'image' | 'video' = 'image';
    try {
      if (!isS3Configured()) {
        // Skip the extra RapidAPI/download work when we can't store anything.
        console.warn('[STORY-MEDIA] S3 not configured — forwarding Story without permanent link');
      } else {
        const resolved = await resolveStoryMediaForUpload(ctx.globalUserId, ctx.webhookReceivedAt);
        const sourceUrl = resolved?.mediaUrl || ctx.webhookUrl;
        if (!sourceUrl) {
          console.warn('[STORY-MEDIA] no media URL available (no resolved media and no webhook URL)');
        } else {
          const downloaded = await downloadStoryMedia(sourceUrl);
          if (downloaded) {
            // Decide the real media type in priority order:
            //   1. The HTTP content type, when it's specific (not octet-stream).
            //   2. Magic-byte sniffing of the downloaded bytes (catches the case
            //      where Instagram serves video as application/octet-stream — a
            //      header content type alone would misclassify it as a photo).
            //   3. The resolved media_type hint from the stories listing.
            const hintContentType = resolved?.mediaType === 'video' ? 'video/mp4' : undefined;
            const effectiveContentType = !isGenericContentType(downloaded.contentType)
              ? downloaded.contentType
              : (sniffContentType(downloaded.buffer) || hintContentType);
            const { mediaType, ext, contentType } = classifyMedia(effectiveContentType);
            mediaTypeForRecord = mediaType;
            permanentUrl = await uploadStoryMedia(downloaded.buffer, contentType, ext);
            if (permanentUrl) {
              console.log(`[STORY-MEDIA] Uploaded ${mediaType} to ${permanentUrl}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[STORY-MEDIA] capture/upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Persist the permanent link on the verification record (best effort).
    if (permanentUrl && ctx.verificationId) {
      try {
        await storage.setVerificationStoryMedia(ctx.verificationId, permanentUrl, mediaTypeForRecord);
      } catch (err) {
        console.error(`[STORY-MEDIA] failed to persist media on verification ${ctx.verificationId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await forwardStoryMentionToDashboard(annotated, merchant, permanentUrl);
  }

  let publicityCheckBusy = false;
  async function processPublicityChecks(): Promise<void> {
    if (publicityCheckBusy) {
      console.log('[publicity-check] Tick skipped — previous run still in progress');
      return;
    }
    publicityCheckBusy = true;
    try {
      const due = await storage.getDuePublicityChecks(new Date());
      if (due.length === 0) return;
      console.log(`[publicity-check] Processing ${due.length} due check(s)`);

      for (const check of due) {
        try {
          const customerForCheck = await storage.getSpiralCustomerById(check.customerId);
          const result = await performPublicityScrape(
            customerForCheck?.instagramGlobalUserId ?? null,
            check.instagramUserId ?? null,
            check.webhookReceivedAt,
          );
          const stage = (check.stage as 'quick' | 'final') || 'quick';

          // Race guard: the scrape above is a slow network call, so an admin
          // could have rejected this Story (story invalidation) while it ran —
          // resetting the order to pending and cancelling this check. Re-read
          // the row fresh; if it was completed/cancelled out from under us, skip
          // every status write below so we don't revive an invalidated order.
          const freshCheck = await storage.getPublicityCheckById(check.id);
          if (!freshCheck || freshCheck.completedAt) {
            console.log(`[publicity-check] Check ${check.id} (order ${check.orderId}) was completed/cancelled mid-flight (likely story invalidation) — skipping status write`);
            continue;
          }

          if (result.kind === 'verified') {
            if (stage === 'quick') {
              // Story is publicly visible — not Close Friends. Schedule the final 10h re-check.
              // Order matters: create the final row FIRST (idempotently), THEN mark quick complete.
              // This way a crash between the two steps simply means the next tick re-runs the quick
              // check, sees the final already exists, and still safely marks quick complete.
              const existingFinal = await storage.getPublicityCheckByVerificationAndStage(
                check.verificationId,
                'final',
              );
              if (!existingFinal) {
                const finalScheduledAt = new Date(
                  check.webhookReceivedAt.getTime() + PUBLICITY_CHECK_FINAL_DELAY_MS,
                );
                await storage.createPublicityCheck({
                  verificationId: check.verificationId,
                  orderId: check.orderId,
                  customerId: check.customerId,
                  instagramUserId: check.instagramUserId,
                  senderScopedId: check.senderScopedId,
                  storyMediaId: check.storyMediaId,
                  storyUrl: check.storyUrl,
                  webhookReceivedAt: check.webhookReceivedAt,
                  scheduledAt: finalScheduledAt,
                  stage: 'final',
                });
                console.log(`[publicity-check] Order ${check.orderId} QUICK_PASSED — final check scheduled for ${finalScheduledAt.toISOString()}`);
              } else {
                console.log(`[publicity-check] Order ${check.orderId} QUICK_PASSED — final check already exists (${existingFinal.id})`);
              }
              await storage.recordPublicityCheckAttempt(check.id, {
                lastResult: 'quick_passed',
                completed: true,
              });
              // Quick check passed: shopper is in good standing. Auto-unbans them at checkout.
              // No push (success is silent per spec). Order shows green "Confirmed" tick in-app.
              await storage.updateOrderVerificationStatus(check.orderId, 'quick_verified');
              await maybeAutoUnbanCustomer(check.customerId);
              console.log(`[publicity-check] Order ${check.orderId} QUICK_VERIFIED — discount unlocked`);
            } else {
              // Final stage passed — confirm the verification.
              await storage.markVerified(check.verificationId);
              await storage.updateOrderVerificationStatus(check.orderId, 'verified');
              await storage.recordPublicityCheckAttempt(check.id, {
                lastResult: 'verified',
                completed: true,
              });
              // No DM, no push — shopper sees "You saved $X!" celebration in-app.
              console.log(`[publicity-check] Order ${check.orderId} VERIFIED after final cross-check`);
            }
          } else if (result.kind === 'not_public') {
            // Soft-ban only fires for orders that are already DELIVERED (per spec: a non-delivered
            // order doesn't owe a Story yet). Status update + push happen either way.
            const orderForBan = await storage.getOrderById(check.orderId);
            const isDelivered = orderForBan?.status === 'delivered';
            if (stage === 'quick') {
              // A "not public" at the QUICK stage is NOT trusted on the first look:
              // the scraper often hasn't indexed a brand-new Story 3 minutes after
              // posting, which looks identical to a Close Friends / deleted Story.
              // Keep re-checking on a short cadence until the grace window from the
              // original webhook elapses, THEN finalize the soft-ban. Time-based so a
              // genuinely-public Story that was just slow to index still passes, and
              // so unrelated scraper-error retries never eat the not_public budget.
              const elapsedMs = Date.now() - check.webhookReceivedAt.getTime();
              if (elapsedMs < PUBLICITY_CHECK_QUICK_NOT_PUBLIC_WINDOW_MS) {
                await storage.recordPublicityCheckAttempt(check.id, {
                  lastResult: `not_public_retry:${result.reason}`,
                  lastError: result.detail,
                  rescheduleAt: new Date(Date.now() + PUBLICITY_CHECK_QUICK_RETRY_MS),
                });
                console.log(`[publicity-check] Order ${check.orderId} quick not_public (reason=${result.reason}) at ${Math.round(elapsedMs / 60000)}min — retrying in ${Math.round(PUBLICITY_CHECK_QUICK_RETRY_MS / 60000)}min (grace until ${Math.round(PUBLICITY_CHECK_QUICK_NOT_PUBLIC_WINDOW_MS / 60000)}min). ${result.detail}`);
              } else {
                // Grace window elapsed — the Story genuinely isn't publicly visible.
                await storage.recordPublicityCheckAttempt(check.id, {
                  lastResult: 'deleted_or_close_friends',
                  lastError: result.detail,
                  completed: true,
                });
                await storage.updateOrderVerificationStatus(check.orderId, 'not_public');
                if (isDelivered) {
                  await storage.setCustomerSoftBanned(check.customerId, 'not_public');
                }
                // Push (fails only). Copy never threatens the existing discount — only future access.
                await sendIosPushToCustomer(
                  check.customerId,
                  'Story not public',
                  `We couldn't see your Story. New Spiral discounts are paused — repost it publicly (Close Friends doesn't count) to unlock your next one.`,
                );
                console.log(`[publicity-check] Order ${check.orderId} NOT_PUBLIC at quick stage after ${Math.round(elapsedMs / 60000)}min of retries (reason=${result.reason})${isDelivered ? ' — customer soft-banned' : ' (not yet delivered, no soft-ban)'}. ${result.detail}`);
              }
            } else {
              // Story passed quick check but is gone at the 10h mark — taken down early.
              // Per spec, final-check failure ALWAYS soft-bans (independent of delivered status).
              await storage.recordPublicityCheckAttempt(check.id, {
                lastResult: 'taken_down_early',
                completed: true,
              });
              await storage.updateOrderVerificationStatus(check.orderId, 'taken_down_early');
              await storage.setCustomerSoftBanned(check.customerId, 'taken_down_early');
              await sendIosPushToCustomer(
                check.customerId,
                'Story came down too early',
                `Spiral Stories need to stay up for 24 hours. New Spiral discounts are paused — repost yours to unlock your next one.`,
              );
              console.log(`[publicity-check] Order ${check.orderId} TAKEN_DOWN_EARLY at final stage — customer soft-banned`);
            }
          } else {
            // Scraper error — retry up to MAX_ATTEMPTS, then give up.
            const nextAttemptCount = check.attempts + 1;
            const retryDelay = stage === 'quick'
              ? PUBLICITY_CHECK_QUICK_RETRY_MS
              : PUBLICITY_CHECK_RETRY_MS;
            if (nextAttemptCount < PUBLICITY_CHECK_MAX_ATTEMPTS) {
              await storage.recordPublicityCheckAttempt(check.id, {
                lastResult: 'scraper_error',
                lastError: result.message,
                rescheduleAt: new Date(Date.now() + retryDelay),
              });
              console.warn(`[publicity-check] Order ${check.orderId} (${stage}) scraper error (will retry): ${result.message}`);
            } else {
              await storage.recordPublicityCheckAttempt(check.id, {
                lastResult: 'max_attempts_exceeded',
                lastError: result.message,
                completed: true,
              });
              console.error(`[publicity-check] Order ${check.orderId} (${stage}) max attempts exceeded: ${result.message}`);
            }
          }
        } catch (err) {
          console.error(`[publicity-check] Error processing check ${check.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[publicity-check] Worker tick failed:', err);
    } finally {
      publicityCheckBusy = false;
    }
  }

  // Owed = canonical set defined by `isOrderOwed` in shared/schema.ts.
  // Single source of truth shared with getOwedOrdersByInstagramIdentity and
  // any client-side owed-count surfaces.
  async function getOwedOrdersForCustomer(customerId: string) {
    const all = await storage.getOrdersByCustomerId(customerId);
    return all.filter(isOrderOwed);
  }

  // Cross-account Instagram-anchored owed-orders count. Returns the union of
  // owed orders across every Spiral customer that shares this Instagram identity
  // (matched by global pk OR by page-scoped IG user ID), optionally excluding
  // one customer (used when checking "do my SIBLING accounts owe a Story?").
  // Closes the soft-ban exploit where a shopper signs up with a new email but
  // the same Instagram to skip Story debt.
  async function getOwedOrdersForInstagramIdentity(opts: {
    instagramGlobalUserId?: string | null;
    instagramUserId?: string | null;
    excludeCustomerId?: string | null;
  }) {
    if (!opts.instagramGlobalUserId && !opts.instagramUserId) return [];
    // Deletion-resilient path: query orders directly by IG identity. Survives
    // customer-row deletion (orders.spiralCustomerId may be null but the
    // order keeps its IG identity columns), so the "delete + re-signup with
    // same Instagram" Story-debt exploit stays closed.
    const debtOrders = await storage.getOwedOrdersByInstagramIdentity({
      instagramGlobalUserId: opts.instagramGlobalUserId ?? null,
      instagramUserId: opts.instagramUserId ?? null,
    });
    const filtered = opts.excludeCustomerId
      ? debtOrders.filter((o) => o.spiralCustomerId !== opts.excludeCustomerId)
      : debtOrders;
    return filtered;
  }

  // Auto-unban: clears soft-ban iff shopper has zero remaining owed orders —
  // including any inherited Instagram-anchored debt from sibling accounts.
  // Also cascades the clear: when this customer's owed orders are gone, walk
  // every sibling account sharing the same Instagram identity and re-evaluate
  // their bans, since an inherited ban there might now be clearable too.
  async function maybeAutoUnbanCustomer(customerId: string): Promise<void> {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (!customer) return;
    const ownOwed = await getOwedOrdersForCustomer(customerId);
    const inheritedOwed = await getOwedOrdersForInstagramIdentity({
      instagramGlobalUserId: customer.instagramGlobalUserId,
      instagramUserId: customer.instagramUserId,
      excludeCustomerId: customerId,
    });
    if (ownOwed.length === 0 && inheritedOwed.length === 0) {
      await storage.clearCustomerSoftBan(customerId);
      console.log(`[soft-ban] Customer ${customerId} auto-unbanned (no owed orders, no IG-anchored debt)`);
    }
    // If THIS customer's owed list shrank, sibling accounts that inherited a
    // ban from this debt may now be clear too. Re-evaluate them once.
    if (ownOwed.length === 0 && (customer.instagramGlobalUserId || customer.instagramUserId)) {
      const siblings = await storage.getCustomersByInstagramIdentity({
        instagramGlobalUserId: customer.instagramGlobalUserId,
        instagramUserId: customer.instagramUserId,
      });
      for (const sib of siblings) {
        if (sib.id === customerId) continue;
        if (sib.accountStatus !== "soft_banned") continue;
        const sibOwn = await getOwedOrdersForCustomer(sib.id);
        const sibInherited = await getOwedOrdersForInstagramIdentity({
          instagramGlobalUserId: sib.instagramGlobalUserId,
          instagramUserId: sib.instagramUserId,
          excludeCustomerId: sib.id,
        });
        if (sibOwn.length === 0 && sibInherited.length === 0) {
          await storage.clearCustomerSoftBan(sib.id);
          console.log(`[soft-ban] Sibling customer ${sib.id} auto-unbanned (IG-anchored debt cleared via ${customerId})`);
        }
      }
    }
  }

  // Pure discount-eligibility calculator. Returns the same shape consumed by
  // the merchant plugin at checkout (/api/checkout/calculate-discount) and by
  // the universal core API (/api/internal/discount/calculate). Does NOT
  // include the soft-ban gate — callers are expected to call
  // evaluateSoftBanForCheckout separately and short-circuit if the shopper
  // is on hold, since the soft-ban shape is independent of discount tier
  // matching and we want to be able to surface "you have a discount AND
  // you're on hold" at different layers.
  async function calculateDiscountForCustomer(customerId: string): Promise<{
    eligible: boolean;
    reason?: string;
    discountPercent?: number;
    followerCount?: number;
    minFollowers?: number;
    tier?: { from: number; to: number | null };
    estimatedImpressions?: number;
    instagramHandle?: string | null;
    customerExists: boolean;
  }> {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (!customer) return { eligible: false, reason: 'Customer not found', customerExists: false };

    const settings = await storage.getStoreSettings();
    const tiers = await storage.getDiscountTiers();

    if (!settings?.spiralEnabled) {
      return { eligible: false, reason: 'Spiral discounts not enabled for this store', customerExists: true };
    }

    const followerCount = customer.followerCount || 0;
    const minFollowers = settings?.minFollowers || 0;
    if (followerCount < minFollowers) {
      return {
        eligible: false,
        reason: `Minimum ${minFollowers.toLocaleString()} followers required`,
        followerCount,
        minFollowers,
        customerExists: true,
      };
    }

    const matchingTier = tiers
      .sort((a, b) => a.fromFollowers - b.fromFollowers)
      .find(tier => {
        const from = tier.fromFollowers;
        const to = tier.toFollowers;
        return followerCount >= from && (to === null || followerCount <= to);
      });

    if (!matchingTier) {
      return {
        eligible: false,
        reason: 'No discount tier matches your follower count',
        followerCount,
        customerExists: true,
      };
    }

    // Power-law impressions curve (same as /api/checkout/calculate-discount).
    const reachRate = Math.max(0.06, Math.min(0.30, 0.30 * Math.pow(followerCount / 500, -0.173)));
    const estimatedImpressions = Math.round(followerCount * reachRate);

    return {
      eligible: true,
      discountPercent: parseFloat(matchingTier.discountPercent),
      followerCount,
      tier: { from: matchingTier.fromFollowers, to: matchingTier.toFollowers },
      estimatedImpressions,
      instagramHandle: customer.instagramHandle,
      customerExists: true,
    };
  }

  // Shared soft-ban evaluator for the checkout surfaces (login + pay-now).
  // Self-heals the persisted accountStatus / softBannedReason in BOTH directions:
  //   - stale ban with zero owed orders -> clears
  //   - active account with owed orders -> (re-)bans with the right reason
  //   - reason drift (own debt cleared, only inherited remains, or vice-versa) -> refreshes reason
  // Returns the structured fields the widget needs to render the "on hold" screen
  // straight from the login response (no second round-trip): brand of the most
  // recent owed order, that order's id (for the "Check your Spiral app" deep link),
  // and the canonical user-facing message.
  async function evaluateSoftBanForCheckout(customerId: string): Promise<{
    softBanned: boolean;
    softBannedReason: string | null;
    pendingVerificationCount: number;
    brandName: string | null;
    owedOrderId: string | null;
    message: string | null;
  }> {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (!customer) {
      return { softBanned: false, softBannedReason: null, pendingVerificationCount: 0, brandName: null, owedOrderId: null, message: null };
    }

    const ownOwed = await getOwedOrdersForCustomer(customerId);
    const inheritedOwed = await getOwedOrdersForInstagramIdentity({
      instagramGlobalUserId: customer.instagramGlobalUserId,
      instagramUserId: customer.instagramUserId,
      excludeCustomerId: customerId,
    });
    const totalOwedCount = ownOwed.length + inheritedOwed.length;

    if (totalOwedCount === 0) {
      if (customer.accountStatus === "soft_banned") {
        await storage.clearCustomerSoftBan(customerId);
        console.log(`[soft-ban] Customer ${customerId} auto-cleared at checkout (stale state, no owed orders)`);
      }
      return { softBanned: false, softBannedReason: null, pendingVerificationCount: 0, brandName: null, owedOrderId: null, message: null };
    }

    const inheritedOnly = ownOwed.length === 0 && inheritedOwed.length > 0;
    const effectiveReason = inheritedOnly
      ? "inherited_from_instagram"
      : (customer.softBannedReason ?? "story_owed");

    // Persist/refresh so any surface that reads /api/customer/me directly
    // (Home/Discounts banner) shows accurate state and copy.
    if (customer.accountStatus !== "soft_banned" || customer.softBannedReason !== effectiveReason) {
      try {
        await storage.setCustomerSoftBanned(customerId, effectiveReason);
      } catch (err) {
        console.error('[soft-ban] Failed to set/refresh at checkout:', err);
      }
    }

    // Most recent owed order across own + inherited drives the brand name and
    // the deep-link target. The mobile app handles rendering an inherited order
    // by resolving via IG identity.
    const combined = [...ownOwed, ...inheritedOwed].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const mostRecent = combined[0];
    const brandName = mostRecent?.storeName ?? null;
    const owedOrderId = mostRecent?.id ?? null;

    // Neutral copy that works on both surfaces (login on-hold screen + pay-now
    // fallback). Widget is responsible for any surface-specific prefix.
    let message: string;
    if (totalOwedCount > 1 && !inheritedOnly) {
      message = `Post your Stories for your ${totalOwedCount} previous Spiral orders to unlock your next discount.`;
    } else {
      const brandPart = brandName ? `your ${brandName} order` : "your previous order";
      message = `Post your Story for ${brandPart} to unlock your next discount.`;
      if (inheritedOnly) {
        message += " This debt is linked to your Instagram account.";
      }
    }

    return {
      softBanned: true,
      softBannedReason: effectiveReason,
      pendingVerificationCount: totalOwedCount,
      brandName,
      owedOrderId,
      message,
    };
  }

  // Mark an order delivered. Soft-bans the customer ONLY if this delivered order is still
  // owed (i.e. not already quick_verified or verified). Fires a single delivery reminder
  // push when soft-banned. Idempotent — safe to call multiple times.
  async function transitionOrderToDelivered(orderId: string): Promise<void> {
    const existing = await storage.getOrderById(orderId);
    if (!existing) {
      console.warn(`[delivery] Order ${orderId} not found`);
      return;
    }
    // Idempotent: if order was already delivered before this call, skip the soft-ban write
    // and reminder push entirely so duplicate Shopify events / retries don't re-spam shoppers.
    const wasAlreadyDelivered = existing.status === "delivered";
    if (wasAlreadyDelivered) {
      console.log(`[delivery] Order ${orderId} already delivered — skipping (idempotent no-op)`);
      return;
    }
    await storage.markOrderDelivered(orderId);
    if (!existing.spiralCustomerId) {
      console.log(`[delivery] Order ${orderId} marked delivered (no spiral customer linked)`);
      return;
    }
    // Delivery soft-bans whenever quick check has NOT passed for this order — that means
    // pending, awaiting_review, OR not_public (shopper posted a Close-Friends Story before
    // delivery). taken_down_early already implies a quick pass followed by a final-fail and
    // is its own (stricter) soft-ban reason — don't downgrade it. quick_verified/verified
    // are good-standing.
    const v = existing.verificationStatus;
    const quickNotPassed = v === 'pending' || v === 'awaiting_review' || v === 'not_public';
    if (quickNotPassed) {
      await storage.setCustomerSoftBanned(existing.spiralCustomerId, "delivery_pending");
      await sendIosPushToCustomer(
        existing.spiralCustomerId,
        "Time to post your Story",
        "Your order's arrived. Post a Story tagging the brand to unlock your next Spiral discount.",
      );
      console.log(`[delivery] Order ${orderId} marked delivered — customer soft-banned (story owed, verification=${v}), reminder push sent`);
    } else {
      // taken_down_early / quick_verified / verified — no reminder push, no reason overwrite.
      // Existing soft-ban (e.g. from final-fail) stays intact.
      console.log(`[delivery] Order ${orderId} marked delivered — no reminder (verification=${v})`);
    }
  }

  // Internal endpoint: fetch a customer profile by ID. Called server-to-server by the
  // merchant-dashboard Repl during order webhook handling so it can mirror the
  // customer's Instagram identity (incl. the global pk) into its own DB.
  // Guarded by the shared SPIRAL_INTERNAL_KEY header — never expose this without it.
  app.get("/api/customers/:id", requireInternalKey, async (req, res) => {
    try {
      const customer = await storage.getSpiralCustomerById(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      res.json({
        email: customer.email,
        instagramHandle: customer.instagramHandle ?? null,
        instagramUserId: customer.instagramUserId ?? null,
        instagramGlobalUserId: customer.instagramGlobalUserId ?? null,
        followerCount: customer.followerCount ?? 0,
      });
    } catch (err) {
      console.error("[internal] GET /api/customers/:id failed:", err);
      res.status(500).json({ error: "Failed to fetch customer" });
    }
  });

  // Internal endpoint: upsert a merchant's store_settings row keyed on shopDomain.
  // Called server-to-server by the merchant dashboard whenever a merchant connects
  // (or reconnects) Instagram. Without this row, story_mention webhooks can't
  // match the merchant and orders end up with no merchant handle.
  // Guarded by the shared SPIRAL_INTERNAL_KEY header — never expose without it.
  app.post("/api/merchants/register", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        shopDomain: z.string().min(1),
        storeName: z.string().min(1),
        instagramHandle: z.string().min(1),
        instagramBusinessAccountId: z.string().min(1),
        instagramPageId: z.string().min(1),
        instagramAccessToken: z.string().min(1),
        instagramProfilePictureUrl: z.string().url().optional(),
        // Honors the merchant's on/off switch from the dashboard. Optional so
        // older dashboard builds that don't send it leave the flag untouched.
        spiralEnabled: z.boolean().optional(),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: "invalid_body", details: parsed.error.flatten() });
      }

      const { shopDomain: rawDomain, storeName, instagramHandle, instagramBusinessAccountId, instagramPageId, instagramAccessToken, instagramProfilePictureUrl, spiralEnabled } = parsed.data;
      const shopDomain = rawDomain.trim().toLowerCase();
      const normalizedHandle = `@${instagramHandle.replace(/^@/, "")}`;

      await storage.upsertStoreSettingsByDomain(shopDomain, {
        storeName,
        instagramHandle: normalizedHandle,
        instagramUsername: instagramHandle.replace(/^@/, ""),
        instagramBusinessAccountId,
        instagramPageId,
        instagramAccessToken,
        instagramProfilePictureUrl,
        tokenActive: true,
        webhookSubscriptionStatus: "active",
        ...(spiralEnabled !== undefined ? { spiralEnabled } : {}),
      });

      console.log(`[MERCHANT-REGISTER] domain=${shopDomain} handle=${normalizedHandle} igBizId=${instagramBusinessAccountId} spiralEnabled=${spiralEnabled ?? "(unchanged)"}`);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("[MERCHANT-REGISTER] failed:", err);
      return res.status(500).json({ success: false, error: "internal" });
    }
  });

  // Internal admin endpoint: mark an order delivered (called by ops tooling or future
  // Shopify fulfillment_events.create webhook for `delivered` events).
  // Internal endpoint: re-register every Shopify webhook for the currently
  // connected store. Use this to backfill stores that connected before
  // fulfillment-related webhooks were added — those merchants' Shopify never
  // knew to ping us about deliveries, so their orders sit on "ordered" forever.
  // Safe to call multiple times: Shopify rejects duplicate (topic, address)
  // pairs with a 422 we just log and move on from.
  app.post("/api/internal/shopify/backfill-webhooks", requireInternalKey, async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      const creds = await getShopifyCredentialsForSettings(settings);
      if (!creds) {
        return res.status(400).json({ error: "No Shopify store connected (dashboard returned no credentials)" });
      }
      const baseUrl = process.env.SHOPIFY_APP_BASE_URL ||
        process.env.SHOPIFY_REDIRECT_URI?.replace('/shopify/callback', '');
      if (!baseUrl) return res.status(500).json({ error: "No base URL configured" });

      const topics: Array<{ topic: string; address: string }> = [
        { topic: 'orders/create', address: `${baseUrl}/webhooks/shopify/orders-create` },
        { topic: 'fulfillments/create', address: `${baseUrl}/webhooks/shopify/fulfillments-create` },
        { topic: 'fulfillments/update', address: `${baseUrl}/webhooks/shopify/fulfillments-update` },
        { topic: 'fulfillment_events/create', address: `${baseUrl}/webhooks/shopify/fulfillment-events-create` },
        { topic: 'orders/cancelled', address: `${baseUrl}/webhooks/shopify/orders-cancelled` },
        { topic: 'refunds/create', address: `${baseUrl}/webhooks/shopify/refunds-create` },
      ];
      const results: Record<string, { ok: boolean; status: number; body?: string }> = {};
      for (const t of topics) {
        try {
          const r = await fetch(`https://${creds.shopDomain}/admin/api/2024-01/webhooks.json`, {
            method: 'POST',
            headers: {
              'X-Shopify-Access-Token': creds.accessToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ webhook: { topic: t.topic, address: t.address, format: 'json' } }),
          });
          const body = r.ok ? undefined : (await r.text()).slice(0, 300);
          results[t.topic] = { ok: r.ok, status: r.status, body };
          console.log(`[shopify-backfill] ${t.topic} -> ${r.status} ${r.ok ? 'OK' : body}`);
        } catch (e) {
          results[t.topic] = { ok: false, status: 0, body: String(e) };
          console.error(`[shopify-backfill] ${t.topic} failed:`, e);
        }
      }
      res.json({ shop: creds.shopDomain, results });
    } catch (err) {
      console.error("[shopify-backfill] failed:", err);
      res.status(500).json({ error: "Failed to backfill webhooks" });
    }
  });

  // One-shot repair: find orders whose stored line items have no image and
  // re-enrich them from Shopify (by re-reading each order via its stored
  // shopify_order_id). Idempotent and safe to re-run — orders that already
  // have images, or whose products genuinely have no image in Shopify, are
  // skipped. Internal-key gated; intended to be invoked server-to-server.
  app.post("/api/internal/orders/backfill-images", requireInternalKey, async (req, res) => {
    try {
      const settings = await storage.getStoreSettings();
      const creds = await getShopifyCredentialsForSettings(settings);
      if (!creds?.shopDomain || !creds?.accessToken) {
        return res.status(400).json({ error: "No Shopify store connected (dashboard returned no credentials)" });
      }

      const allOrders = await storage.getOrders();
      const result = {
        scanned: 0,
        repaired: 0,
        skipped: 0,
        failed: 0,
        repairedOrders: [] as Array<{ orderId: string; shopifyOrderId: string }>,
      };

      for (const order of allOrders) {
        if (!order.lineItems || !order.shopifyOrderId) continue;
        let items: any[];
        try {
          items = JSON.parse(order.lineItems);
        } catch {
          continue;
        }
        if (!Array.isArray(items) || items.length === 0) continue;
        const missing = items.some((it) => it && typeof it === 'object' && !it.imageUrl);
        if (!missing) continue;

        result.scanned++;
        try {
          const imagesByTitle = await fetchOrderLineItemImages({
            shopDomain: creds.shopDomain,
            accessToken: creds.accessToken,
            shopifyOrderId: order.shopifyOrderId,
          });
          if (Object.keys(imagesByTitle).length === 0) {
            result.skipped++;
            continue;
          }
          let changed = false;
          for (const it of items) {
            if (!it || typeof it !== 'object' || it.imageUrl) continue;
            const name = (it.title || it.name || '').toString().trim().toLowerCase();
            if (name && imagesByTitle[name]) {
              it.imageUrl = imagesByTitle[name];
              changed = true;
            }
          }
          if (changed) {
            await storage.updateOrderLineItems(order.id, JSON.stringify(items));
            result.repaired++;
            result.repairedOrders.push({ orderId: order.id, shopifyOrderId: order.shopifyOrderId });
            console.log(`[backfill-images] repaired order ${order.id} (shopify ${order.shopifyOrderId})`);
          } else {
            result.skipped++;
          }
        } catch (e) {
          result.failed++;
          console.error(`[backfill-images] order ${order.id} failed:`, e);
        }
      }

      res.json(result);
    } catch (err) {
      console.error("[backfill-images] failed:", err);
      res.status(500).json({ error: "Failed to backfill order images" });
    }
  });

  app.post("/api/internal/orders/:id/mark-delivered", requireInternalKey, async (req, res) => {
    try {
      await transitionOrderToDelivered(req.params.id);
      res.json({ success: true });
    } catch (err) {
      console.error("[delivery] mark-delivered failed:", err);
      res.status(500).json({ error: "Failed to mark delivered" });
    }
  });

  // One-shot admin: force-verify a single order. Marks its verification row
  // verified, flips the order's verification_status, then re-evaluates the
  // owner's soft-ban (auto-unbans if no other debt remains).
  // TODO: remove after manual cleanup of test order 6701278429398.
  app.post("/api/internal/admin/force-verify-order/:id", requireInternalKey, async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.verificationId) {
        await storage.markVerified(order.verificationId);
      }
      await storage.updateOrderVerificationStatus(orderId, "verified", order.verificationId ?? undefined);
      if (order.spiralCustomerId) {
        await maybeAutoUnbanCustomer(order.spiralCustomerId);
      }
      const customerAfter = order.spiralCustomerId
        ? await storage.getSpiralCustomerById(order.spiralCustomerId)
        : null;
      res.json({
        success: true,
        orderId,
        verificationId: order.verificationId ?? null,
        customerStatus: customerAfter?.accountStatus ?? null,
      });
    } catch (err) {
      console.error("[admin] force-verify-order failed:", err);
      res.status(500).json({ error: "Failed to force-verify order" });
    }
  });

  // POST /api/internal/stories/invalidate
  // The merchant dashboard (and, later, the CRM) calls this when an admin
  // rejects a flagged Story. We reset the matching shopper's most-recent
  // posted order back to its pre-post state (verification → pending, captured
  // Story artifacts cleared) and re-run the soft-ban evaluator. Because the
  // order becomes owed again, the shopper auto-re-bans via the existing
  // DERIVED model — there is no manual ban command here.
  //
  // Lookup key is `instagramHandle` (the dashboard runs a separate database and
  // does NOT send our immutable global IG id; `verificationId` is opaque to us
  // and used for tracing only). `shopDomain` is advisory — single-tenant today.
  //
  // KNOWN LIMITATION: handles are mutable. If a shopper renamed their Instagram
  // between posting and the reject, the handle lookup can miss; we log a clear
  // warning and return success (best-effort caller, non-fatal). A future
  // improvement is to have the caller include the global IG id as the key.
  //
  // Idempotent: invalidating an order that is already reset (no order in a
  // posted state) is a logged no-op that still returns success.
  app.post("/api/internal/stories/invalidate", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        verificationId: z.string().min(1).optional().nullable(),
        instagramHandle: z.string().min(1),
        shopDomain: z.string().min(1).optional().nullable(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const { verificationId, instagramHandle, shopDomain } = parsed.data;
      const normalizedHandle = instagramHandle.toLowerCase().replace(/^@/, "");
      console.log(`[story-invalidate] reject received for @${normalizedHandle} (verificationId=${verificationId ?? "none"}, shopDomain=${shopDomain ?? "none"})`);

      // 1. Resolve shopper(s) by handle. Siblings can share a handle, so this
      //    returns an array.
      const customers = await storage.getSpiralCustomersByInstagramHandle(normalizedHandle);
      if (customers.length === 0) {
        console.warn(`[story-invalidate] No Spiral customer for @${normalizedHandle} — no-op. (Handle may have changed since posting; dashboard does not send the global IG id.)`);
        return res.json({ success: true, invalidated: false, reason: "no_customer_match" });
      }

      // 2. Collect every order across the matched shoppers that is in a
      //    Story-posted state (story detected / under review / verified), and
      //    key each on when the Story was actually posted (storyDetectedAt),
      //    not when the order was created — out-of-order delivery/posting means
      //    order.createdAt is the wrong ordering signal for "most-recent post".
      const POSTED_STATES = ["story_detected", "awaiting_review", "quick_verified", "verified"];
      const candidates: { order: NonNullable<Awaited<ReturnType<typeof storage.getOrderById>>>; customerId: string; postedAt: number }[] = [];
      for (const customer of customers) {
        const customerOrders = await storage.getOrdersByCustomerId(customer.id);
        for (const order of customerOrders) {
          if (!POSTED_STATES.includes(order.verificationStatus)) continue;
          let postedAt = new Date(order.createdAt).getTime();
          if (order.verificationId) {
            const v = await storage.getVerificationById(order.verificationId);
            const ts = v?.storyDetectedAt ?? v?.webhookTimestamp ?? v?.verifiedAt;
            if (ts) postedAt = new Date(ts).getTime();
          }
          candidates.push({ order, customerId: customer.id, postedAt });
        }
      }

      if (candidates.length === 0) {
        console.warn(`[story-invalidate] @${normalizedHandle} has no order in a posted state — already reset or never posted. Idempotent no-op.`);
        return res.json({ success: true, invalidated: false, reason: "no_posted_order" });
      }

      // 3. Target the most recently posted order.
      candidates.sort((a, b) => b.postedAt - a.postedAt);
      const { order: targetOrder, customerId } = candidates[0];

      // 4. Reset the verification + order to pre-post. Cancel ALL in-flight
      //    publicity checks for this verification so a scheduled quick/final
      //    check can't re-verify or re-fail the row we just reset (the worker
      //    also re-reads each check fresh before writing, as a second guard).
      if (targetOrder.verificationId) {
        await storage.resetVerificationToPending(targetOrder.verificationId);
        const cancelled = await storage.cancelIncompletePublicityChecksByVerification(
          targetOrder.verificationId,
          "invalidated_by_admin",
        );
        if (cancelled > 0) {
          console.log(`[story-invalidate] Cancelled ${cancelled} in-flight publicity check(s) for order ${targetOrder.id}.`);
        }
      }
      await storage.updateOrderVerificationStatus(targetOrder.id, "pending", targetOrder.verificationId ?? undefined);
      console.log(`[story-invalidate] Order ${targetOrder.id} reset to pending (customer ${customerId}, @${normalizedHandle}).`);

      // 5. Re-derive soft-ban. If the now-pending order is delivered it is owed
      //    again, so the evaluator re-applies the soft-ban automatically.
      const ban = await evaluateSoftBanForCheckout(customerId);

      return res.json({
        success: true,
        invalidated: true,
        orderId: targetOrder.id,
        customerId,
        softBanned: ban.softBanned,
      });
    } catch (err) {
      console.error("[story-invalidate] failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Universal Core API (Task #91)
  // Every endpoint under /api/internal/* is auth-gated by requireInternalKey
  // and intended for server-to-server use by the merchant dashboard and any
  // future ecommerce adapter (Woo, BigCommerce, …). Callers MUST NOT cache
  // negative identity results locally — every call is fast (single indexed
  // lookup on the cache hit path), and a stale local negative cache will
  // shadow our own self-healing path at signup/DM-verify time.
  // ────────────────────────────────────────────────────────────────────────

  // 1. POST /api/internal/identity/resolve
  // Given a merchant IG business account id + a page-scoped IG sender id,
  // return the canonical Spiral identity for that shopper (or a confirmed
  // non-Spiral result). Same logic as the story_mention webhook path so the
  // dashboard never has to re-implement scoped-id → customer resolution.
  app.post("/api/internal/identity/resolve", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        merchantInstagramBusinessId: z.string().min(1),
        senderScopedId: z.string().min(1),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const { merchantInstagramBusinessId, senderScopedId } = parsed.data;

      const settings = await storage.getStoreSettingsByInstagramBusinessId(merchantInstagramBusinessId);
      if (!settings) {
        return res.status(404).json({ error: "merchant_not_found" });
      }

      const resolved = await resolveScopedSender(settings, senderScopedId);
      return res.json({
        resolution: resolved.resolution,
        isSpiral: resolved.customerId !== null,
        customerId: resolved.customerId,
        instagramHandle: resolved.instagramHandle,
        instagramUserId: resolved.customer?.instagramUserId ?? null,
        instagramGlobalUserId: resolved.instagramGlobalUserId,
        followerCount: resolved.customer?.followerCount ?? null,
      });
    } catch (err) {
      console.error("[internal] identity/resolve failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 2. GET /api/internal/customers/by-instagram?handle=…&userId=…&globalUserId=…
  // Find Spiral customers by any one (or combination) of IG identity fields.
  // Returns an array because the same IG identity can map to multiple Spiral
  // customer rows (the soft-ban inheritance model is built on this).
  app.get("/api/internal/customers/by-instagram", requireInternalKey, async (req, res) => {
    try {
      const handle = typeof req.query.handle === "string" ? req.query.handle.trim().replace(/^@/, "") : null;
      const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : null;
      const globalUserId = typeof req.query.globalUserId === "string" ? req.query.globalUserId.trim() : null;

      if (!handle && !userId && !globalUserId) {
        return res.status(400).json({ error: "must_provide_one_of_handle_userId_globalUserId" });
      }

      const seen = new Map<string, SpiralCustomer>();
      if (userId || globalUserId) {
        const byId = await storage.getCustomersByInstagramIdentity({
          instagramGlobalUserId: globalUserId,
          instagramUserId: userId,
        });
        for (const c of byId) seen.set(c.id, c);
      }
      if (handle) {
        // Handle is non-unique (siblings can share). Use the multi-row lookup
        // so inheritance-related queries return every match, not just the first.
        const byHandle = await storage.getSpiralCustomersByInstagramHandle(handle);
        for (const c of byHandle) seen.set(c.id, c);
      }

      const customers = Array.from(seen.values()).map(c => ({
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        instagramHandle: c.instagramHandle ?? null,
        instagramUserId: c.instagramUserId ?? null,
        instagramGlobalUserId: c.instagramGlobalUserId ?? null,
        followerCount: c.followerCount ?? 0,
        accountStatus: c.accountStatus,
        softBannedReason: c.softBannedReason ?? null,
      }));
      return res.json({ customers });
    } catch (err) {
      console.error("[internal] customers/by-instagram failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 2b. POST /api/internal/customers/lookup-by-handle
  // Hot-path yes/no check used by the merchant dashboard's product-page teaser
  // widget: does this Instagram handle belong to a registered Spiral shopper?
  // Lets the widget render "Login →" vs "Join Spiral →". Single case-insensitive
  // handle lookup; a miss is a 200 with { isSpiral: false } (never 404) so the
  // caller's 3s-timeout/degrade path only triggers on real failures.
  app.post("/api/internal/customers/lookup-by-handle", requireInternalKey, async (req, res) => {
    try {
      const raw = req.body?.instagramHandle;
      const handle = typeof raw === "string" ? raw.trim().replace(/^@/, "") : "";
      if (!handle) {
        return res.status(400).json({ error: "must_provide_instagramHandle" });
      }
      // Storage lookup already normalizes case + strips a leading @.
      const customer = await storage.getSpiralCustomerByInstagramHandle(handle);
      if (!customer) {
        return res.json({ isSpiral: false });
      }
      return res.json({ isSpiral: true, customerId: customer.id });
    } catch (err) {
      console.error("[internal] customers/lookup-by-handle failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 3. GET /api/internal/identity/:globalUserId/verifications
  // Every verification row attached to any order owned by this Instagram
  // identity. Survives spiral_customers deletion (orders are anonymized but
  // keep their IG identity columns). Lets the merchant dashboard render a
  // Story-history timeline keyed off IG identity, not customer id.
  // Accepts either the global numeric pk OR the page-scoped IG user id via
  // ?fallbackUserId= — global is preferred but not always available.
  app.get("/api/internal/identity/:globalUserId/verifications", requireInternalKey, async (req, res) => {
    try {
      const globalUserId = req.params.globalUserId === "_" ? null : req.params.globalUserId;
      const fallbackUserId = typeof req.query.fallbackUserId === "string" ? req.query.fallbackUserId.trim() : null;
      if (!globalUserId && !fallbackUserId) {
        return res.status(400).json({ error: "must_provide_globalUserId_or_fallbackUserId" });
      }
      const verifications = await storage.getVerificationsByInstagramIdentity({
        instagramGlobalUserId: globalUserId,
        instagramUserId: fallbackUserId,
      });
      return res.json({
        verifications: verifications.map(v => ({
          id: v.id,
          orderId: v.orderId,
          orderStatus: v.orderStatus,
          orderVerificationStatus: v.orderVerificationStatus,
          status: v.status,
          instagramHandle: v.instagramHandle,
          instagramUserId: v.instagramUserId,
          storyMediaId: v.storyMediaId ?? null,
          storyUrl: v.storyUrl ?? null,
          storyDetectedAt: v.storyDetectedAt ?? null,
          verifiedAt: v.verifiedAt ?? null,
          createdAt: v.createdAt,
        })),
      });
    } catch (err) {
      console.error("[internal] identity/verifications failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 4. POST /api/internal/discount/calculate
  // Pure eligibility + tier match for a given customer. Mirrors the
  // /api/checkout/calculate-discount payload (sans soft-ban gate — that's a
  // separate endpoint). Lets storefront adapters compute discounts from
  // their server without re-implementing the tier-matching curve.
  app.post("/api/internal/discount/calculate", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({ customerId: z.string().min(1) });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const result = await calculateDiscountForCustomer(parsed.data.customerId);
      if (!result.customerExists) {
        return res.status(404).json({ error: "customer_not_found" });
      }
      const { customerExists, ...payload } = result;
      return res.json(payload);
    } catch (err) {
      console.error("[internal] discount/calculate failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 5. GET /api/internal/customers/:customerId/soft-ban-status
  // Read-through soft-ban evaluator. Self-heals stale state in both
  // directions (clears expired bans, re-applies bans with refreshed reasons)
  // and returns the canonical payload the checkout widget renders the
  // "on hold" screen from. Safe to call as often as needed.
  app.get("/api/internal/customers/:customerId/soft-ban-status", requireInternalKey, async (req, res) => {
    try {
      const ban = await evaluateSoftBanForCheckout(req.params.customerId);
      return res.json(ban);
    } catch (err) {
      console.error("[internal] soft-ban-status failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 6. GET /api/internal/merchants/:merchantInstagramBusinessId/discount-tiers
  // Tier config for a merchant. Includes the merchant's minFollowers floor +
  // whether Spiral discounts are currently enabled, so storefront adapters
  // have the full picture in one call.
  //
  // NOTE: Spiral is single-tenant today — `store_settings` is a single row and
  // `discount_tiers` is global. We still validate the merchant by IG business
  // ID so callers get a 404 for unknown merchants (and so this endpoint stays
  // forward-compatible: when tiers gain a merchantId column, only the storage
  // call here and inside `calculateDiscountForCustomer` need to change).
  app.get("/api/internal/merchants/:merchantInstagramBusinessId/discount-tiers", requireInternalKey, async (req, res) => {
    try {
      const settings = await storage.getStoreSettingsByInstagramBusinessId(req.params.merchantInstagramBusinessId);
      if (!settings) {
        return res.status(404).json({ error: "merchant_not_found" });
      }
      const tiers = await storage.getDiscountTiers();
      return res.json({
        merchantId: settings.id,
        storeName: settings.storeName,
        instagramHandle: settings.instagramHandle,
        spiralEnabled: settings.spiralEnabled,
        minFollowers: settings.minFollowers ?? 0,
        tiers: tiers
          .sort((a, b) => a.fromFollowers - b.fromFollowers)
          .map(t => ({
            id: t.id,
            fromFollowers: t.fromFollowers,
            toFollowers: t.toFollowers,
            discountPercent: parseFloat(t.discountPercent),
          })),
      });
    } catch (err) {
      console.error("[internal] discount-tiers failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // 7. POST /api/internal/push/send
  // Trigger one of the three canonical iOS pushes (delivery-reminder,
  // quick-fail, final-fail) for a specific customer. Copy is fixed per kind
  // (never accepted from the caller) to keep brand voice + App Store rules
  // consistent. Pushes are reminders/failures only — successes are surfaced
  // in-app and MUST NOT be pushed.
  app.post("/api/internal/push/send", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        customerId: z.string().min(1),
        kind: z.enum(["delivery-reminder", "quick-fail", "final-fail"]),
        brandName: z.string().min(1).optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const { customerId, kind, brandName } = parsed.data;
      const brandPart = brandName ? ` from ${brandName}` : "";
      let title = "";
      let body = "";
      switch (kind) {
        case "delivery-reminder":
          title = "Your order's here";
          body = `Post your Story${brandPart} to unlock your next Spiral discount.`;
          break;
        case "quick-fail":
          title = "We couldn't see your Story";
          body = `Looks like your Story was Close Friends or already gone. Repost it publicly${brandPart} to unlock your next discount.`;
          break;
        case "final-fail":
          title = "Your Story came down early";
          body = `Stories need to stay up for 24h. Repost${brandPart} to unlock your next discount.`;
          break;
      }
      const sent = await sendIosPushToCustomer(customerId, title, body);
      return res.json({ sent });
    } catch (err) {
      console.error("[internal] push/send failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // ── CRM Internal Admin API (/api/internal/crm/*) ───────────────────────────
  // Server-to-server surface for the separate Spiral CRM project to browse,
  // search, view, edit, soft-ban and delete shoppers and view orders. This app
  // remains the single source of truth — the CRM holds NO duplicate datastore
  // and calls these endpoints instead. All routes gated by requireInternalKey.
  //
  // Every customer payload is whitelisted through crmCustomerView, which NEVER
  // emits credentials or other secrets (passwordHash, instagramAccessToken,
  // iosPushToken, unsubscribeToken, email-verification codes, welcome-DM
  // diagnostics). Add fields here explicitly — do not spread the raw row.
  const crmCustomerView = (c: SpiralCustomer) => ({
    id: c.id,
    email: c.email,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    emailVerified: c.emailVerified,
    instagramHandle: c.instagramHandle ?? null,
    instagramUserId: c.instagramUserId ?? null,
    instagramGlobalUserId: c.instagramGlobalUserId ?? null,
    instagramProfilePicture: c.instagramProfilePicture ?? null,
    instagramAccountType: c.instagramAccountType ?? null,
    followerCount: c.followerCount ?? null,
    followerCountUpdatedAt: c.followerCountUpdatedAt ?? null,
    dateOfBirth: c.dateOfBirth ?? null,
    address: c.address ?? null,
    country: c.country ?? null,
    accountStatus: c.accountStatus,
    softBannedReason: c.softBannedReason ?? null,
    softBannedAt: c.softBannedAt ?? null,
    marketingEmailOptOut: c.marketingEmailOptOut,
    isActive: c.isActive,
    createdAt: c.createdAt,
    lastLoginAt: c.lastLoginAt ?? null,
  });

  // Orders carry no credentials, but we still project an explicit view so the
  // CRM contract stays stable if columns are added later.
  const crmOrderView = (o: Order) => ({
    id: o.id,
    shopifyOrderId: o.shopifyOrderId,
    shopperEmail: o.shopperEmail,
    spiralCustomerId: o.spiralCustomerId ?? null,
    instagramHandle: o.instagramHandle ?? null,
    instagramUserId: o.instagramUserId ?? null,
    instagramGlobalUserId: o.instagramGlobalUserId ?? null,
    followerCount: o.followerCount ?? null,
    discountPercent: o.discountPercent,
    orderTotal: o.orderTotal,
    shippingAmount: o.shippingAmount ?? null,
    discountAmount: o.discountAmount,
    status: o.status,
    verificationStatus: o.verificationStatus,
    fulfilledAt: o.fulfilledAt ?? null,
    deliveredAt: o.deliveredAt ?? null,
    shopifyTrackingStatus: o.shopifyTrackingStatus ?? null,
    storeName: o.storeName ?? null,
    merchantInstagramHandle: o.merchantInstagramHandle ?? null,
    lineItems: o.lineItems ?? null,
    createdAt: o.createdAt,
  });

  // GET /api/internal/crm/customers?page=&limit=&q=
  // Paginated, searchable shopper directory. Search matches name / email / IG
  // handle (case-insensitive). Returns summary rows + total for pagination.
  app.get("/api/internal/crm/customers", requireInternalKey, async (req, res) => {
    try {
      const page = parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1;
      const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "25", 10) || 25;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const { items, total, page: effectivePage, limit: effectiveLimit } = await storage.listSpiralCustomers({ page, limit, q });
      return res.json({ items: items.map(crmCustomerView), total, page: effectivePage, limit: effectiveLimit });
    } catch (err) {
      console.error("[crm] list customers failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // GET /api/internal/crm/customers/:id
  // Full shopper profile + their order history + Story (verification) history.
  app.get("/api/internal/crm/customers/:id", requireInternalKey, async (req, res) => {
    try {
      const customer = await storage.getSpiralCustomerById(req.params.id);
      if (!customer) {
        return res.status(404).json({ error: "customer_not_found" });
      }
      const [customerOrders, verifications] = await Promise.all([
        storage.getOrdersByCustomerId(customer.id),
        storage.getVerificationsByInstagramIdentity({
          instagramGlobalUserId: customer.instagramGlobalUserId,
          instagramUserId: customer.instagramUserId,
        }),
      ]);
      return res.json({
        customer: crmCustomerView(customer),
        orders: customerOrders.map(crmOrderView),
        verifications: verifications.map(v => ({
          id: v.id,
          orderId: v.orderId,
          orderStatus: v.orderStatus,
          orderVerificationStatus: v.orderVerificationStatus,
          status: v.status,
          instagramHandle: v.instagramHandle,
          instagramUserId: v.instagramUserId,
          storyMediaUrl: v.storyMediaUrl ?? null,
          storyMediaType: v.storyMediaType ?? null,
          storyDetectedAt: v.storyDetectedAt ?? null,
          verifiedAt: v.verifiedAt ?? null,
          createdAt: v.createdAt,
        })),
      });
    } catch (err) {
      console.error("[crm] get customer failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // PATCH /api/internal/crm/customers/:id
  // Edit a shopper's editable profile fields (name / DOB / address / country).
  // Identity, credentials and IG linkage are intentionally NOT editable here.
  app.patch("/api/internal/crm/customers/:id", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({
        firstName: z.string().trim().max(100).nullable().optional(),
        lastName: z.string().trim().max(100).nullable().optional(),
        dateOfBirth: z.string().trim().max(40).nullable().optional(),
        address: z.string().trim().max(500).nullable().optional(),
        country: z.string().trim().max(100).nullable().optional(),
      });
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      }
      if (Object.keys(parsed.data).length === 0) {
        return res.status(400).json({ error: "no_fields_to_update" });
      }
      const existing = await storage.getSpiralCustomerById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "customer_not_found" });
      }
      const updated = await storage.updateSpiralCustomerProfile(req.params.id, parsed.data);
      return res.json({ customer: crmCustomerView(updated) });
    } catch (err) {
      console.error("[crm] patch customer failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // DELETE /api/internal/crm/customers/:id
  // Hard-delete a shopper (same path as in-app account deletion): removes the
  // account + locally-owned rows and anonymizes their orders so historical
  // analytics survive. Irreversible.
  app.delete("/api/internal/crm/customers/:id", requireInternalKey, async (req, res) => {
    try {
      const existing = await storage.getSpiralCustomerById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "customer_not_found" });
      }
      await storage.deleteSpiralCustomerCompletely(req.params.id);
      console.log(`[crm] customer ${req.params.id} hard-deleted via CRM admin`);
      return res.json({ success: true });
    } catch (err) {
      console.error("[crm] delete customer failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // POST /api/internal/crm/customers/:id/soft-ban
  // Manually place a shopper on hold. Reason defaults to a manual admin tag.
  // Note: the derived soft-ban model self-heals at checkout, so a manual ban on
  // a shopper who owes nothing will be auto-cleared the next time they shop.
  app.post("/api/internal/crm/customers/:id/soft-ban", requireInternalKey, async (req, res) => {
    try {
      const bodySchema = z.object({ reason: z.string().trim().min(1).max(100).optional() });
      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      }
      const existing = await storage.getSpiralCustomerById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "customer_not_found" });
      }
      await storage.setCustomerSoftBanned(req.params.id, parsed.data.reason ?? "manual_admin");
      const updated = await storage.getSpiralCustomerById(req.params.id);
      console.log(`[crm] customer ${req.params.id} soft-banned via CRM admin (reason=${parsed.data.reason ?? "manual_admin"})`);
      return res.json({ customer: updated ? crmCustomerView(updated) : null });
    } catch (err) {
      console.error("[crm] soft-ban customer failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // POST /api/internal/crm/customers/:id/clear-soft-ban
  // Manually lift a shopper's hold. This is a force-clear admin override; the
  // derived model may re-apply it at the shopper's next checkout if they still
  // owe a Story (own debt or IG-anchored sibling debt).
  app.post("/api/internal/crm/customers/:id/clear-soft-ban", requireInternalKey, async (req, res) => {
    try {
      const existing = await storage.getSpiralCustomerById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "customer_not_found" });
      }
      await storage.clearCustomerSoftBan(req.params.id);
      const updated = await storage.getSpiralCustomerById(req.params.id);
      console.log(`[crm] customer ${req.params.id} soft-ban cleared via CRM admin`);
      return res.json({ customer: updated ? crmCustomerView(updated) : null });
    } catch (err) {
      console.error("[crm] clear-soft-ban customer failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // GET /api/internal/crm/orders?page=&limit=&q=
  // Paginated, searchable order list. Search matches shopper email / IG handle /
  // Shopify order id / store name (case-insensitive). Returns rows + total.
  app.get("/api/internal/crm/orders", requireInternalKey, async (req, res) => {
    try {
      const page = parseInt(typeof req.query.page === "string" ? req.query.page : "1", 10) || 1;
      const limit = parseInt(typeof req.query.limit === "string" ? req.query.limit : "25", 10) || 25;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const { items, total, page: effectivePage, limit: effectiveLimit } = await storage.listOrders({ page, limit, q });
      return res.json({ items: items.map(crmOrderView), total, page: effectivePage, limit: effectiveLimit });
    } catch (err) {
      console.error("[crm] list orders failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // GET /api/internal/crm/orders/:id
  // Full order plus the owning shopper (sanitized) when still linked.
  app.get("/api/internal/crm/orders/:id", requireInternalKey, async (req, res) => {
    try {
      const order = await storage.getOrderById(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "order_not_found" });
      }
      let customer: ReturnType<typeof crmCustomerView> | null = null;
      if (order.spiralCustomerId) {
        const owner = await storage.getSpiralCustomerById(order.spiralCustomerId);
        if (owner) customer = crmCustomerView(owner);
      }
      return res.json({ order: crmOrderView(order), customer });
    } catch (err) {
      console.error("[crm] get order failed:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // iOS push notification helpers.
  // Used ONLY for failure/reminder notifications — never for successful verifications (per spec).
  // Copy must NEVER threaten the existing discount on the order being notified about; only
  // mention impact on FUTURE Spiral discounts.
  // APNs is wired via @parse/node-apn. The provider is lazily built on first send so that
  // missing credentials in dev simply fall back to log-only mode without crashing the server.
  type ApnsResponse = { failed?: Array<{ response?: unknown; error?: unknown }> };
  interface ApnsNotification {
    alert: { title: string; body: string };
    topic: string;
    sound: string;
    contentAvailable: boolean;
  }
  interface ApnsProvider {
    send(note: ApnsNotification, token: string): Promise<ApnsResponse>;
  }
  interface ApnsModule {
    Provider: new (opts: {
      token: { key: string; keyId: string; teamId: string };
      production: boolean;
    }) => ApnsProvider;
    Notification: new () => ApnsNotification;
  }

  let apnsProvider: ApnsProvider | null = null;
  let apnsModule: ApnsModule | null = null;
  let apnsProviderInitFailed = false;

  async function loadApnsModule(): Promise<ApnsModule | null> {
    if (apnsModule) return apnsModule;
    try {
      apnsModule = (await import('@parse/node-apn')) as unknown as ApnsModule;
      return apnsModule;
    } catch (err) {
      console.error('[PUSH] Failed to import @parse/node-apn:', err);
      return null;
    }
  }

  async function getApnsProvider(): Promise<ApnsProvider | null> {
    if (apnsProvider || apnsProviderInitFailed) return apnsProvider;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID;
    const key = process.env.APNS_PRIVATE_KEY;
    if (!keyId || !teamId || !key) return null;
    const apn = await loadApnsModule();
    if (!apn) {
      apnsProviderInitFailed = true;
      return null;
    }
    try {
      apnsProvider = new apn.Provider({
        token: { key, keyId, teamId },
        production: process.env.NODE_ENV === 'production',
      });
      console.log('[PUSH] APNs provider initialized');
      return apnsProvider;
    } catch (err) {
      apnsProviderInitFailed = true;
      console.error('[PUSH] Failed to initialize APNs provider:', err);
      return null;
    }
  }

  async function sendIosPush(token: string, title: string, body: string): Promise<boolean> {
    try {
      const bundleId = process.env.APNS_BUNDLE_ID;
      const provider = await getApnsProvider();
      if (!provider || !bundleId) {
        console.log(`[PUSH] (log-only, APNs not configured) → token=${token.slice(0, 8)}… "${title}" — ${body}`);
        return true;
      }
      const apn = await loadApnsModule();
      if (!apn) return false;
      const note = new apn.Notification();
      note.alert = { title, body };
      note.topic = bundleId;
      note.sound = 'default';
      note.contentAvailable = false;
      const result = await provider.send(note, token);
      if (result.failed && result.failed.length > 0) {
        console.error(`[PUSH] APNs send failed:`, result.failed[0]?.response ?? result.failed[0]);
        return false;
      }
      console.log(`[PUSH] APNs sent → token=${token.slice(0, 8)}… "${title}"`);
      return true;
    } catch (err) {
      console.error('[PUSH] send failed:', err);
      return false;
    }
  }

  async function sendIosPushToCustomer(customerId: string, title: string, body: string): Promise<boolean> {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (!customer?.iosPushToken) {
      console.log(`[PUSH] Skipped — customer ${customerId} has no iOS push token`);
      return false;
    }
    return sendIosPush(customer.iosPushToken, title, body);
  }

  type InstagramDmResult =
    | { ok: true; messageId: string | null; recipientId: string; endpoint: string }
    | { ok: false; reason: "skipped_no_token"; hasAccessToken: boolean }
    | { ok: false; reason: "meta_error"; httpStatus: number; endpoint: string; metaErrorCode?: number; metaErrorSubcode?: number; metaErrorType?: string; metaErrorMessage?: string; fbtraceId?: string }
    | { ok: false; reason: "threw"; errorMessage: string; endpoint?: string };

  async function sendInstagramDM(recipientId: string, message: string): Promise<InstagramDmResult> {
    let endpoint: string | undefined;
    try {
      const accessToken = await getJoinspiralToken();

      if (!accessToken) {
        console.error('[IG DM] Skipping send — missing access token');
        return { ok: false, reason: "skipped_no_token", hasAccessToken: false };
      }

      // SPIRAL_INSTAGRAM_ACCESS_TOKEN is an Instagram Graph API token (IGAA…
      // prefix) issued through the Instagram Login flow for @joinspiral, NOT
      // a Facebook Page token. The matching messaging endpoint is therefore
      // graph.instagram.com/v21.0/me/messages — sending it to
      // graph.facebook.com/{pageId}/messages returns HTTP 401 / OAuthException
      // 190 "Cannot parse access token", because that host expects a Page
      // token shape. `me` resolves to @joinspiral's IG user from the token.
      endpoint = `https://graph.instagram.com/v21.0/me/messages`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          messaging_type: 'RESPONSE',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as {
          error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string; type?: string };
        };
        console.error('[IG DM] Send failed', {
          httpStatus: response.status,
          recipientId,
          metaErrorCode: errorData?.error?.code,
          metaErrorSubcode: errorData?.error?.error_subcode,
          metaErrorType: errorData?.error?.type,
          metaErrorMessage: errorData?.error?.message,
          fbtraceId: errorData?.error?.fbtrace_id,
        });
        if (isInstagramAuthError(errorData?.error)) {
          void markJoinspiralTokenInvalid(`DM send code=${errorData?.error?.code ?? response.status}`);
        }
        return {
          ok: false,
          reason: "meta_error",
          httpStatus: response.status,
          endpoint,
          metaErrorCode: errorData?.error?.code,
          metaErrorSubcode: errorData?.error?.error_subcode,
          metaErrorType: errorData?.error?.type,
          metaErrorMessage: errorData?.error?.message,
          fbtraceId: errorData?.error?.fbtrace_id,
        };
      }

      const okData = await response.json().catch(() => ({})) as { message_id?: string; recipient_id?: string };
      console.log(`[IG DM] Sent to ${recipientId} (message_id=${okData?.message_id ?? 'unknown'}): "${message}"`);
      return { ok: true, messageId: okData?.message_id ?? null, recipientId, endpoint };
    } catch (error) {
      console.error('[IG DM] Send threw:', error);
      return { ok: false, reason: "threw", errorMessage: error instanceof Error ? error.message : String(error), endpoint };
    }
  }

  // Brands marketplace — proxy + cache the merchant dashboard's public /api/brands
  const BRANDS_CACHE_TTL_MS = 5 * 60 * 1000;
  const MERCHANT_BRANDS_URL = "https://spiral-merchant-dashboard.replit.app/api/brands";
  const { runClassificationCycle } = await import("./categoryClassifier");
  const CLASSIFIER_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
  const CLASSIFIER_FIRST_RUN_DELAY_MS = 90 * 1000;
  const httpUrl = z
    .string()
    .url()
    .refine((u) => /^https?:$/i.test(new URL(u).protocol), {
      message: "Only http(s) URLs are allowed",
    });
  // Upstream brand record from the merchant dashboard. `id` and
  // `categoryClassifiedAt` are required for the classifier worker; the rest
  // are surfaced to the marketplace UI.
  const brandSchema = z.object({
    id: z.string(),
    storeName: z.string(),
    storefrontUrl: httpUrl,
    // Canonical Shopify `*.myshopify.com` domain, lowercased, no scheme/path.
    // Provided by the merchant dashboard so we can match orders to brands by
    // the exact value Shopify sends in the `X-Shopify-Shop-Domain` webhook
    // header (which is always the myshopify domain, never the custom one).
    // Optional during the rollout window — older brand records may still be
    // missing it, in which case we fall back to `storefrontUrl` host matching.
    shopDomain: z.string().nullable().optional(),
    instagramUsername: z.string().nullable().optional(),
    instagramProfilePictureUrl: httpUrl.nullable().optional(),
    primaryCategory: z.string().nullable().optional(),
    secondaryCategories: z.array(z.string()).nullable().optional(),
    categoryClassifiedAt: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    shippingCountries: z.array(z.string()).nullable().optional(),
    selectedProductCount: z.number().int().nonnegative().nullable().optional(),
    // Optional during the rollout window — once the merchant dashboard is
    // deployed with this field, any record missing it is treated as enabled
    // (truthy) but logged so we can spot regressions. See `shapeListForClient`
    // and `getKnownBrandIds` for the defensive filter.
    spiralEnabled: z.boolean().nullable().optional(),
    // Per-brand Spiral discount rules. Used by the marketplace to render
    // each shopper's personalized price (strikethrough original + discounted)
    // without an extra round trip per brand. Optional during rollout — a
    // missing or empty `discountTiers` is treated as "no Spiral discount
    // available at this store" and the marketplace falls back to original
    // prices only.
    minFollowers: z.number().int().nonnegative().nullable().optional(),
    discountTiers: z
      .array(
        z.object({
          fromFollowers: z.number().int().nonnegative(),
          toFollowers: z.number().int().nonnegative().nullable(),
          discountPercent: z.number().nonnegative(),
        }),
      )
      .nullable()
      .optional(),
    // Recent Instagram media for the marketplace hero slideshow. Provided
    // by the merchant dashboard, which holds the per-merchant access tokens
    // and is responsible for refreshing the IG CDN URLs before they expire.
    // Optional during rollout — missing or empty means the shopper card
    // falls back to a static product-image hero. Malformed items are
    // dropped individually so one bad post can't blank the slideshow.
    instagramMedia: z
      .array(z.unknown())
      .transform((arr) =>
        arr
          .map((item) => {
            const parsed = z
              .object({
                mediaUrl: httpUrl,
                mediaType: z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM", "REELS"]),
                thumbnailUrl: httpUrl.nullable().optional(),
              })
              .safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((m): m is { mediaUrl: string; mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS"; thumbnailUrl?: string | null } => m !== null),
      )
      .nullable()
      .optional(),
  });
  // Drop individual brands that fail validation (rather than 502 the whole list)
  // so one bad merchant record can't break the marketplace for everyone.
  const brandsResponseSchema = z.array(z.unknown()).transform((arr) =>
    arr
      .map((item) => {
        const parsed = brandSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((b): b is z.infer<typeof brandSchema> => b !== null),
  );
  type UpstreamBrand = z.infer<typeof brandSchema>;
  type CachedBrands = UpstreamBrand[];
  let brandsCache: { data: CachedBrands; fetchedAt: number } | null = null;

  // Normalize a Shopify-style domain or storefront URL down to a comparable
  // host: lowercased, no scheme, no `www.`, no trailing slash or path.
  function normalizeDomain(input: string | null | undefined): string | null {
    if (!input) return null;
    let host = input.trim().toLowerCase();
    if (!host) return null;
    try {
      if (host.includes("://")) {
        host = new URL(host).host;
      }
    } catch { /* fall through, treat as raw host */ }
    host = host.replace(/^www\./, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
    return host || null;
  }

  // Look up the merchant's Instagram handle for a given Shopify shop domain
  // by matching against the brands feed's `storefrontUrl`. Warms the brands
  // cache on demand. Returns the handle stripped of any leading `@`, or null
  // if the brand or its handle is missing. Used at order-creation time to
  // snapshot the handle onto the order row.
  async function getBrandHandleForShopDomain(
    shopDomain: string | null | undefined,
  ): Promise<string | null> {
    const target = normalizeDomain(shopDomain);
    if (!target) {
      console.warn("[brands] handle lookup skipped — no shop domain provided");
      return null;
    }
    try {
      if (!brandsCache || Date.now() - brandsCache.fetchedAt >= BRANDS_CACHE_TTL_MS) {
        const upstream = await fetch(MERCHANT_BRANDS_URL);
        if (!upstream.ok) {
          console.warn(
            `[brands] handle lookup: upstream returned ${upstream.status} for ${target}, ` +
              `using ${brandsCache ? 'stale cache' : 'no cache'}`,
          );
        } else {
          const raw = await upstream.json();
          const parsed = brandsResponseSchema.safeParse(raw);
          if (!parsed.success) {
            console.warn(
              `[brands] handle lookup: upstream payload invalid for ${target}: ${parsed.error.message}`,
            );
          } else {
            brandsCache = { data: parsed.data, fetchedAt: Date.now() };
          }
        }
      }
      // Prefer exact match on the brand's canonical `shopDomain` (the
      // `*.myshopify.com` value Shopify itself sends in the webhook header).
      // Fall back to `storefrontUrl` host matching for older brand records
      // that haven't been re-saved with `shopDomain` populated yet.
      const brand =
        brandsCache?.data.find(
          (b) => normalizeDomain(b.shopDomain) === target,
        ) ??
        brandsCache?.data.find(
          (b) => normalizeDomain(b.storefrontUrl) === target,
        );
      if (!brand) {
        console.warn(`[brands] handle lookup: no brand matched shop domain ${target}`);
        return null;
      }
      const handle = brand.instagramUsername?.replace(/^@/, "").trim();
      if (!handle) {
        console.warn(`[brands] handle lookup: brand ${brand.id} (${target}) has no instagramUsername`);
        return null;
      }
      return handle;
    } catch (e) {
      console.warn("[brands] handle lookup threw for", target, e);
      return null;
    }
  }

  // storeName-based fallback used when an order row has no snapshotted
  // merchantInstagramHandle (e.g. older orders, or orders created when the
  // brands feed was unreachable). Returns the brand's IG handle (without
  // leading "@") or null. Case-insensitive exact match on the brand's
  // storeName as published in the brands feed.
  async function getBrandHandleForStoreName(
    storeName: string | null | undefined,
  ): Promise<string | null> {
    const target = (storeName || "").trim().toLowerCase();
    if (!target) return null;
    try {
      if (!brandsCache || Date.now() - brandsCache.fetchedAt >= BRANDS_CACHE_TTL_MS) {
        const upstream = await fetch(MERCHANT_BRANDS_URL);
        if (upstream.ok) {
          const raw = await upstream.json();
          const parsed = brandsResponseSchema.safeParse(raw);
          if (parsed.success) {
            brandsCache = { data: parsed.data, fetchedAt: Date.now() };
          }
        }
      }
      const brand = brandsCache?.data.find(
        (b) => (b.storeName || "").trim().toLowerCase() === target,
      );
      if (!brand) return null;
      const handle = brand.instagramUsername?.replace(/^@/, "").trim();
      return handle || null;
    } catch (e) {
      console.warn("[brands] storeName handle lookup threw for", target, e);
      return null;
    }
  }

  // ---------- Product card schema (hoisted: also used by /api/brands enrichment) ----------
  const productCardSchema = z.object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    title: z.string(),
    handle: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    price: z.union([z.string(), z.number()]).nullable().optional().transform((v) =>
      v == null ? null : String(v),
    ),
    available: z.boolean().nullable().optional(),
    productUrl: z.string(),
  });
  const productsResponseSchema = z.array(z.unknown()).transform((arr) =>
    arr
      .map((item) => {
        const parsed = productCardSchema.safeParse(item);
        return parsed.success ? parsed.data : null;
      })
      .filter((p): p is z.infer<typeof productCardSchema> => p !== null),
  );

  // Defensive filter for products that aren't valid Spiral items.
  // The merchant dashboard is supposed to filter these at the source, but
  // we keep a safety net here so a stale or buggy upstream payload can't
  // leak them to shoppers. Conservative on purpose — extend as new
  // heuristics are needed.
  const GIFT_CARD_TITLE_RE = /\bgift\s*card(s)?\b/i;
  function excludeNonSpiralProducts<T extends { title: string }>(
    products: T[],
  ): { kept: T[]; droppedCount: number } {
    const kept: T[] = [];
    let droppedCount = 0;
    for (const p of products) {
      if (GIFT_CARD_TITLE_RE.test(p.title)) {
        droppedCount += 1;
        continue;
      }
      kept.push(p);
    }
    return { kept, droppedCount };
  }
  type ProductCardForClient = {
    id: string;
    title: string;
    handle: string | null;
    image: string | null;
    price: string | null;
    productUrl: string;
    available: boolean;
  };
  const lastGoodProducts = new Map<string, ProductCardForClient[]>();

  async function fetchUpstreamProducts(brandId: string): Promise<ProductCardForClient[] | null> {
    const upstreamUrl = `https://spiral-merchant-dashboard.replit.app/api/brands/${encodeURIComponent(brandId)}/products`;
    try {
      const upstream = await fetch(upstreamUrl, { headers: { 'Accept': 'application/json' } });
      if (!upstream.ok) return null;
      let raw: unknown = null;
      try { raw = await upstream.json(); } catch { raw = null; }
      const parsed = productsResponseSchema.safeParse(raw);
      if (!parsed.success) return null;
      const shapedRaw: ProductCardForClient[] = parsed.data.map((p) => ({
        id: p.id,
        title: p.title,
        handle: p.handle ?? null,
        image: p.image ?? null,
        price: p.price ?? null,
        available: p.available ?? true,
        productUrl: p.productUrl,
      }));
      const { kept: shaped, droppedCount } = excludeNonSpiralProducts(shapedRaw);
      if (droppedCount > 0) {
        console.warn(
          `[brand-products] ${brandId} dropped ${droppedCount} non-Spiral product(s) (e.g. gift cards) from upstream payload`,
        );
      }
      lastGoodProducts.set(brandId, shaped);
      return shaped;
    } catch (err) {
      console.warn(`[brand-products] preview fetch failed for ${brandId}:`, err);
      return null;
    }
  }

  // Shape returned to the shopper UI. `category` is kept for backwards
  // compatibility with existing clients (it mirrors `primaryCategory`).
  function shapeForClient(brand: UpstreamBrand, products: ProductCardForClient[] = []) {
    return {
      id: brand.id,
      storeName: brand.storeName,
      storefrontUrl: brand.storefrontUrl,
      instagramUsername: brand.instagramUsername ?? null,
      instagramProfilePictureUrl: brand.instagramProfilePictureUrl ?? null,
      category: brand.primaryCategory ?? null,
      secondaryCategories: brand.secondaryCategories ?? [],
      country: brand.country ?? null,
      shippingCountries: brand.shippingCountries ?? null,
      selectedProductCount: brand.selectedProductCount ?? 0,
      minFollowers: brand.minFollowers ?? 0,
      discountTiers: brand.discountTiers ?? [],
      // Top N curated products inlined so the marketplace card can render a
      // product hero + carousel without an N+1 fan-out from the client. See
      // `fetchBrandPreviewProducts` for the fetch + cache strategy.
      products,
      // Recent IG posts for the hero slideshow. See brandSchema comment.
      instagramMedia: (brand.instagramMedia ?? []).map((m) => ({
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
        thumbnailUrl: m.thumbnailUrl ?? null,
      })),
    };
  }
  // Shared filter for the marketplace list and the per-brand products route.
  // A brand is visible only when the merchant has clicked "Go Live" on the
  // dashboard (`spiralEnabled === true`) AND has curated at least one
  // product. Anything else — explicitly disabled, never enabled, or
  // missing the field entirely — is hidden so merchants who are still
  // setting up Spiral don't leak into the shopper marketplace.
  function isBrandVisibleForMarketplace(b: UpstreamBrand): boolean {
    if (b.spiralEnabled !== true) return false;
    if ((b.selectedProductCount ?? 0) <= 0) return false;
    // Storefront-reachability backstop: catches dead/deleted Shopify
    // stores whose `spiralEnabled` flag is still true upstream (e.g.
    // merchant deleted the store from Shopify admin without going
    // through the proper uninstall flow). See `runStorefrontReachabilityJob`
    // below for the probe.
    if (!isBrandReachable(b.id)) return false;
    return true;
  }
  // ---- Storefront reachability backstop ----
  // Defense-in-depth for the ~5% of "dead store" cases the merchant
  // dashboard's `spiralEnabled` flag can't catch in real time:
  //   - merchant deleted the entire Shopify store (no uninstall webhook)
  //   - merchant password-protected / paused the storefront
  //   - app/uninstalled webhook delivery failed
  // We probe each brand's `storefrontUrl` on a slow tick and only HARD
  // failures (404/410, DNS, conn-refused, cert) count. Transient failures
  // (5xx, timeout, 401/403/429) are explicitly ignored so a slow Shopify
  // or rate-limit blip can't nuke a real merchant. A brand is hidden
  // only after 3 consecutive hard failures and recovers on the first
  // success. In-memory only — on restart we re-probe from scratch.
  const REACHABILITY_FAIL_THRESHOLD = 3;
  const REACHABILITY_PROBE_TIMEOUT_MS = 5000;
  const REACHABILITY_PROBE_INTERVAL_MS = 30 * 60 * 1000;
  const REACHABILITY_FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
  const REACHABILITY_PROBE_CONCURRENCY = 5;
  type ReachabilityState = {
    consecutiveFailures: number;
    lastProbedAt: number;
    unreachable: boolean;
  };
  const brandReachability = new Map<string, ReachabilityState>();
  function isBrandReachable(brandId: string): boolean {
    return !(brandReachability.get(brandId)?.unreachable ?? false);
  }
  // SSRF guard: reject any IP that points at our own infra or any
  // RFC1918 / loopback / link-local / unique-local range. We probe
  // upstream-provided URLs, so even though those URLs come from a
  // service we control we still validate them before fetching so a
  // compromised or buggy upstream record can't be used to probe
  // arbitrary internal targets.
  function isPrivateOrLocalIp(ip: string): boolean {
    const v = net.isIP(ip);
    if (v === 4) {
      const [a, b] = ip.split(".").map(Number);
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      if (a >= 224) return true; // multicast + reserved
      return false;
    }
    if (v === 6) {
      const lower = ip.toLowerCase();
      if (lower === "::1" || lower === "::") return true;
      if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
      if (lower.startsWith("fe80")) return true; // link-local
      if (lower.startsWith("ff")) return true;   // multicast
      // IPv4-mapped IPv6 like ::ffff:10.0.0.1
      if (lower.startsWith("::ffff:")) {
        const mapped = lower.slice(7);
        if (net.isIP(mapped) === 4) return isPrivateOrLocalIp(mapped);
      }
      return false;
    }
    return false;
  }
  async function isSafeProbeUrl(url: string): Promise<boolean> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (!host) return false;
    // Reject hostname forms that would obviously target our own infra.
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false;
    // If the URL embeds a literal IP, validate it directly.
    const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
    if (net.isIP(literal)) {
      return !isPrivateOrLocalIp(literal);
    }
    // Otherwise DNS-resolve and reject if any resolved address is
    // private/loopback/link-local. Tight timeout via Promise.race
    // because dns.lookup has no native abort signal.
    try {
      const lookupPromise = dnsLookup(host, { all: true });
      const timeout = new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("dns-timeout")), 2000),
      );
      const addrs = await Promise.race([lookupPromise, timeout]);
      if (!Array.isArray(addrs) || addrs.length === 0) return false;
      for (const a of addrs) {
        if (isPrivateOrLocalIp(a.address)) return false;
      }
      return true;
    } catch {
      // DNS lookup failed entirely → let the caller treat it as a hard
      // failure (it IS unreachable), but don't fetch.
      return false;
    }
  }
  async function probeStorefront(url: string): Promise<"ok" | "dead" | "unknown"> {
    // Pre-flight SSRF check. If the URL doesn't validate (bad parse,
    // private IP, DNS resolves to private) we treat it as DEAD — a brand
    // configured with such a URL is broken from a shopper's perspective
    // anyway, and we explicitly don't want to issue the fetch.
    if (!(await isSafeProbeUrl(url))) return "dead";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REACHABILITY_PROBE_TIMEOUT_MS);
    try {
      // `redirect: "manual"` so we don't blindly chase a 30x to a host
      // we haven't re-validated. A 30x from the storefront itself counts
      // as "ok" (the store is alive enough to respond with a redirect).
      let res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "manual" });
      // Some Shopify themes / CDNs reject HEAD with 405/501. Retry as GET.
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "manual" });
      }
      if (res.status === 404 || res.status === 410) return "dead";
      if (res.status >= 200 && res.status < 400) return "ok";
      // 401/403/429/5xx → don't penalize. Could be auth-walled, rate-limited,
      // or a transient backend hiccup, none of which mean the store is gone.
      return "unknown";
    } catch (err: any) {
      if (err?.name === "AbortError") return "unknown";
      // node-fetch surfaces system errors on `err.cause.code`.
      const code = err?.cause?.code ?? err?.code ?? "";
      if (
        code === "ENOTFOUND" ||
        code === "EAI_AGAIN" ||
        code === "ECONNREFUSED" ||
        code === "CERT_HAS_EXPIRED" ||
        code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
        code === "DEPTH_ZERO_SELF_SIGNED_CERT"
      ) {
        return "dead";
      }
      return "unknown";
    } finally {
      clearTimeout(timer);
    }
  }
  async function runStorefrontReachabilityJob() {
    try {
      const brands = brandsCache?.data ?? [];
      if (brands.length === 0) return;
      // Bounded-concurrency worker pool over the brand list.
      let cursor = 0;
      const worker = async () => {
        while (cursor < brands.length) {
          const b = brands[cursor++];
          const prev = brandReachability.get(b.id) ?? {
            consecutiveFailures: 0,
            lastProbedAt: 0,
            unreachable: false,
          };
          const result = await probeStorefront(b.storefrontUrl);
          const now = Date.now();
          if (result !== "dead") {
            // Strict consecutive-probe semantics: any non-dead outcome
            // (ok OR unknown) breaks the failure streak. This ensures a
            // brand can only be hidden after 3 *consecutive* hard
            // failures with no transient blip in between — a flaky
            // network or a 5xx mid-streak resets the count to 0.
            const recovered = result === "ok" && prev.unreachable;
            if (recovered) {
              console.info(`[brands] recovered: ${b.id} (${b.storeName})`);
            }
            brandReachability.set(b.id, {
              consecutiveFailures: 0,
              lastProbedAt: now,
              // Only flip back to reachable on a confirmed "ok". An
              // "unknown" resets the streak but leaves an already-hidden
              // brand hidden until we get a real success.
              unreachable: result === "ok" ? false : prev.unreachable,
            });
            continue;
          }
          // result === "dead"
          const nextFailures = prev.consecutiveFailures + 1;
          const unreachable = nextFailures >= REACHABILITY_FAIL_THRESHOLD;
          if (unreachable && !prev.unreachable) {
            console.warn(
              `[brands] marked unreachable: ${b.id} (${b.storeName}, storefrontUrl=${b.storefrontUrl})`,
            );
          }
          brandReachability.set(b.id, {
            consecutiveFailures: nextFailures,
            lastProbedAt: now,
            unreachable,
          });
        }
      };
      const workers = Array.from(
        { length: Math.min(REACHABILITY_PROBE_CONCURRENCY, brands.length) },
        () => worker(),
      );
      await Promise.all(workers);
    } catch (err) {
      console.error("[brands] reachability job failed:", err);
    }
  }
  // Number of products inlined per brand on the marketplace card (1 hero +
  // ~5 carousel). Keep small to bound the parallel upstream fan-out.
  const BRAND_PREVIEW_PRODUCT_COUNT = 6;
  // Enriched (brand + preview products) cache, separate from the raw upstream
  // cache so we don't re-fan-out on every shopper request. Same TTL as raw.
  let enrichedBrandsCache: { data: ReturnType<typeof shapeForClient>[]; fetchedAt: number } | null = null;

  async function shapeListForClient(brands: CachedBrands) {
    const missingCount = brands.filter(
      (b) => b.spiralEnabled === undefined || b.spiralEnabled === null,
    ).length;
    if (missingCount > 0) {
      // Info-level: these brands are now silently hidden (they haven't
      // clicked Go Live, or the upstream omitted the field). Surfaced for
      // visibility in case an upstream regression starts dropping the field.
      console.info(
        `[brands] ${missingCount}/${brands.length} brand records missing spiralEnabled — hidden from marketplace`,
      );
    }
    const visible = brands.filter(isBrandVisibleForMarketplace);
    // Parallel fan-out for preview products. Cap concurrency implicitly via
    // brand-count (~tens of brands). Each call falls back to `lastGoodProducts`
    // on failure so an upstream blip doesn't blank the carousel.
    const productLists = await Promise.all(
      visible.map(async (b) => {
        const fresh = await fetchUpstreamProducts(b.id);
        const list = fresh ?? lastGoodProducts.get(b.id) ?? [];
        return list.slice(0, BRAND_PREVIEW_PRODUCT_COUNT);
      }),
    );
    return visible.map((b, i) => shapeForClient(b, productLists[i]));
  }

  // Per-brand curated product feed for the marketplace product browser.
  // Proxies the merchant dashboard's `/api/brands/:brandId/products` endpoint,
  // which returns only the products the merchant has explicitly opted into
  // Spiral. The brandId MUST match a brand already in our brands cache —
  // otherwise this endpoint becomes an open proxy that lets anyone fetch
  // any brand id through the upstream.
  //
  // Caching policy: we deliberately do NOT cache the response here so that
  // when a merchant toggles a product on/off it shows up in the customer app
  // within seconds. The merchant dashboard already has its own short-lived
  // cache (and busts it on selection writes), so this proxy stays thin.
  // The `lastGoodProducts` map (defined above) is fallback-only.
  async function getKnownBrandIds(): Promise<Set<string>> {
    // Refresh the brands cache if cold so a first-load shopper hitting a
    // product page directly (e.g. via shared link) doesn't get a 404.
    if (!brandsCache || Date.now() - brandsCache.fetchedAt >= BRANDS_CACHE_TTL_MS) {
      try {
        const upstream = await fetch(MERCHANT_BRANDS_URL);
        if (upstream.ok) {
          const raw = await upstream.json();
          const parsed = brandsResponseSchema.safeParse(raw);
          if (parsed.success) {
            brandsCache = { data: parsed.data, fetchedAt: Date.now() };
          }
        }
      } catch (_) { /* fall through to whatever cache we have */ }
    }
    // Mirror the same defensive filter as `shapeListForClient` so a disabled
    // or empty-curation brand can't be queried for products even if its id
    // is somehow known (e.g. via a shared link from before it was disabled).
    const ids = new Set<string>();
    for (const b of brandsCache?.data ?? []) {
      if (!isBrandVisibleForMarketplace(b)) continue;
      ids.add(b.id);
    }
    return ids;
  }

  app.get("/api/brands/:brandId/products", async (req, res) => {
    try {
      const brandId = String(req.params.brandId ?? "").trim();
      // UUID-ish guard — alphanumerics + hyphens only, modest length cap.
      if (!brandId || !/^[a-zA-Z0-9-]{1,64}$/.test(brandId)) {
        return res.status(400).json({ error: "Invalid brandId" });
      }
      const knownIds = await getKnownBrandIds();
      if (!knownIds.has(brandId)) {
        return res.status(404).json({ error: "Unknown brand" });
      }
      // Always pass through to upstream so product (un)selection by the
      // merchant is reflected in the customer app within seconds. The
      // `lastGoodProducts` map (populated by fetchUpstreamProducts) is
      // fallback-only — only consulted when the upstream fails.
      const fresh = await fetchUpstreamProducts(brandId);
      if (fresh !== null) {
        return res.json(fresh);
      }
      const fallback = lastGoodProducts.get(brandId);
      if (fallback) {
        console.warn(`[brand-products] ${brandId} upstream failed, serving last-good fallback`);
        return res.json(fallback);
      }
      return res.status(502).json({ error: "Failed to load products" });
    } catch (error) {
      console.error("[brand-products] Failed to fetch products:", error);
      res.status(502).json({ error: "Failed to load products" });
    }
  });

  async function getEnrichedBrandList(): Promise<ReturnType<typeof shapeForClient>[]> {
    if (enrichedBrandsCache && Date.now() - enrichedBrandsCache.fetchedAt < BRANDS_CACHE_TTL_MS) {
      return enrichedBrandsCache.data;
    }
    if (!brandsCache || Date.now() - brandsCache.fetchedAt >= BRANDS_CACHE_TTL_MS) {
      try {
        const upstream = await fetch(MERCHANT_BRANDS_URL);
        if (upstream.ok) {
          const raw = await upstream.json();
          const parsed = brandsResponseSchema.safeParse(raw);
          if (parsed.success) {
            brandsCache = { data: parsed.data, fetchedAt: Date.now() };
          } else {
            console.error("[brands] Upstream returned invalid payload:", parsed.error.message);
          }
        } else if (brandsCache) {
          console.warn(`[brands] Upstream returned ${upstream.status}, using stale cache`);
        }
      } catch (err) {
        console.error("[brands] Failed to fetch brands:", err);
      }
    }
    if (!brandsCache) {
      return [];
    }
    const enriched = await shapeListForClient(brandsCache.data);
    enrichedBrandsCache = { data: enriched, fetchedAt: Date.now() };
    return enriched;
  }

  app.get("/api/brands", async (_req, res) => {
    try {
      const enriched = await getEnrichedBrandList();
      if (enriched.length === 0 && !brandsCache) {
        return res.status(502).json({ error: "Failed to load brands" });
      }
      res.json(enriched);
    } catch (error) {
      console.error("[brands] Failed to serve brands:", error);
      if (enrichedBrandsCache) {
        return res.json(enrichedBrandsCache.data);
      }
      res.status(502).json({ error: "Failed to load brands" });
    }
  });

  // Periodic classifier worker: pulls the brand list from the merchant proxy,
  // finds any brands without a fresh classification, runs the LLM on them, and
  // PATCHes the result back to the merchant. No-op if OPENAI_API_KEY or
  // SPIRAL_INTERNAL_KEY is missing, so the app stays bootable.
  let classifierBusy = false;
  async function classifierTick(): Promise<void> {
    if (classifierBusy) {
      console.log("[classifier] Tick skipped — previous cycle still running");
      return;
    }
    classifierBusy = true;
    try {
      const upstream = await fetch(MERCHANT_BRANDS_URL);
      if (!upstream.ok) {
        console.warn(`[classifier] Skipping tick — upstream ${upstream.status}`);
        return;
      }
      const raw = await upstream.json();
      const parsed = brandsResponseSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn("[classifier] Skipping tick — invalid upstream payload");
        return;
      }
      const brands = parsed.data.map((b) => ({
        id: b.id,
        storefrontUrl: b.storefrontUrl,
        categoryClassifiedAt: b.categoryClassifiedAt ?? null,
      }));
      await runClassificationCycle(brands);
    } catch (err) {
      console.error("[classifier] Tick failed:", err);
    } finally {
      classifierBusy = false;
    }
  }
  setTimeout(() => { void classifierTick(); }, CLASSIFIER_FIRST_RUN_DELAY_MS);
  setInterval(() => { void classifierTick(); }, CLASSIFIER_INTERVAL_MS);

  const httpServer = createServer(app);

  // Start the Instagram connect reminder worker
  setTimeout(() => { void processInstagramReminders(); }, 60 * 1000);
  setInterval(() => { void processInstagramReminders(); }, INSTAGRAM_REMINDER_INTERVAL_MS);

  // Start the deferred publicity-check worker (anti Close Friends / deletion)
  setTimeout(() => { void processPublicityChecks(); }, 90 * 1000);
  setInterval(() => { void processPublicityChecks(); }, PUBLICITY_CHECK_INTERVAL_MS);

  // Retry worker for story_mention forwards that failed to reach the merchant
  // dashboard (Promotions gallery). Keeps shopper Story posts from being lost
  // when the dashboard is briefly down or slow.
  setTimeout(() => { void processDashboardForwardQueue(); }, 45 * 1000);
  setInterval(() => { void processDashboardForwardQueue(); }, DASHBOARD_FORWARD_INTERVAL_MS);

  // Background delivery fallback. Catches the two cases Shopify can't tell us
  // about in real time:
  //   1. ready_for_pickup → no later `delivered` event (typical for small
  //      local merchants doing click-and-collect; they don't manually mark
  //      collection). After 24h we treat the order as collected.
  //   2. fulfilled, but no tracking event ever arrives (merchant ships by
  //      hand with no carrier integration). After 7 days we treat as delivered.
  // transitionOrderToDelivered is idempotent so a duplicate real `delivered`
  // event later is a no-op.
  const DELIVERY_FALLBACK_INTERVAL_MS = 30 * 60 * 1000;
  async function runDeliveryFallbackJob() {
    try {
      const due = await storage.getOrdersAwaitingDeliveryFallback();
      if (due.length === 0) return;
      console.log(`[delivery-fallback] processing ${due.length} order(s)`);
      for (const o of due) {
        const reason = o.readyForPickupAt ? 'ready_for_pickup_24h' : 'no_tracking_7d';
        console.log(`[delivery-fallback] order=${o.id} reason=${reason}`);
        try {
          await transitionOrderToDelivered(o.id);
        } catch (err) {
          console.error(`[delivery-fallback] order=${o.id} failed:`, err);
        }
      }
    } catch (err) {
      console.error('[delivery-fallback] job failed:', err);
    }
  }
  setTimeout(() => { void runDeliveryFallbackJob(); }, 2 * 60 * 1000);
  setInterval(() => { void runDeliveryFallbackJob(); }, DELIVERY_FALLBACK_INTERVAL_MS);

  // Storefront reachability backstop (see `runStorefrontReachabilityJob`
  // for rationale). Delayed first run so the upstream brands cache has a
  // chance to warm; thereafter on a slow 30-min tick.
  setTimeout(() => { void runStorefrontReachabilityJob(); }, REACHABILITY_FIRST_RUN_DELAY_MS);
  setInterval(() => { void runStorefrontReachabilityJob(); }, REACHABILITY_PROBE_INTERVAL_MS);

  return httpServer;
}
