import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const storeSettings = pgTable("store_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeName: text("store_name").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  tokenActive: boolean("token_active").notNull().default(true),
  shopDomain: text("shop_domain"),
  accessToken: text("access_token"),
  minFollowers: integer("min_followers").notNull().default(0),
  instagramBusinessAccountId: text("instagram_business_account_id"),
  instagramPageId: text("instagram_page_id"),
  instagramUsername: text("instagram_username"),
  instagramAccessToken: text("instagram_access_token"),
  spiralEnabled: boolean("spiral_enabled").notNull().default(false),
  productSelectionType: text("product_selection_type").notNull().default("all"),
  postingWindowDays: integer("posting_window_days").notNull().default(7),
  webhookSubscriptionStatus: text("webhook_subscription_status").default("inactive"),
  lastWebhookReceivedAt: timestamp("last_webhook_received_at"),
});

export const discountTiers = pgTable("discount_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromFollowers: integer("from_followers").notNull(),
  toFollowers: integer("to_followers"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
});

// Verification status lifecycle:
// - pending: Order delivered, waiting for customer to post Story tagging merchant
// - story_detected: Story mention webhook received, matched to order (legacy/transient)
// - awaiting_review: Story mention received; deferred public-story cross-check pending or failed (Close Friends / deleted)
// - verified: Verification complete, discount confirmed
export const verifications = pgTable("verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  shopperEmail: text("shopper_email").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  instagramUserId: text("instagram_user_id").notNull(),
  followerCount: integer("follower_count").notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  storyMediaId: text("story_media_id"),
  storyUrl: text("story_url"),
  storyDetectedAt: timestamp("story_detected_at"),
  verifiedAt: timestamp("verified_at"),
  webhookTimestamp: timestamp("webhook_timestamp"),
  senderScopedId: text("sender_scoped_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shopifyProducts = pgTable("shopify_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyProductId: text("shopify_product_id").notNull().unique(),
  title: text("title").notNull(),
  handle: text("handle").notNull(),
  productType: text("product_type"),
  vendor: text("vendor"),
  imageUrl: text("image_url"),
  variants: text("variants").notNull(),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const shopifyCollections = pgTable("shopify_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyCollectionId: text("shopify_collection_id").notNull().unique(),
  title: text("title").notNull(),
  handle: text("handle").notNull(),
  productCount: integer("product_count").notNull().default(0),
  syncedAt: timestamp("synced_at").notNull().defaultNow(),
});

export const selectedProducts = pgTable("selected_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull(),
});

export const selectedCollections = pgTable("selected_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").notNull(),
});

