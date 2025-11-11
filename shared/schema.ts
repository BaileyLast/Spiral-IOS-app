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
});

export const discountTiers = pgTable("discount_tiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
export const insertVerificationSchema = createInsertSchema(verifications).omit({ id: true, verifiedAt: true });

export type InsertStoreSettings = z.infer<typeof insertStoreSettingsSchema>;
export type StoreSettings = typeof storeSettings.$inferSelect;
export type InsertDiscountTier = z.infer<typeof insertDiscountTierSchema>;
export type DiscountTier = typeof discountTiers.$inferSelect;
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verifications.$inferSelect;
