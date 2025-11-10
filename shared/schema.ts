import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const storeSettings = pgTable("store_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeName: text("store_name").notNull(),
  instagramHandle: text("instagram_handle").notNull(),
  tokenActive: boolean("token_active").notNull().default(true),
  shopDomain: text("shop_domain"),
  accessToken: text("access_token"),
});

export const discountTiers = pgTable("discount_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  minFollowers: integer("min_followers").notNull(),
  maxFollowers: integer("max_followers").notNull(),
  discountPercent: integer("discount_percent").notNull(),
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

export const insertStoreSettingsSchema = createInsertSchema(storeSettings).omit({ id: true });
export const insertDiscountTierSchema = createInsertSchema(discountTiers).omit({ id: true });
export const insertVerificationSchema = createInsertSchema(verifications).omit({ id: true, verifiedAt: true });

export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type InsertDiscountTier = z.infer<typeof insertDiscountTierSchema>;
export type DiscountTier = typeof discountTiers.$inferSelect;
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verifications.$inferSelect;
