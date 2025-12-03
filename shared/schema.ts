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
});

export const discountTiers = pgTable("discount_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id"),
  fromFollowers: integer("from_followers").notNull(),
  toFollowers: integer("to_followers"),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
});

export const verifications = pgTable("verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopperEmail: text("shopper_email").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  followerCount: integer("follower_count").notNull(),
  postUrl: text("post_url").notNull(),
  status: text("status").notNull(),
  verifiedAt: timestamp("verified_at").notNull().defaultNow(),
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

export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  productSelectionType: text("product_selection_type").notNull().default("all"),
  postingWindowDays: integer("posting_window_days").notNull().default(7),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const campaignProducts = pgTable("campaign_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull(),
  productId: varchar("product_id").notNull(),
});

export const campaignCollections = pgTable("campaign_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull(),
  collectionId: varchar("collection_id").notNull(),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyOrderId: text("shopify_order_id").notNull().unique(),
  shopperEmail: text("shopper_email").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  followerCount: integer("follower_count").notNull(),
  discountPercent: numeric("discount_percent", { precision: 5, scale: 2 }).notNull(),
  orderTotal: numeric("order_total", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  fulfilledAt: timestamp("fulfilled_at"),
  postDeadline: timestamp("post_deadline"),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertStoreSettingsSchema = createInsertSchema(storeSettings).omit({ id: true });
export const insertDiscountTierSchema = createInsertSchema(discountTiers)
  .omit({ id: true })
  .extend({
    campaignId: z.string().nullable().optional(),
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
export const insertVerificationSchema = createInsertSchema(verifications).omit({ id: true, verifiedAt: true });
export const insertShopifyProductSchema = createInsertSchema(shopifyProducts).omit({ id: true, syncedAt: true });
export const insertShopifyCollectionSchema = createInsertSchema(shopifyCollections).omit({ id: true, syncedAt: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCampaignProductSchema = createInsertSchema(campaignProducts).omit({ id: true });
export const insertCampaignCollectionSchema = createInsertSchema(campaignCollections).omit({ id: true });
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
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaignProduct = z.infer<typeof insertCampaignProductSchema>;
export type CampaignProduct = typeof campaignProducts.$inferSelect;
export type InsertCampaignCollection = z.infer<typeof insertCampaignCollectionSchema>;
export type CampaignCollection = typeof campaignCollections.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
