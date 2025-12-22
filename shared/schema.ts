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
});

export const discountTiers = pgTable("discount_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fromFollowers: integer("from_followers").notNull(),
  toFollowers: integer("to_followers"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
});

// Verification status lifecycle:
// - pending: Order placed, waiting for customer to post story
// - story_detected: Story found tagging brand, 22-hour timer started
// - verified: Story confirmed still up after 22 hours, discount kept
// - failed: Story not found or removed before 22 hours, clawback triggered
export const verifications = pgTable("verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull(),
  shopperEmail: text("shopper_email").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  instagramUserId: text("instagram_user_id").notNull(),
  followerCount: integer("follower_count").notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  // Verification lifecycle status
  status: text("status").notNull().default("pending"),
  // Story tracking
  storyMediaId: text("story_media_id"),
  storyUrl: text("story_url"),
  storyDetectedAt: timestamp("story_detected_at"),
  confirmationDueAt: timestamp("confirmation_due_at"),
  // Final verification
  verifiedAt: timestamp("verified_at"),
  failedAt: timestamp("failed_at"),
  failureReason: text("failure_reason"),
  // Clawback tracking
  clawbackTriggered: boolean("clawback_triggered").notNull().default(false),
  clawbackAmount: numeric("clawback_amount", { precision: 10, scale: 2 }),
  clawbackRefundId: text("clawback_refund_id"),
  // Timestamps
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

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyOrderId: text("shopify_order_id").notNull().unique(),
  shopperEmail: text("shopper_email").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  instagramUserId: text("instagram_user_id").notNull(),
  followerCount: integer("follower_count").notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
  orderTotal: numeric("order_total", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  // Order status: pending, fulfilled, delivered
  status: text("status").notNull().default("pending"),
  fulfilledAt: timestamp("fulfilled_at"),
  deliveredAt: timestamp("delivered_at"),
  postDeadline: timestamp("post_deadline"),
  // Verification status: pending_verification, verified, failed, clawback_complete
  verificationStatus: text("verification_status").notNull().default("pending_verification"),
  verificationId: varchar("verification_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  failedAt: true,
  storyDetectedAt: true,
  confirmationDueAt: true,
});
export const insertShopifyProductSchema = createInsertSchema(shopifyProducts).omit({ id: true, syncedAt: true });
export const insertShopifyCollectionSchema = createInsertSchema(shopifyCollections).omit({ id: true, syncedAt: true });
export const insertSelectedProductSchema = createInsertSchema(selectedProducts).omit({ id: true });
export const insertSelectedCollectionSchema = createInsertSchema(selectedCollections).omit({ id: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true });

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
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