// Spiral customers - synced from iOS app, used for checkout authentication
export const spiralCustomers = pgTable("spiral_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  passwordHash: text("password_hash").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerificationCode: text("email_verification_code"),
  emailVerificationExpiresAt: timestamp("email_verification_expires_at"),
  instagramHandle: text("instagram_handle"),
  instagramUserId: text("instagram_user_id"),
  instagramAccessToken: text("instagram_access_token"),
  instagramTokenExpiry: timestamp("instagram_token_expiry"),
  instagramProfilePicture: text("instagram_profile_picture"),
  instagramAccountType: text("instagram_account_type"),
  followerCount: integer("follower_count"),
  followerCountUpdatedAt: timestamp("follower_count_updated_at"),
  dateOfBirth: text("date_of_birth"),
  address: text("address"),
  country: text("country"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
  instagramReminderSentAt: timestamp("instagram_reminder_sent_at"),
  marketingEmailOptOut: boolean("marketing_email_opt_out").notNull().default(false),
  marketingEmailOptOutAt: timestamp("marketing_email_opt_out_at"),
  unsubscribeToken: text("unsubscribe_token").unique(),
  iosPushToken: text("ios_push_token"),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyOrderId: text("shopify_order_id").notNull().unique(),
  shopperEmail: text("shopper_email").notNull(),
  spiralCustomerId: varchar("spiral_customer_id"),
  instagramHandle: text("instagram_handle"),
  instagramUserId: text("instagram_user_id"),
  followerCount: integer("follower_count"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
  orderTotal: numeric("order_total", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  fulfilledAt: timestamp("fulfilled_at"),
  deliveredAt: timestamp("delivered_at"),
  postDeadline: timestamp("post_deadline"),
  // Verification status:
  //   pending          - delivered, no Story posted yet (locks future discount)
  //   awaiting_review  - Story tag received, quick publicity check pending (locks future discount)
  //   quick_verified   - Story passed 3-min public check, awaiting 10h final check (UNLOCKS future discount)
  //   verified         - Final check passed, discount confirmed (UNLOCKS future discount)
  //   not_public       - Quick check failed (Close Friends or already deleted) — repost to unlock (locks)
  //   taken_down_early - Final check failed (Story disappeared <24h) — repost to unlock (locks)
  verificationStatus: text("verification_status").notNull().default("pending"),
  verificationId: varchar("verification_id"),
  webhookTimestamp: timestamp("webhook_timestamp"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Store & product info for customer display
  storeName: text("store_name"),
  storeLogo: text("store_logo"),
  lineItems: text("line_items"), // JSON array of {title, quantity}
});

// Spiral verification codes - for DM-based Instagram verification
// Status: pending (waiting for DM), verified (DM received, Instagram linked), expired (24h passed)
export const spiralCodes = pgTable("spiral_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  customerId: varchar("customer_id").notNull(),
  status: text("status").notNull().default("pending"),
  // Instagram handle entered by customer before DMing (used for follower lookup)
  claimedHandle: text("claimed_handle"),
  // Instagram data (populated when DM received)
  instagramUserId: text("instagram_user_id"),
  instagramHandle: text("instagram_handle"),
  // Timestamps
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  verifiedAt: timestamp("verified_at"),
});

// Tracks failed email send attempts (Resend errors or thrown exceptions) so admins can see delivery problems.
export const emailSendFailures = pgTable("email_send_failures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emailType: text("email_type").notNull(),
  recipient: text("recipient").notNull(),
  reason: text("reason").notNull(),
  errorName: text("error_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Deferred public-story cross-check (anti Close Friends).
// Created when a story_mention webhook fires; processed ~10h later by a worker
// that hits the RapidAPI Instagram scraper to confirm the story is still publicly visible.
export const publicityChecks = pgTable("publicity_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  verificationId: varchar("verification_id").notNull(),
  orderId: varchar("order_id").notNull(),
  customerId: varchar("customer_id").notNull(),
  instagramUserId: text("instagram_user_id").notNull(),
  senderScopedId: text("sender_scoped_id"),
  storyMediaId: text("story_media_id"),
  storyUrl: text("story_url"),
  webhookReceivedAt: timestamp("webhook_received_at").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  // Two-stage check:
  //   - 'quick'  ~3 min after webhook, proves the Story is publicly visible (not Close Friends)
  //   - 'final'  ~10 h after webhook, proves the Story stayed up
  stage: text("stage").notNull().default("quick"),
  attempts: integer("attempts").notNull().default(0),
  // Result codes: verified, quick_passed, deleted_or_close_friends, taken_down_early, scraper_error, max_attempts_exceeded
  lastResult: text("last_result"),
  lastError: text("last_error"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const merchantScopedUserMap = pgTable("merchant_scoped_user_map", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  merchantId: varchar("merchant_id").notNull(),
  senderScopedId: text("sender_scoped_id").notNull(),
  spiralCustomerId: varchar("spiral_customer_id").notNull(),
  instagramHandle: text("instagram_handle"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
});

export const insertStoreSettingsSchema = createInsertSchema(storeSettings).omit({ id: true });
export const insertDiscountTierSchema = createInsertSchema(discountTiers)
  .omit({ id: true })
  .extend({
    discountPercent: z.coerce.number().min(2.5, "Minimum discount allowed is 2.5%"),
    fromFollowers: z.number().int().min(0, "Followers must be non-negative"),
    toFollowers: z.number().int().min(0, "Followers must be non-negative").nullable(),
  })
  .refine(
    (data) => !data.toFollowers || data.toFollowers > data.fromFollowers,
    {
      message: "To followers must be greater than from followers",
      path: ["toFollowers"],
    }
  );
export const insertVerificationSchema = createInsertSchema(verifications).omit({ 
  id: true, 
  createdAt: true,
  verifiedAt: true,
  storyDetectedAt: true,
  webhookTimestamp: true,
});
export const insertMerchantScopedUserMapSchema = createInsertSchema(merchantScopedUserMap).omit({ id: true, firstSeenAt: true });
export const insertEmailSendFailureSchema = createInsertSchema(emailSendFailures).omit({ id: true, createdAt: true });
export const insertShopifyProductSchema = createInsertSchema(shopifyProducts).omit({ id: true, syncedAt: true });
export const insertShopifyCollectionSchema = createInsertSchema(shopifyCollections).omit({ id: true, syncedAt: true });
export const insertSelectedProductSchema = createInsertSchema(selectedProducts).omit({ id: true });
export const insertSelectedCollectionSchema = createInsertSchema(selectedCollections).omit({ id: true });
export const insertSpiralCustomerSchema = createInsertSchema(spiralCustomers).omit({ id: true, createdAt: true, lastLoginAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });
export const insertSpiralCodeSchema = createInsertSchema(spiralCodes).omit({ id: true, createdAt: true, verifiedAt: true });
export const insertPublicityCheckSchema = createInsertSchema(publicityChecks).omit({ id: true, createdAt: true, completedAt: true, attempts: true, lastResult: true, lastError: true, stage: true }).extend({
  stage: z.enum(["quick", "final"]).default("quick"),
});

export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type InsertDiscountTier = z.infer<typeof insertDiscountTierSchema>;
export type DiscountTier = typeof discountTiers.$inferSelect;
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verifications.$inferSelect;
export type InsertShopifyProduct = z.infer<typeof insertShopifyProductSchema>;
export type ShopifyProduct = typeof shopifyProducts.$inferSelect;
export type InsertShopifyCollection = z.infer<typeof insertShopifyCollectionSchema>;
export type ShopifyCollection = typeof shopifyCollections.$inferSelect;
export type InsertSelectedProduct = z.infer<typeof insertSelectedProductSchema>;
export type SelectedProduct = typeof selectedProducts.$inferSelect;
export type InsertSelectedCollection = z.infer<typeof insertSelectedCollectionSchema>;
export type SelectedCollection = typeof selectedCollections.$inferSelect;
export type InsertSpiralCustomer = z.infer<typeof insertSpiralCustomerSchema>;
export type SpiralCustomer = typeof spiralCustomers.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertSpiralCode = z.infer<typeof insertSpiralCodeSchema>;
export type SpiralCode = typeof spiralCodes.$inferSelect;
export type InsertMerchantScopedUserMap = z.infer<typeof insertMerchantScopedUserMapSchema>;
export type MerchantScopedUserMap = typeof merchantScopedUserMap.$inferSelect;
export type InsertEmailSendFailure = z.infer<typeof insertEmailSendFailureSchema>;
export type EmailSendFailure = typeof emailSendFailures.$inferSelect;
export type InsertPublicityCheck = z.infer<typeof insertPublicityCheckSchema>;
export type PublicityCheck = typeof publicityChecks.$inferSelect;
