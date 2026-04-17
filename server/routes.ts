import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { Resend } from "resend";
import { storage } from "./storage";
import { z } from "zod";
import { insertStoreSettingsSchema, insertDiscountTierSchema, insertVerificationSchema } from "@shared/schema";
import { fetchShopifyProducts, fetchShopifyCollections } from "./shopify";

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

async function sendVerificationEmail(email: string, code: string, name?: string): Promise<boolean> {
  try {
    const result = await resend.emails.send({
      from: "Spiral <noreply@joinspiral.app>",
      to: email,
      subject: "Verify your Spiral account",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #5729a3; font-size: 28px; margin-bottom: 8px;">Spiral</h1>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${name ? ` ${name}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Enter this code to verify your email address:</p>
          <div style="background: linear-gradient(135deg, #5729a3 0%, #8b5cf6 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 36px; font-weight: bold; color: white; letter-spacing: 8px;">${code}</span>
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
          <h1 style="color: #5729a3; font-size: 28px; margin-bottom: 8px;">Spiral</h1>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${firstName ? ` ${firstName}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Welcome to Spiral! Your account is verified and ready to go.</p>
          <div style="background: linear-gradient(135deg, #5729a3 0%, #8b5cf6 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
            <p style="color: white; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">One more step</p>
            <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">Connect your Instagram to start earning instant discounts on every order.</p>
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

async function sendInstagramConnectedEmail(customerId: string, email: string, firstName?: string | null, instagramHandle?: string | null): Promise<boolean> {
  try {
    const customer = await storage.getSpiralCustomerById(customerId);
    if (customer?.marketingEmailOptOut) {
      console.log(`[email] Skipping Instagram-connected email for opted-out customer ${customerId}`);
      return false;
    }
    const unsubscribeUrl = await getUnsubscribeUrlForCustomer(customerId);
    const result = await resend.emails.send({
      from: "Spiral <noreply@joinspiral.app>",
      to: email,
      subject: "Instagram connected — you're ready to earn discounts",
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #5729a3; font-size: 28px; margin-bottom: 8px;">Spiral</h1>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${firstName ? ` ${firstName}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Your Instagram${instagramHandle ? ` <strong>@${instagramHandle}</strong>` : ""} is now connected to Spiral.</p>
          <div style="background: linear-gradient(135deg, #5729a3 0%, #8b5cf6 100%); border-radius: 16px; padding: 32px; text-align: center; margin-bottom: 24px;">
            <p style="color: white; font-size: 18px; font-weight: 600; margin: 0 0 8px 0;">You're all set</p>
            <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">Start receiving instant discounts at checkout on any Spiral-enabled store.</p>
          </div>
          <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">After your order arrives, post a quick Story tagging the brand and your discount is locked in. We'll handle the verification automatically.</p>
          <p style="color: #6b7280; font-size: 14px;">Happy shopping.</p>
          ${unsubscribeFooterHtml(unsubscribeUrl)}
        </div>
      `,
    });
    if (result?.error) {
      const { reason, name: errName } = describeResendError(result.error);
      await recordEmailFailure("instagram_connected", email, reason, errName);
      return false;
    }
    return true;
  } catch (error) {
    const { reason, name: errName } = describeResendError(error);
    await recordEmailFailure("instagram_connected", email, reason, errName);
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
          <h1 style="color: #5729a3; font-size: 28px; margin-bottom: 8px;">Spiral</h1>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Hey${firstName ? ` ${firstName}` : ""},</p>
          <p style="color: #374151; font-size: 16px; margin-bottom: 24px;">Your Spiral account is verified, but you haven't connected Instagram yet. Connect it now to unlock instant discounts at checkout on every Spiral-enabled store.</p>
          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${connectUrl}" style="display: inline-block; background: linear-gradient(135deg, #5729a3 0%, #8b5cf6 100%); color: white; text-decoration: none; font-size: 16px; font-weight: 600; padding: 14px 28px; border-radius: 12px;">Connect Instagram</a>
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
    instagramOauthState?: string;
    customerId?: string;
    pendingSignup?: {
      email: string;
      firstName?: string;
      lastName?: string;
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
  h1 { color: #5729a3; font-size: 28px; margin: 0 0 8px; }
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

  app.get("/api/unsubscribe", handleUnsubscribe);
  // Mailbox providers may issue POST for one-click List-Unsubscribe (RFC 8058)
  app.post("/api/unsubscribe", handleUnsubscribe);

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

  // Instagram OAuth Routes (uses Instagram API / Instagram Login)
  app.get("/auth/instagram", (req, res) => {
    const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
    const appId = process.env.INSTAGRAM_APP_ID;
    const scopes = 'instagram_basic,instagram_manage_messages,pages_show_list,pages_read_engagement,pages_manage_metadata';

    if (!redirectUri || !appId) {
      return res.status(500).json({ error: "Instagram credentials not configured" });
    }

    const state = crypto.randomBytes(16).toString('hex');
    req.session.instagramOauthState = state;

    const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}`;
    console.log('Instagram OAuth initiated, redirect URI:', redirectUri);
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

    if (state !== req.session.instagramOauthState) {
      console.error("Instagram OAuth state mismatch - possible CSRF attack");
      return res.status(403).send("Invalid state parameter - CSRF validation failed");
    }

    delete req.session.instagramOauthState;

    try {
      // Step 1: Exchange code for short-lived Instagram access token
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
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("Failed to get Instagram access token:", errorText);
        return res.status(500).send(`Failed to authenticate with Instagram: ${errorText}`);
      }

      const tokenData = await tokenResponse.json() as { access_token: string; user_id: number };
      const shortLivedToken = tokenData.access_token;
      const igUserId = String(tokenData.user_id);

      // Step 2: Exchange short-lived token for long-lived token (60 days)
      const longTokenUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`;
      const longTokenResponse = await fetch(longTokenUrl);

      if (!longTokenResponse.ok) {
        const errorText = await longTokenResponse.text();
        console.error("Failed to exchange for long-lived token:", errorText);
        return res.status(500).send(`Failed to get long-lived token: ${errorText}`);
      }

      const longTokenData = await longTokenResponse.json() as { access_token: string; expires_in: number };
      const longLivedToken = longTokenData.access_token;

      // Step 3: Fetch Facebook Page accounts linked to this Instagram account
      let pageId = igUserId;
      let pageToken = longLivedToken;
      let instagramBusinessAccountId = igUserId;
      let username = 'joinspiral';
      const pagesInfo: string[] = [];

      try {
        const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${longLivedToken}`;
        const accountsRes = await fetch(accountsUrl);
        const accountsData = await accountsRes.json() as { data?: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }>; error?: { message: string } };

        if (accountsData.error) {
          console.error("Pages accounts error (non-fatal):", accountsData.error.message);
        } else if (accountsData.data && accountsData.data.length > 0) {
          for (const page of accountsData.data) {
            pagesInfo.push(`Page: ${page.name} (${page.id})`);
            if (page.instagram_business_account) {
              instagramBusinessAccountId = page.instagram_business_account.id;
              pagesInfo.push(`  → Instagram Business Account: ${instagramBusinessAccountId}`);
            }
            pageId = page.id;
            pageToken = page.access_token;
          }
          console.log('Found Facebook Pages:', pagesInfo.join(', '));
        } else {
          console.log('No Facebook Pages found, using IG user token directly');
        }
      } catch (pageErr) {
        console.error("Error fetching page accounts (non-fatal):", pageErr);
      }

      // Step 4: Fetch Instagram username
      try {
        const userInfoResponse = await fetch(`https://graph.instagram.com/v19.0/${igUserId}?fields=username&access_token=${longLivedToken}`);
        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json() as { id: string; username?: string };
          if (userInfo.username) username = userInfo.username;
        }
      } catch (userInfoErr) {
        console.error("Error fetching Instagram user info (non-fatal):", userInfoErr);
      }

      // Step 5: Store settings
      const existingSettings = await storage.getStoreSettings();
      await storage.updateStoreSettings({
        storeName: existingSettings?.storeName || "My Store",
        instagramHandle: `@${username}`,
        tokenActive: existingSettings?.tokenActive ?? true,
        shopDomain: existingSettings?.shopDomain,
        accessToken: existingSettings?.accessToken,
        minFollowers: existingSettings?.minFollowers ?? 0,
        instagramBusinessAccountId,
        instagramPageId: pageId,
        instagramUsername: username,
        instagramAccessToken: longLivedToken,
      });

      console.log('Instagram account connected:', username, 'IG User ID:', igUserId, 'Page ID:', pageId);

      // Step 6: Subscribe Page to messaging webhooks
      let webhookStatus = 'unknown';
      try {
        const subscribeUrl = `https://graph.facebook.com/v19.0/${pageId}/subscribed_apps`;
        const subscribeRes = await fetch(subscribeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscribed_fields: ['messages', 'messaging_postbacks'],
            access_token: pageToken,
          }),
        });

        if (subscribeRes.ok) {
          webhookStatus = 'active';
          console.log('Subscribed Page to messaging webhooks:', pageId);
          const updatedSettings = await storage.getStoreSettings();
          if (updatedSettings) {
            await storage.updateStoreWebhookStatus(updatedSettings.id, 'active');
          }
        } else {
          const subscribeError = await subscribeRes.text();
          webhookStatus = 'failed: ' + subscribeError;
          console.error('Failed to subscribe Page to messaging webhooks:', subscribeError);
        }
      } catch (webhookSubError) {
        webhookStatus = 'error';
        console.error('Error subscribing to messaging webhooks:', webhookSubError);
      }

      res.send(`
        <html><body style="font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 20px;">
          <h2 style="color: #1a1a2e;">Instagram Connected Successfully</h2>
          <p><strong>Account:</strong> @${username} (IG User ID: ${igUserId})</p>
          <p><strong>Page ID:</strong> ${pageId}</p>
          <p><strong>Instagram Business Account ID:</strong> ${instagramBusinessAccountId}</p>
          <p><strong>Webhook subscription:</strong> ${webhookStatus}</p>
          ${pagesInfo.length > 0 ? `<p><strong>Pages found:</strong> ${pagesInfo.join('<br>')}</p>` : ''}
          <hr/>
          <p><strong>Long-lived Access Token (copy to SPIRAL_INSTAGRAM_ACCESS_TOKEN):</strong></p>
          <textarea rows="4" cols="60" onclick="this.select()" readonly style="width:100%;font-size:12px;">${longLivedToken}</textarea>
          <p><strong>Page Token (copy to SPIRAL_PAGE_ACCESS_TOKEN if needed):</strong></p>
          <textarea rows="4" cols="60" onclick="this.select()" readonly style="width:100%;font-size:12px;">${pageToken !== longLivedToken ? pageToken : '(same as above — no separate page token found)'}</textarea>
          <p style="color: #666; margin-top: 20px;">The long-lived token lasts 60 days. Re-run /auth/instagram before it expires to refresh it.</p>
        </body></html>
      `);
    } catch (error) {
      console.error("Error during Instagram OAuth:", error);
      res.status(500).send(`Failed to complete Instagram authentication: ${error}`);
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
      let followerCount = followerCountAttr?.value ? parseInt(followerCountAttr.value, 10) : null;
      
      // If we have a Spiral customer ID, fetch their data
      if (spiralCustomerId && (!instagramHandle || !instagramUserId)) {
        const customer = await storage.getSpiralCustomerById(spiralCustomerId);
        if (customer) {
          instagramHandle = instagramHandle || customer.instagramHandle;
          instagramUserId = instagramUserId || customer.instagramUserId;
          followerCount = followerCount ?? customer.followerCount;
        }
      }
      
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
      
      const initialVerificationStatus = 'pending';
      
      // Build line items summary for customer display
      const rawLineItems = order.line_items || [];
      const lineItemsSummary = JSON.stringify(
        rawLineItems.slice(0, 5).map((item: any) => ({
          title: item.title,
          variantTitle: item.variant_title || null,
          quantity: item.quantity,
        }))
      );

      // Build store logo URL from shop domain
      const shopDomain = settings?.shopDomain || '';
      const storeLogo = shopDomain
        ? `https://www.google.com/s2/favicons?domain=${shopDomain}&sz=64`
        : null;

      // Create order record (always persist, even without complete Instagram data)
      const newOrder = await storage.createOrder({
        shopifyOrderId: order.id.toString(),
        shopperEmail: order.email || order.contact_email || '',
        spiralCustomerId: spiralCustomerId,
        instagramHandle: instagramHandle,
        instagramUserId: instagramUserId,
        followerCount: followerCount,
        discountPercent: String(discountPercent.toFixed(2)),
        orderTotal: String(orderTotal.toFixed(2)),
        discountAmount: String(discountAmount.toFixed(2)),
        status: 'pending',
        postDeadline: postDeadline,
        verificationStatus: initialVerificationStatus,
        storeName: settings?.storeName || null,
        storeLogo: storeLogo,
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
  // Updates order status and recalculates post deadline based on fulfillment date
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
      
      // Get store settings for posting window
      const settings = await storage.getStoreSettings();
      const postingWindowDays = settings?.postingWindowDays || 7;
      
      // Use fulfillment created date as the "shipped" date
      const fulfilledAt = new Date(fulfillment.created_at || new Date());
      
      // Calculate new post deadline from fulfillment date
      // Customers get X days after shipment to post their story
      const postDeadline = new Date(fulfilledAt);
      postDeadline.setDate(postDeadline.getDate() + postingWindowDays);
      
      // Update order with fulfillment info
      const updatedOrder = await storage.updateOrderFulfillment(order.id, fulfilledAt, postDeadline);
      
      console.log(`Order ${order.id} fulfilled. Post deadline updated to: ${postDeadline.toISOString()}`);
      
      res.status(200).json({ 
        status: 'processed', 
        orderId: updatedOrder.id,
        postDeadline: postDeadline.toISOString(),
      });
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

      // Process story_mention events via merchant's Instagram messaging webhook
      if (body.object === 'instagram' && body.entry) {
        for (const entry of body.entry) {
          const recipientId = entry.id;
          if (entry.messaging) {
            for (const event of entry.messaging) {
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
      
      res.json({
        authenticated: true,
        customerId: customer.id,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        instagramHandle: customer.instagramHandle ? `@${customer.instagramHandle}` : null,
        instagramUserId: customer.instagramUserId,
        followerCount: customer.followerCount || 0,
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
      
      // Check minimum follower requirement
      const followerCount = customer.followerCount || 0;
      const minFollowers = settings?.minFollowers || 0;
      
      if (followerCount < minFollowers) {
        return res.json({
          eligible: false,
          reason: `Minimum ${minFollowers.toLocaleString()} followers required`,
          followerCount,
          minFollowers,
        });
      }
      
      // Find matching tier
      const matchingTier = tiers
        .sort((a, b) => a.fromFollowers - b.fromFollowers)
        .find(tier => {
          const from = tier.fromFollowers;
          const to = tier.toFollowers;
          return followerCount >= from && (to === null || followerCount <= to);
        });
      
      if (!matchingTier) {
        return res.json({
          eligible: false,
          reason: 'No discount tier matches your follower count',
          followerCount,
        });
      }
      
      // Calculate estimated impressions using power-law curve
      const reachRate = Math.max(0.06, Math.min(0.30, 0.30 * Math.pow(followerCount / 500, -0.173)));
      const estimatedImpressions = Math.round(followerCount * reachRate);
      
      res.json({
        eligible: true,
        discountPercent: parseFloat(matchingTier.discountPercent),
        followerCount,
        tier: {
          from: matchingTier.fromFollowers,
          to: matchingTier.toFollowers,
        },
        estimatedImpressions,
        postingWindowDays: settings?.postingWindowDays || 7,
        instagramHandle: customer.instagramHandle,
      });
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
        discountPercent, 
        discountCode,
        discountAmount: legacyDiscountAmount,
        totalPrice,
        orderTotal: legacyOrderTotal,
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
      const postingWindowDays = settings?.postingWindowDays || 7;
      
      const now = new Date();
      const postDeadline = new Date(now);
      postDeadline.setDate(postDeadline.getDate() + postingWindowDays);

      // Calculate discount amount from percent and total if not provided directly
      const orderTotal = parseFloat(totalPrice || legacyOrderTotal || '0');
      const discountPct = parseFloat(discountPercent || '0');
      const discountAmount = legacyDiscountAmount 
        ? parseFloat(legacyDiscountAmount.toString()) 
        : (orderTotal * discountPct / 100);
      
      // Check for existing order (idempotency)
      const existingOrder = await storage.getOrderByShopifyOrderId(shopifyOrderId.toString());
      if (existingOrder) {
        return res.json({ success: true });
      }
      
      // Build store logo and line items for customer display
      const confirmShopDomain = shopDomain || settings?.shopDomain || '';
      const confirmStoreLogo = confirmShopDomain
        ? `https://www.google.com/s2/favicons?domain=${confirmShopDomain}&sz=64`
        : null;
      const confirmLineItems = rawLineItemsFromWidget
        ? JSON.stringify(rawLineItemsFromWidget)
        : null;

      const order = await storage.createOrder({
        shopifyOrderId: shopifyOrderId.toString(),
        shopperEmail: customer.email,
        spiralCustomerId: customer.id,
        instagramHandle: customer.instagramHandle,
        instagramUserId: customer.instagramUserId,
        followerCount: customer.followerCount,
        discountPercent: discountPct.toFixed(2),
        orderTotal: orderTotal.toFixed(2),
        discountAmount: discountAmount.toFixed(2),
        status: 'pending',
        postDeadline,
        verificationStatus: 'pending',
        storeName: settings?.storeName || null,
        storeLogo: confirmStoreLogo,
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
      const { email, password, firstName, lastName } = req.body;

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

  // Helper to get fixed redirect URI
  const getInstagramRedirectUri = (req: any): string => {
    // Use configured base URL if available
    const baseUrl = process.env.APP_BASE_URL;
    if (baseUrl) {
      return `${baseUrl}/api/customer/instagram/callback`;
    }
    
    // In production, require APP_BASE_URL for security
    if (process.env.NODE_ENV === "production") {
      console.warn("APP_BASE_URL not set in production - using request host");
    }
    
    // Development fallback: use request host
    const host = req.get("host") || "localhost:5000";
    const protocol = req.secure || host.includes("replit") || host.includes(".app") ? "https" : "http";
    return `${protocol}://${host}/api/customer/instagram/callback`;
  };

  // Instagram OAuth - Initiate the Meta Login flow
  app.get("/api/customer/instagram/auth", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated", requiresLogin: true });
      }

      const appId = process.env.FACEBOOK_APP_ID;
      if (!appId) {
        console.error("FACEBOOK_APP_ID not configured");
        return res.status(503).json({ error: "Instagram connection not configured" });
      }

      // Generate state for CSRF protection (includes customerId for extra validation)
      const stateData = `${crypto.randomBytes(16).toString("hex")}_${customerId}`;
      req.session.instagramOauthState = stateData;

      const redirectUri = getInstagramRedirectUri(req);

      // Required permissions for Instagram data
      const scopes = [
        "instagram_basic",
        "pages_show_list",
        "pages_read_engagement",
      ].join(",");

      const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${stateData}&response_type=code`;

      console.log("Instagram OAuth initiated, redirect URI:", redirectUri);
      res.json({ authUrl });
    } catch (error) {
      console.error("Instagram auth initiation error:", error);
      res.status(500).json({ error: "Failed to initiate Instagram connection" });
    }
  });

  // Instagram OAuth - Callback handler
  app.get("/api/customer/instagram/callback", async (req, res) => {
    console.log("=== INSTAGRAM CALLBACK START ===");
    console.log("Query params:", JSON.stringify(req.query));
    console.log("Session:", JSON.stringify({ customerId: req.session.customerId, hasState: !!req.session.instagramOauthState }));
    
    const redirectWithError = (error: string) => {
      console.log("=== CALLBACK ERROR:", error, "===");
      res.redirect(`/connect-instagram?instagram_error=${encodeURIComponent(error)}`);
    };

    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        console.log("FAIL: No customerId in session");
        return redirectWithError("not_authenticated");
      }
      console.log("OK: customerId =", customerId);

      const { code, state, error: oauthError, error_description } = req.query;

      if (oauthError) {
        console.error("Instagram OAuth error:", oauthError, error_description);
        return redirectWithError(oauthError === "access_denied" ? "access_denied" : "oauth_failed");
      }

      if (!code || typeof code !== "string") {
        console.log("FAIL: No code in query");
        return redirectWithError("no_code_received");
      }
      console.log("OK: Got authorization code");

      // Verify state for CSRF protection (includes customerId validation)
      const expectedState = req.session.instagramOauthState;
      console.log("State check - received:", state, "expected:", expectedState);
      if (!expectedState || state !== expectedState) {
        console.error("Instagram OAuth state mismatch - received:", state, "expected:", expectedState);
        return redirectWithError("invalid_state");
      }
      
      // Verify customerId in state matches session
      const stateCustomerId = expectedState.toString().split("_").pop();
      if (stateCustomerId !== customerId) {
        console.error("Instagram OAuth customer mismatch - state:", stateCustomerId, "session:", customerId);
        return redirectWithError("invalid_state");
      }
      console.log("OK: State validation passed");
      delete req.session.instagramOauthState;

      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      if (!appId || !appSecret) {
        return redirectWithError("configuration_error");
      }

      const redirectUri = getInstagramRedirectUri(req);

      // Exchange code for short-lived access token
      console.log("Exchanging Instagram OAuth code for token...");
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
      
      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        error?: { message: string };
      };

      if (!tokenData.access_token) {
        console.error("Token exchange failed:", tokenData.error);
        return redirectWithError("token_exchange_failed");
      }

      const shortLivedToken = tokenData.access_token;

      // Exchange for long-lived token (valid for ~60 days)
      console.log("Exchanging for long-lived token...");
      const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json() as {
        access_token?: string;
        expires_in?: number;
        error?: { message: string };
      };

      const userAccessToken = longLivedData.access_token || shortLivedToken;
      const tokenExpiresIn = longLivedData.expires_in || 3600; // Default 1 hour if short-lived

      // Get user's Facebook Pages
      console.log("Fetching user's Facebook Pages...");
      const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`;
      const pagesResponse = await fetch(pagesUrl);
      const pagesData = await pagesResponse.json() as {
        data?: Array<{ id: string; name: string; access_token: string }>;
        error?: { message: string };
      };

      if (!pagesData.data || pagesData.data.length === 0) {
        console.error("No Facebook Pages found");
        return redirectWithError("no_facebook_pages");
      }

      // Find a page with a connected Instagram account (Business or Creator)
      let instagramAccountId: string | null = null;
      let pageAccessToken: string | null = null;
      let pageName: string | null = null;

      for (const page of pagesData.data) {
        // Check for instagram_business_account (works for both Business and Creator accounts linked to Pages)
        const igUrl = `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
        const igResponse = await fetch(igUrl);
        const igData = await igResponse.json() as {
          instagram_business_account?: { id: string };
          error?: { message: string };
        };

        if (igData.instagram_business_account) {
          instagramAccountId = igData.instagram_business_account.id;
          pageAccessToken = page.access_token;
          pageName = page.name;
          console.log(`Found Instagram account: ${instagramAccountId} on page "${page.name}"`);
          break;
        }
      }

      if (!instagramAccountId || !pageAccessToken) {
        console.error("No Instagram account found linked to any Facebook Page");
        return redirectWithError("no_instagram_account");
      }

      // Fetch Instagram account details (account_type requires instagram_manage_insights permission which we don't have)
      console.log("Fetching Instagram account details...");
      const igDetailsUrl = `https://graph.facebook.com/v21.0/${instagramAccountId}?fields=id,username,followers_count,profile_picture_url&access_token=${pageAccessToken}`;
      const igDetailsResponse = await fetch(igDetailsUrl);
      const igDetails = await igDetailsResponse.json() as {
        id: string;
        username: string;
        followers_count?: number;
        profile_picture_url?: string;
        account_type?: string;
        error?: { message: string };
      };

      if (igDetails.error) {
        console.error("Failed to fetch Instagram details:", igDetails.error);
        return redirectWithError("fetch_details_failed");
      }

      // If we got here via instagram_business_account, it's already a Business/Creator account
      // Personal accounts cannot be linked to Facebook Pages this way
      console.log("OK: Instagram account validated (linked to Facebook Page = Business/Creator)");

      // Calculate token expiry (use long-lived expiry if available)
      const tokenExpiry = new Date(Date.now() + tokenExpiresIn * 1000);

      console.log("Saving Instagram data to database...");
      console.log("Customer ID:", customerId);
      console.log("Instagram data:", JSON.stringify({
        username: igDetails.username,
        id: igDetails.id,
        followers: igDetails.followers_count,
        accountType: igDetails.account_type,
      }));

      // Save the Instagram data
      try {
        await storage.updateSpiralCustomerInstagram(customerId, {
          instagramHandle: igDetails.username,
          instagramUserId: igDetails.id,
          instagramAccessToken: pageAccessToken, // Page tokens don't expire if page is still linked
          instagramTokenExpiry: tokenExpiry,
          instagramProfilePicture: igDetails.profile_picture_url || null,
          instagramAccountType: "BUSINESS", // Linked to Page = Business/Creator account
          followerCount: igDetails.followers_count || null,
        });
        console.log("=== DATABASE SAVE SUCCESS ===");
      } catch (dbError) {
        console.error("=== DATABASE SAVE FAILED ===", dbError);
        throw dbError;
      }

      console.log(`Connected Instagram @${igDetails.username} with ${igDetails.followers_count} followers via OAuth (page: ${pageName})`);

      // Send Instagram-connected confirmation email (fully non-blocking — don't delay redirect)
      const igHandleForEmail = igDetails.username;
      void storage.getSpiralCustomerById(customerId)
        .then((customer) => {
          if (customer?.email) {
            return sendInstagramConnectedEmail(customer.id, customer.email, customer.firstName, igHandleForEmail);
          }
        })
        .catch((err) => {
          console.error("Instagram connected email failed:", err);
        });

      // Redirect to success
      res.redirect("/connect-instagram?instagram_connected=true");
    } catch (error) {
      console.error("Instagram OAuth callback error:", error);
      redirectWithError("unknown_error");
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
      });

      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { firstName, lastName, dateOfBirth, address } = parsed.data;
      const updateData: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; address?: string | null } = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
      if (address !== undefined) updateData.address = address;

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

      res.json(order);
    } catch (error) {
      console.error("Failed to fetch order:", error);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  // Get customer stats (scoped to authenticated customer)
  app.get("/api/customer/stats", async (req, res) => {
    try {
      const customerId = req.session.customerId;
      if (!customerId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const orders = await storage.getOrdersByCustomerId(customerId);
      
      const verifiedOrders = orders.filter(o => o.verificationStatus === "verified");
      const totalSaved = verifiedOrders.reduce((sum, o) => sum + parseFloat(o.discountAmount || "0"), 0);
      
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
      const accessToken = process.env.SPIRAL_INSTAGRAM_ACCESS_TOKEN;

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
      // Verify webhook signature using app secret
      const signature = req.headers['x-hub-signature-256'] as string;
      const appSecret = process.env.INSTAGRAM_APP_SECRET;
      
      if (appSecret) {
        if (!signature) {
          console.error('Instagram DM webhook missing required signature header');
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
        
        const signatureBuffer = Buffer.from(signature, 'utf8');
        const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
        
        if (signatureBuffer.length !== expectedBuffer.length || 
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          console.error('Invalid Instagram DM webhook signature');
          return res.status(403).json({ error: 'Invalid signature' });
        }
        
        console.log('Instagram DM webhook signature verified');
      } else {
        console.warn('INSTAGRAM_APP_SECRET not configured - skipping signature verification (DEV MODE)');
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

                  // Update customer's Instagram info
                  await storage.updateSpiralCustomerInstagram(pendingValidCode.customerId, {
                    instagramHandle,
                    instagramUserId: senderInstagramId,
                    instagramAccessToken: null,
                    instagramTokenExpiry: null,
                    instagramProfilePicture: profilePicture || null,
                    instagramAccountType: "UNKNOWN",
                    followerCount,
                  });

                  console.log(`Verified Spiral code ${pendingValidMatchedCode} for customer ${pendingValidCode.customerId} - Instagram: @${instagramHandle} (${senderInstagramId})`);

                  // Send confirmation DM back
                  console.log(`Sending welcome DM to ${senderInstagramId}...`);
                  const dmSent = await sendInstagramDM(senderInstagramId, "🎉 Welcome to Spiral! You're now verified and ready to earn discounts on every order. ✨ Just shop, post a Story, and we'll take care of the rest!");
                  console.log(`Welcome DM ${dmSent ? 'sent successfully' : 'FAILED'} for ${senderInstagramId}`);
                } else if (expiredCode) {
                  console.log(`Spiral code ${expiredMatchedCode} is expired`);
                  await sendInstagramDM(senderInstagramId, "This code has expired. Please get a new code from the Spiral app.");
                } else if (verifiedCode) {
                  console.log(`Spiral code ${verifiedMatchedCode} was already used`);
                  await sendInstagramDM(senderInstagramId, "This code has already been used. You're already verified!");
                } else if (potentialCodes.length > 0) {
                  console.log(`No matching Spiral code found in message. Tried: ${potentialCodes.join(", ")}`);
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
            for (const event of entry.messaging) {
              if (event.message?.attachments) {
                for (const attachment of event.message.attachments) {
                  if (attachment.type === 'story_mention') {
                    const senderScopedId = event.sender?.id;
                    const storyUrl = attachment.payload?.url || '';
                    
                    console.log(`Story mention received from scoped ID ${senderScopedId} on merchant IG ${recipientId}`);
                    console.log(`  Story URL: ${storyUrl}`);
                    
                    await handleStoryMention(recipientId, senderScopedId, storyUrl);
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

      const pageToken = process.env.SPIRAL_INSTAGRAM_ACCESS_TOKEN;
      if (pageToken) {
        try {
          const graphUrl = `https://graph.instagram.com/v21.0/${userId}?fields=name,username,profile_pic&access_token=${pageToken}`;
          const graphRes = await fetch(graphUrl);
          const graphData = await graphRes.json() as { name?: string; username?: string; profile_pic?: string; error?: { message: string } };
          if (!graphData.error) {
            username = graphData.username || graphData.name || '';
            profilePicFromGraph = graphData.profile_pic || '';
          } else {
            console.error(`Graph API error:`, graphData.error.message);
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

  // Alias for the /webhooks/instagram endpoint (uses same logic)
  async function handleStoryMentionWebhook(merchantInstagramId: string, senderScopedId: string, storyUrl: string): Promise<void> {
    return handleStoryMention(merchantInstagramId, senderScopedId, storyUrl);
  }

  // Handle story_mention webhook: match sender to customer and verify their pending order
  async function handleStoryMention(merchantInstagramId: string, senderScopedId: string, storyUrl: string): Promise<void> {
    try {
      const settings = await storage.getStoreSettings();
      if (!settings) {
        console.error('Story mention: No store settings found');
        return;
      }

      // Update last webhook received timestamp
      await storage.updateStoreLastWebhookReceived(settings.id);

      // Check if the merchant IG ID matches our store's connected Instagram
      if (settings.instagramBusinessAccountId !== merchantInstagramId) {
        console.log(`Story mention: Merchant IG ${merchantInstagramId} does not match store IG ${settings.instagramBusinessAccountId}`);
        return;
      }

      // Step 1: Look up existing scoped ID mapping
      let mapping = await storage.getMerchantScopedUserMap(settings.id, senderScopedId);
      let customerId = mapping?.spiralCustomerId;

      // Step 2: If no mapping exists, try to resolve username via Instagram Profile API and match
      if (!mapping) {
        console.log(`Story mention: No scoped ID mapping for ${senderScopedId}, attempting profile lookup`);
        
        let resolvedUsername = '';
        try {
          // Use the merchant's Instagram access token to resolve the sender's profile
          if (settings.instagramAccessToken) {
            const profileUrl = `https://graph.instagram.com/v18.0/${senderScopedId}?fields=username&access_token=${settings.instagramAccessToken}`;
            const profileRes = await fetch(profileUrl);
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              resolvedUsername = profileData.username || '';
              console.log(`Story mention: Resolved scoped ID ${senderScopedId} to @${resolvedUsername}`);
            } else {
              console.log(`Story mention: Could not resolve profile for ${senderScopedId} (${profileRes.status})`);
            }
          }
        } catch (err) {
          console.error('Story mention: Error resolving profile:', err);
        }

        // Match by Instagram username
        if (resolvedUsername) {
          const customer = await storage.getSpiralCustomerByInstagramHandle(resolvedUsername);
          if (customer) {
            customerId = customer.id;
            // Create the mapping for future lookups
            await storage.createMerchantScopedUserMap({
              merchantId: settings.id,
              senderScopedId,
              spiralCustomerId: customer.id,
              instagramHandle: resolvedUsername,
            });
            console.log(`Story mention: Created scoped ID mapping: ${senderScopedId} -> customer ${customer.id} (@${resolvedUsername})`);
          } else {
            console.log(`Story mention: No Spiral customer found for @${resolvedUsername}`);
          }
        }
      }

      if (!customerId) {
        console.log(`Story mention: Could not identify customer for scoped ID ${senderScopedId}`);
        return;
      }

      // Step 3: Find pending orders for this customer
      const customerOrders = await storage.getOrdersByCustomerId(customerId);
      const pendingOrders = customerOrders.filter(o => 
        o.verificationStatus === 'pending' || o.verificationStatus === 'story_detected'
      );

      if (pendingOrders.length === 0) {
        console.log(`Story mention: No pending orders for customer ${customerId}`);
        // Send a DM letting them know
        await sendInstagramDM(senderScopedId, "Thanks for tagging us! We don't see any pending orders for your account right now.");
        return;
      }

      // Step 4: Verify the most recent pending order
      const orderToVerify = pendingOrders.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0];

      console.log(`Story mention: Verifying order ${orderToVerify.id} for customer ${customerId}`);

      // If there's an existing verification record, update it
      if (orderToVerify.verificationId) {
        await storage.markStoryDetectedAndVerified(orderToVerify.verificationId, storyUrl, senderScopedId);
      } else {
        // Create a new verification record and mark it verified
        const customer = await storage.getSpiralCustomerById(customerId);
        if (customer) {
          const verification = await storage.createVerification({
            orderId: orderToVerify.id,
            shopperEmail: orderToVerify.shopperEmail,
            instagramHandle: customer.instagramHandle || '',
            instagramUserId: customer.instagramUserId || '',
            followerCount: customer.followerCount || 0,
            discountAmount: orderToVerify.discountAmount,
            status: 'verified',
            storyMediaId: null,
            storyUrl,
            senderScopedId,
          });
          await storage.updateOrderVerificationId(orderToVerify.id, verification.id);
        }
      }

      // Update order verification status
      await storage.updateOrderVerificationStatus(orderToVerify.id, 'verified');
      await storage.updateOrderWebhookTimestamp(orderToVerify.id);

      console.log(`Story mention: Order ${orderToVerify.id} VERIFIED via story mention`);

      // Send confirmation DM
      const discountAmt = parseFloat(orderToVerify.discountAmount || '0');
      await sendInstagramDM(senderScopedId, 
        `Your story has been verified! You saved $${discountAmt.toFixed(2)} on your order. Thanks for sharing!`
      );
    } catch (error) {
      console.error('Error handling story mention:', error);
    }
  }

  // Helper: Send DM back to user via Instagram API. Returns true on success, false on failure.
  async function sendInstagramDM(recipientId: string, message: string): Promise<boolean> {
    try {
      const accessToken = process.env.SPIRAL_INSTAGRAM_ACCESS_TOKEN;
      const settings = await storage.getStoreSettings();
      const pageId = settings?.instagramPageId;
      
      if (!accessToken || !pageId) {
        console.log('Instagram access token or page ID not configured, skipping DM reply');
        return false;
      }

      const url = `https://graph.instagram.com/v21.0/${pageId}/messages`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to send Instagram DM:', response.status, errorData);
        return false;
      }

      console.log(`Sent Instagram DM to ${recipientId}: "${message}"`);
      return true;
    } catch (error) {
      console.error('Error sending Instagram DM:', error);
      return false;
    }
  }

  const httpServer = createServer(app);

  // Start the Instagram connect reminder worker
  setTimeout(() => { void processInstagramReminders(); }, 60 * 1000);
  setInterval(() => { void processInstagramReminders(); }, INSTAGRAM_REMINDER_INTERVAL_MS);

  return httpServer;
}
