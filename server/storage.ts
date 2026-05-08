import { OWED_VERIFICATION_ANYDELIVERY, OWED_VERIFICATION_DELIVERED_ONLY } from "@shared/schema";
import { 
  storeSettings, 
  discountTiers, 
  verifications,
  shopifyProducts,
  shopifyCollections,
  selectedProducts,
  selectedCollections,
  spiralCustomers,
  orders,
  spiralCodes,
  merchantScopedUserMap,
  emailSendFailures,
  publicityChecks,
  type StoreSettings, 
  type DiscountTier, 
  type Verification,
  type ShopifyProduct,
  type ShopifyCollection,
  type SpiralCustomer,
  type Order,
  type SpiralCode,
  type MerchantScopedUserMap,
  type InsertStoreSettings,
  type InsertDiscountTier,
  type InsertVerification,
  type InsertShopifyProduct,
  type InsertShopifyCollection,
  type InsertSpiralCustomer,
  type InsertOrder,
  type InsertSpiralCode,
  type InsertMerchantScopedUserMap,
  type EmailSendFailure,
  type InsertEmailSendFailure,
  type PublicityCheck,
  type InsertPublicityCheck,
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray, and, or, lt, isNull, desc, sql, type SQL } from "drizzle-orm";
import { randomBytes } from "crypto";

export interface IStorage {
  getStoreSettings(): Promise<StoreSettings | undefined>;
  updateStoreSettings(settings: InsertStoreSettings): Promise<StoreSettings>;
  updateSpiralSettings(settings: Partial<InsertStoreSettings>): Promise<StoreSettings>;
  updateMinFollowers(minFollowers: number): Promise<StoreSettings>;
  getDiscountTiers(): Promise<DiscountTier[]>;
  createDiscountTier(tier: InsertDiscountTier): Promise<DiscountTier>;
  updateDiscountTier(id: string, tier: InsertDiscountTier): Promise<DiscountTier>;
  deleteDiscountTier(id: string): Promise<void>;
  replaceAllDiscountTiers(tiers: InsertDiscountTier[]): Promise<DiscountTier[]>;
  // Verification lifecycle
  getVerifications(): Promise<Verification[]>;
  createVerification(verification: InsertVerification): Promise<Verification>;
  getVerificationById(id: string): Promise<Verification | undefined>;
  getVerificationByInstagramUserId(instagramUserId: string, orderId: string): Promise<Verification | undefined>;
  getPendingVerificationsForCheck(): Promise<Verification[]>;
  markStoryDetected(verificationId: string, storyMediaId: string, storyUrl: string, senderScopedId?: string): Promise<Verification>;
  markVerified(verificationId: string): Promise<Verification>;
  markStoryDetectedAndVerified(verificationId: string, storyUrl: string, senderScopedId: string): Promise<Verification>;
  // Orders
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(): Promise<Order[]>;
  getOrderById(id: string): Promise<Order | undefined>;
  getOrderByShopifyOrderId(shopifyOrderId: string): Promise<Order | undefined>;
  getOrderByInstagramUserId(instagramUserId: string): Promise<Order | undefined>;
  updateOrderVerificationStatus(orderId: string, status: string, verificationId?: string): Promise<void>;
  updateOrderFulfillment(orderId: string, fulfilledAt: Date, postDeadline: Date): Promise<Order>;
  // Products and Collections
  syncProducts(products: InsertShopifyProduct[]): Promise<ShopifyProduct[]>;
  getProducts(): Promise<ShopifyProduct[]>;
  syncCollections(collections: InsertShopifyCollection[]): Promise<ShopifyCollection[]>;
  getCollections(): Promise<ShopifyCollection[]>;
  getSelectedProducts(): Promise<ShopifyProduct[]>;
  getSelectedCollections(): Promise<ShopifyCollection[]>;
  setSelectedProducts(productIds: string[]): Promise<void>;
  setSelectedCollections(collectionIds: string[]): Promise<void>;
  // Spiral Customers
  createSpiralCustomer(customer: InsertSpiralCustomer): Promise<SpiralCustomer>;
  getSpiralCustomerByEmail(email: string): Promise<SpiralCustomer | undefined>;
  getSpiralCustomerById(id: string): Promise<SpiralCustomer | undefined>;
  updateSpiralCustomerFollowerCount(id: string, followerCount: number): Promise<SpiralCustomer>;
  updateSpiralCustomerLastLogin(id: string): Promise<void>;
  updateSpiralCustomerInstagram(id: string, data: {
    instagramHandle: string | null;
    instagramUserId: string | null;
    instagramAccessToken: string | null;
    instagramTokenExpiry: Date | null;
    instagramProfilePicture: string | null;
    instagramAccountType: string | null;
    followerCount: number | null;
  }): Promise<SpiralCustomer>;
  updateSpiralCustomerEmailVerified(id: string, verified: boolean): Promise<SpiralCustomer>;
  updateSpiralCustomerVerificationCode(id: string, code: string, expiresAt: Date): Promise<SpiralCustomer>;
  updateSpiralCustomerProfile(id: string, data: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; address?: string | null; country?: string | null }): Promise<SpiralCustomer>;
  getOrdersByCustomerId(customerId: string): Promise<Order[]>;
  getUnverifiedDeliveredOrdersByCustomerId(customerId: string): Promise<Order[]>;
  // Spiral verification codes
  createSpiralCode(code: InsertSpiralCode): Promise<SpiralCode>;
  getSpiralCodeByCode(code: string): Promise<SpiralCode | undefined>;
  getSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined>;
  getPendingSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined>;
  verifySpiralCode(code: string, instagramUserId: string, instagramHandle: string): Promise<SpiralCode>;
  updateSpiralCodeClaimedHandle(customerId: string, claimedHandle: string): Promise<void>;
  invalidateSpiralCode(code: string): Promise<void>;
  // Merchant scoped user map (with negative-cache support)
  createMerchantScopedUserMap(map: InsertMerchantScopedUserMap): Promise<MerchantScopedUserMap>;
  getMerchantScopedUserMap(merchantId: string, senderScopedId: string): Promise<MerchantScopedUserMap | undefined>;
  getMerchantScopedUserMapByCustomer(merchantId: string, customerId: string): Promise<MerchantScopedUserMap | undefined>;
  // Negative cache: record that a scoped ID is confirmed NOT a Spiral customer
  // so future story_mentions from this sender exit in a single indexed lookup.
  recordNonSpiralScopedId(merchantId: string, senderScopedId: string, instagramHandle?: string | null, instagramGlobalUserId?: string | null): Promise<void>;
  clearNegativeCacheForInstagramIdentity(identity: { senderScopedId?: string | null; instagramUserId?: string | null; instagramHandle?: string | null; instagramGlobalUserId?: string | null }): Promise<number>;
  // Persist the canonical, account-wide Instagram numeric ID on a customer.
  // Resolved via the public-data scraper since Meta hides this from page-scoped
  // contexts. Used to match negative-cache rows across merchants at signup.
  updateSpiralCustomerGlobalUserId(id: string, instagramGlobalUserId: string): Promise<void>;
  // Touch lastSeenAt and refresh the cached display handle on repeat sightings.
  touchMerchantScopedUserMap(id: string, instagramHandle?: string | null): Promise<void>;
  // Refresh the customer's stored handle (display only) when Instagram returns
  // a new username for an immutable user ID. Backend identity uses instagramUserId.
  updateSpiralCustomerHandle(id: string, instagramHandle: string): Promise<void>;
  // Store settings webhook tracking
  updateStoreWebhookStatus(id: string, status: string): Promise<void>;
  updateStoreLastWebhookReceived(id: string): Promise<void>;
  // Customer lookup by Instagram handle
  getSpiralCustomerByInstagramHandle(handle: string): Promise<SpiralCustomer | undefined>;
  // Instagram connect reminder
  getCustomersNeedingInstagramReminder(createdBefore: Date): Promise<SpiralCustomer[]>;
  markInstagramReminderSent(id: string): Promise<void>;
  // Marketing email unsubscribe
  ensureUnsubscribeToken(id: string): Promise<string>;
  getSpiralCustomerByUnsubscribeToken(token: string): Promise<SpiralCustomer | undefined>;
  setMarketingEmailOptOut(id: string, optOut: boolean): Promise<SpiralCustomer>;
  // Order webhook tracking
  updateOrderWebhookTimestamp(orderId: string): Promise<void>;
  updateOrderVerificationId(orderId: string, verificationId: string): Promise<void>;
  // Email send failures
  recordEmailSendFailure(failure: InsertEmailSendFailure): Promise<EmailSendFailure>;
  getRecentEmailSendFailures(limit?: number): Promise<EmailSendFailure[]>;
  // Publicity checks (deferred public-story cross-check)
  createPublicityCheck(check: InsertPublicityCheck): Promise<PublicityCheck>;
  getDuePublicityChecks(now: Date): Promise<PublicityCheck[]>;
  getIncompletePublicityCheckByVerification(verificationId: string): Promise<PublicityCheck | undefined>;
  getPublicityCheckByVerificationAndStage(verificationId: string, stage: string): Promise<PublicityCheck | undefined>;
  recordPublicityCheckAttempt(id: string, opts: { lastError?: string | null; lastResult?: string | null; rescheduleAt?: Date | null; completed?: boolean }): Promise<PublicityCheck>;
  // Verification status helpers used by publicity check worker
  markVerificationAwaitingReview(verificationId: string, storyMediaId: string | null): Promise<void>;
  // iOS push token registration (for fail/reminder notifications only — never used for success)
  updateSpiralCustomerPushToken(id: string, token: string | null): Promise<void>;
  // Soft-ban writes. Reason is a short machine-tag (e.g. 'not_public','taken_down_early','delivery_pending','inherited_from_instagram').
  setCustomerSoftBanned(id: string, reason: string): Promise<void>;
  clearCustomerSoftBan(id: string): Promise<void>;
  // Mark an order's status as 'delivered' (transitions order.status, sets deliveredAt if column exists).
  markOrderDelivered(orderId: string): Promise<Order>;
  // Cross-account Instagram identity lookup. Returns every Spiral customer
  // whose Instagram identity matches (by global pk OR by page-scoped user ID).
  // Used to anchor soft-ban to the Instagram account, not the email — closes
  // the "new email + same IG" Story-debt exploit at signup.
  getCustomersByInstagramIdentity(identity: { instagramGlobalUserId?: string | null; instagramUserId?: string | null }): Promise<SpiralCustomer[]>;
  // Deletion-resilient owed-order lookup keyed by Instagram identity rather
  // than spiral_customers.id — survives account deletion so a shopper can't
  // wipe their Story debt by deleting + re-signing-up with the same IG.
  getOwedOrdersByInstagramIdentity(identity: { instagramGlobalUserId?: string | null; instagramUserId?: string | null }): Promise<Order[]>;
  // Hard-delete a customer + all locally-owned related rows. Anonymizes orders
  // (sets spiralCustomerId to null) so historical analytics survive while the
  // account itself is gone. Required for App Store 5.1.1(v) account deletion.
  deleteSpiralCustomerCompletely(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getStoreSettings(): Promise<StoreSettings | undefined> {
    const [settings] = await db.select().from(storeSettings).limit(1);
    return settings || undefined;
  }

  async updateStoreSettings(settings: InsertStoreSettings): Promise<StoreSettings> {
    const existing = await this.getStoreSettings();
    
    if (existing) {
      const [updated] = await db
        .update(storeSettings)
        .set(settings)
        .where(eq(storeSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(storeSettings)
        .values(settings)
        .returning();
      return created;
    }
  }

  async updateSpiralSettings(settings: Partial<InsertStoreSettings>): Promise<StoreSettings> {
    const existing = await this.getStoreSettings();
    
    if (existing) {
      const [updated] = await db
        .update(storeSettings)
        .set(settings)
        .where(eq(storeSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(storeSettings)
        .values({
          storeName: "My Store",
          instagramHandle: "",
          ...settings,
        })
        .returning();
      return created;
    }
  }

  async updateMinFollowers(minFollowers: number): Promise<StoreSettings> {
    const existing = await this.getStoreSettings();
    
    if (existing) {
      const [updated] = await db
        .update(storeSettings)
        .set({ minFollowers })
        .where(eq(storeSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(storeSettings)
        .values({
          storeName: "My Store",
          instagramHandle: "",
          minFollowers,
        })
        .returning();
      return created;
    }
  }

  async getDiscountTiers(): Promise<DiscountTier[]> {
    return await db.select().from(discountTiers);
  }

  async createDiscountTier(tier: InsertDiscountTier): Promise<DiscountTier> {
    const [created] = await db
      .insert(discountTiers)
      .values({
        ...tier,
        discountPercent: tier.discountPercent.toString(),
      })
      .returning();
    return created;
  }

  async updateDiscountTier(id: string, tier: InsertDiscountTier): Promise<DiscountTier> {
    const [updated] = await db
      .update(discountTiers)
      .set({
        ...tier,
        discountPercent: tier.discountPercent.toString(),
      })
      .where(eq(discountTiers.id, id))
      .returning();
    
    if (!updated) {
      throw new Error("Discount tier not found");
    }
    
    return updated;
  }

  async deleteDiscountTier(id: string): Promise<void> {
    const result = await db
      .delete(discountTiers)
      .where(eq(discountTiers.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Discount tier not found");
    }
  }

  async replaceAllDiscountTiers(tiers: InsertDiscountTier[]): Promise<DiscountTier[]> {
    await db.delete(discountTiers);
    
    if (tiers.length === 0) {
      return [];
    }
    
    const created = await db
      .insert(discountTiers)
      .values(
        tiers.map((tier) => ({
          ...tier,
          discountPercent: tier.discountPercent.toString(),
        }))
      )
      .returning();
    
    return created;
  }

  async getVerifications(): Promise<Verification[]> {
    return await db.select().from(verifications);
  }

  async createVerification(verification: InsertVerification): Promise<Verification> {
    const [created] = await db
      .insert(verifications)
      .values(verification)
      .returning();
    return created;
  }

  async getVerificationById(id: string): Promise<Verification | undefined> {
    const [verification] = await db
      .select()
      .from(verifications)
      .where(eq(verifications.id, id));
    return verification;
  }

  async getVerificationByInstagramUserId(instagramUserId: string, orderId: string): Promise<Verification | undefined> {
    const [verification] = await db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.instagramUserId, instagramUserId),
          eq(verifications.orderId, orderId)
        )
      );
    return verification;
  }

  async getPendingVerificationsForCheck(): Promise<Verification[]> {
    return await db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.status, "pending"),
          isNull(verifications.verifiedAt)
        )
      );
  }

  async markStoryDetected(verificationId: string, storyMediaId: string, storyUrl: string, senderScopedId?: string): Promise<Verification> {
    const now = new Date();
    
    const [updated] = await db
      .update(verifications)
      .set({
        status: "story_detected",
        storyMediaId,
        storyUrl,
        storyDetectedAt: now,
        webhookTimestamp: now,
        senderScopedId: senderScopedId || null,
      })
      .where(eq(verifications.id, verificationId))
      .returning();
    
    return updated;
  }

  async markVerified(verificationId: string): Promise<Verification> {
    const [updated] = await db
      .update(verifications)
      .set({
        status: "verified",
        verifiedAt: new Date(),
      })
      .where(eq(verifications.id, verificationId))
      .returning();
    
    return updated;
  }

  async markStoryDetectedAndVerified(verificationId: string, storyUrl: string, senderScopedId: string): Promise<Verification> {
    const now = new Date();
    const [updated] = await db
      .update(verifications)
      .set({
        status: "verified",
        storyUrl,
        storyDetectedAt: now,
        webhookTimestamp: now,
        verifiedAt: now,
        senderScopedId,
      })
      .where(eq(verifications.id, verificationId))
      .returning();
    return updated;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [created] = await db
      .insert(orders)
      .values(order)
      .returning();
    return created;
  }

  async getOrderByShopifyOrderId(shopifyOrderId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.shopifyOrderId, shopifyOrderId));
    return order;
  }

  async getOrderByInstagramUserId(instagramUserId: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.instagramUserId, instagramUserId),
          eq(orders.verificationStatus, "pending")
        )
      );
    return order;
  }

  async getOrders(): Promise<Order[]> {
    return await db.select().from(orders);
  }

  async getOrderById(id: string): Promise<Order | undefined> {
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id));
    return order;
  }

  async updateOrderVerificationStatus(orderId: string, status: string, verificationId?: string): Promise<void> {
    await db
      .update(orders)
      .set({
        verificationStatus: status,
        ...(verificationId && { verificationId }),
      })
      .where(eq(orders.id, orderId));
  }

  async updateOrderFulfillment(orderId: string, fulfilledAt: Date, postDeadline: Date): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({
        status: 'fulfilled',
        fulfilledAt,
        postDeadline,
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async syncProducts(products: InsertShopifyProduct[]): Promise<ShopifyProduct[]> {
    await db.delete(shopifyProducts);
    
    if (products.length === 0) {
      return [];
    }
    
    const created = await db
      .insert(shopifyProducts)
      .values(products)
      .returning();
    
    return created;
  }

  async getProducts(): Promise<ShopifyProduct[]> {
    return await db.select().from(shopifyProducts);
  }

  async syncCollections(collections: InsertShopifyCollection[]): Promise<ShopifyCollection[]> {
    await db.delete(shopifyCollections);
    
    if (collections.length === 0) {
      return [];
    }
    
    const created = await db
      .insert(shopifyCollections)
      .values(collections)
      .returning();
    
    return created;
  }

  async getCollections(): Promise<ShopifyCollection[]> {
    return await db.select().from(shopifyCollections);
  }

  async getSelectedProducts(): Promise<ShopifyProduct[]> {
    const productLinks = await db.select().from(selectedProducts);
    
    if (productLinks.length === 0) {
      return [];
    }
    
    const shopifyProductIds = productLinks.map(link => link.productId);
    const products = await db
      .select()
      .from(shopifyProducts)
      .where(inArray(shopifyProducts.shopifyProductId, shopifyProductIds));
    
    return products;
  }

  async getSelectedCollections(): Promise<ShopifyCollection[]> {
    const collectionLinks = await db.select().from(selectedCollections);
    
    if (collectionLinks.length === 0) {
      return [];
    }
    
    const shopifyCollectionIds = collectionLinks.map(link => link.collectionId);
    const collections = await db
      .select()
      .from(shopifyCollections)
      .where(inArray(shopifyCollections.shopifyCollectionId, shopifyCollectionIds));
    
    return collections;
  }

  async setSelectedProducts(shopifyProductIds: string[]): Promise<void> {
    await db.delete(selectedProducts);
    
    if (shopifyProductIds.length > 0) {
      await db
        .insert(selectedProducts)
        .values(shopifyProductIds.map(productId => ({ productId })));
    }
  }

  async setSelectedCollections(shopifyCollectionIds: string[]): Promise<void> {
    await db.delete(selectedCollections);
    
    if (shopifyCollectionIds.length > 0) {
      await db
        .insert(selectedCollections)
        .values(shopifyCollectionIds.map(collectionId => ({ collectionId })));
    }
  }

  async createSpiralCustomer(customer: InsertSpiralCustomer): Promise<SpiralCustomer> {
    const [created] = await db
      .insert(spiralCustomers)
      .values(customer)
      .returning();
    return created;
  }

  async getSpiralCustomerByEmail(email: string): Promise<SpiralCustomer | undefined> {
    const [customer] = await db
      .select()
      .from(spiralCustomers)
      .where(eq(spiralCustomers.email, email.toLowerCase()));
    return customer;
  }

  async getSpiralCustomerById(id: string): Promise<SpiralCustomer | undefined> {
    const [customer] = await db
      .select()
      .from(spiralCustomers)
      .where(eq(spiralCustomers.id, id));
    return customer;
  }

  async updateSpiralCustomerFollowerCount(id: string, followerCount: number): Promise<SpiralCustomer> {
    const [updated] = await db
      .update(spiralCustomers)
      .set({
        followerCount,
        followerCountUpdatedAt: new Date(),
      })
      .where(eq(spiralCustomers.id, id))
      .returning();
    return updated;
  }

  async updateSpiralCustomerLastLogin(id: string): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({ lastLoginAt: new Date() })
      .where(eq(spiralCustomers.id, id));
  }

  async updateSpiralCustomerGlobalUserId(id: string, instagramGlobalUserId: string): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({ instagramGlobalUserId })
      .where(eq(spiralCustomers.id, id));
  }

  async updateSpiralCustomerInstagram(
    id: string, 
    data: {
      instagramHandle: string | null;
      instagramUserId: string | null;
      instagramAccessToken: string | null;
      instagramTokenExpiry: Date | null;
      instagramProfilePicture: string | null;
      instagramAccountType: string | null;
      followerCount: number | null;
    }
  ): Promise<SpiralCustomer> {
    const [updated] = await db
      .update(spiralCustomers)
      .set({
        instagramHandle: data.instagramHandle,
        instagramUserId: data.instagramUserId,
        instagramAccessToken: data.instagramAccessToken,
        instagramTokenExpiry: data.instagramTokenExpiry,
        instagramProfilePicture: data.instagramProfilePicture,
        instagramAccountType: data.instagramAccountType,
        followerCount: data.followerCount,
        followerCountUpdatedAt: data.instagramHandle ? new Date() : null,
      })
      .where(eq(spiralCustomers.id, id))
      .returning();
    return updated;
  }

  async getOrdersByCustomerId(customerId: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.spiralCustomerId, customerId));
  }

  async getUnverifiedDeliveredOrdersByCustomerId(customerId: string): Promise<Order[]> {
    const all = await db
      .select()
      .from(orders)
      .where(eq(orders.spiralCustomerId, customerId));
    // Soft-ban states: shopper owes a Story for these before they can earn another discount.
    const owedStates = new Set(["pending", "awaiting_review", "not_public", "taken_down_early"]);
    return all.filter((o) => o.status === "delivered" && owedStates.has(o.verificationStatus));
  }

  async updateSpiralCustomerPushToken(id: string, token: string | null): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({ iosPushToken: token })
      .where(eq(spiralCustomers.id, id));
  }

  async setCustomerSoftBanned(id: string, reason: string): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({
        accountStatus: "soft_banned",
        softBannedReason: reason,
        softBannedAt: new Date(),
      })
      .where(eq(spiralCustomers.id, id));
  }

  async clearCustomerSoftBan(id: string): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({
        accountStatus: "active",
        softBannedReason: null,
        softBannedAt: null,
      })
      .where(eq(spiralCustomers.id, id));
  }

  async markOrderDelivered(orderId: string): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(eq(orders.id, orderId))
      .returning();
    return updated;
  }

  async getCustomersByInstagramIdentity(identity: {
    instagramGlobalUserId?: string | null;
    instagramUserId?: string | null;
  }): Promise<SpiralCustomer[]> {
    const conds: SQL[] = [];
    if (identity.instagramGlobalUserId) {
      conds.push(eq(spiralCustomers.instagramGlobalUserId, identity.instagramGlobalUserId));
    }
    if (identity.instagramUserId) {
      conds.push(eq(spiralCustomers.instagramUserId, identity.instagramUserId));
    }
    if (conds.length === 0) return [];
    const where = conds.length === 1 ? conds[0] : or(...conds);
    return await db.select().from(spiralCustomers).where(where);
  }

  async getOwedOrdersByInstagramIdentity(identity: {
    instagramGlobalUserId?: string | null;
    instagramUserId?: string | null;
  }): Promise<Order[]> {
    const idConds: SQL[] = [];
    if (identity.instagramGlobalUserId) {
      idConds.push(eq(orders.instagramGlobalUserId, identity.instagramGlobalUserId));
    }
    if (identity.instagramUserId) {
      idConds.push(eq(orders.instagramUserId, identity.instagramUserId));
    }
    if (idConds.length === 0) return [];
    const idWhere = idConds.length === 1 ? idConds[0] : or(...idConds)!;
    // Owed-state set is the canonical one from shared/schema.ts
    // (OWED_VERIFICATION_ANYDELIVERY + OWED_VERIFICATION_DELIVERED_ONLY).
    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          idWhere,
          or(
            inArray(orders.verificationStatus, [...OWED_VERIFICATION_ANYDELIVERY]),
            and(
              eq(orders.status, 'delivered'),
              inArray(orders.verificationStatus, [...OWED_VERIFICATION_DELIVERED_ONLY]),
            )!,
          )!,
        )!,
      );
    return rows;
  }

  async deleteSpiralCustomerCompletely(id: string): Promise<void> {
    // Atomic: wrap all four writes in a single transaction so a partial
    // failure can't leave dangling spiral_codes / scoped-id rows or an
    // orphaned customer with un-anonymized orders.
    await db.transaction(async (tx) => {
      await tx.delete(spiralCodes).where(eq(spiralCodes.customerId, id));
      await tx
        .delete(merchantScopedUserMap)
        .where(eq(merchantScopedUserMap.spiralCustomerId, id));
      // Anonymize orders — keep historical rows (and their IG identity, so
      // soft-ban inheritance still works) but unlink from the deleted
      // account so /api/customer/orders never re-surfaces them.
      await tx
        .update(orders)
        .set({ spiralCustomerId: null })
        .where(eq(orders.spiralCustomerId, id));
      await tx.delete(spiralCustomers).where(eq(spiralCustomers.id, id));
    });
  }

  async updateSpiralCustomerEmailVerified(id: string, verified: boolean): Promise<SpiralCustomer> {
    const [updated] = await db
      .update(spiralCustomers)
      .set({
        emailVerified: verified,
        emailVerificationCode: null,
        emailVerificationExpiresAt: null,
      })
      .where(eq(spiralCustomers.id, id))
      .returning();
    return updated;
  }

  async updateSpiralCustomerVerificationCode(id: string, code: string, expiresAt: Date): Promise<SpiralCustomer> {
    const [updated] = await db
      .update(spiralCustomers)
      .set({
        emailVerificationCode: code,
        emailVerificationExpiresAt: expiresAt,
      })
      .where(eq(spiralCustomers.id, id))
      .returning();
    return updated;
  }

  async updateSpiralCustomerProfile(id: string, data: { firstName?: string | null; lastName?: string | null; dateOfBirth?: string | null; address?: string | null; country?: string | null }): Promise<SpiralCustomer> {
    const [updated] = await db
      .update(spiralCustomers)
      .set(data)
      .where(eq(spiralCustomers.id, id))
      .returning();
    return updated;
  }

  async createSpiralCode(codeData: InsertSpiralCode): Promise<SpiralCode> {
    // First invalidate any existing pending codes for this customer
    await db
      .update(spiralCodes)
      .set({ status: "expired" })
      .where(
        and(
          eq(spiralCodes.customerId, codeData.customerId),
          eq(spiralCodes.status, "pending")
        )
      );
    
    const [created] = await db
      .insert(spiralCodes)
      .values(codeData)
      .returning();
    return created;
  }

  async getSpiralCodeByCode(code: string): Promise<SpiralCode | undefined> {
    const [spiralCode] = await db
      .select()
      .from(spiralCodes)
      .where(eq(spiralCodes.code, code.toUpperCase()));
    return spiralCode;
  }

  async getSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined> {
    const [spiralCode] = await db
      .select()
      .from(spiralCodes)
      .where(eq(spiralCodes.customerId, customerId))
      .orderBy(desc(spiralCodes.createdAt));
    return spiralCode;
  }

  async getPendingSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined> {
    const [spiralCode] = await db
      .select()
      .from(spiralCodes)
      .where(
        and(
          eq(spiralCodes.customerId, customerId),
          eq(spiralCodes.status, "pending")
        )
      )
      .orderBy(desc(spiralCodes.createdAt));
    return spiralCode;
  }

  async verifySpiralCode(code: string, instagramUserId: string, instagramHandle: string): Promise<SpiralCode> {
    const [updated] = await db
      .update(spiralCodes)
      .set({
        status: "verified",
        instagramUserId,
        instagramHandle,
        verifiedAt: new Date(),
      })
      .where(eq(spiralCodes.code, code.toUpperCase()))
      .returning();
    return updated;
  }

  async updateSpiralCodeClaimedHandle(customerId: string, claimedHandle: string): Promise<void> {
    await db
      .update(spiralCodes)
      .set({ claimedHandle })
      .where(
        and(
          eq(spiralCodes.customerId, customerId),
          eq(spiralCodes.status, "pending")
        )
      );
  }

  async invalidateSpiralCode(code: string): Promise<void> {
    await db
      .update(spiralCodes)
      .set({ status: "expired" })
      .where(eq(spiralCodes.code, code.toUpperCase()));
  }

  // Insert OR upgrade a positive mapping (scoped ID → Spiral customer). If a
  // negative-cache row already exists for this (merchant, scopedId), upgrade it
  // to positive in place. If a positive row already exists, refresh the cached
  // identity fields. Composite uniqueness on (merchantId, senderScopedId) is
  // enforced by the schema, so this is the only correct insert path.
  async createMerchantScopedUserMap(map: InsertMerchantScopedUserMap): Promise<MerchantScopedUserMap> {
    const [created] = await db
      .insert(merchantScopedUserMap)
      .values(map)
      .onConflictDoUpdate({
        target: [merchantScopedUserMap.merchantId, merchantScopedUserMap.senderScopedId],
        set: {
          spiralCustomerId: map.spiralCustomerId,
          instagramUserId: map.instagramUserId,
          instagramHandle: map.instagramHandle,
          isSpiral: true,
          lastSeenAt: new Date(),
        },
      })
      .returning();
    return created;
  }

  async getMerchantScopedUserMap(merchantId: string, senderScopedId: string): Promise<MerchantScopedUserMap | undefined> {
    // Composite uniqueness on (merchantId, senderScopedId) means at most one row.
    const [result] = await db
      .select()
      .from(merchantScopedUserMap)
      .where(
        and(
          eq(merchantScopedUserMap.merchantId, merchantId),
          eq(merchantScopedUserMap.senderScopedId, senderScopedId)
        )
      )
      .limit(1);
    return result;
  }

  // Insert a negative-cache row marking this (merchant, scopedId) as confirmed
  // non-Spiral so future story_mentions from this scoped ID exit in a single
  // indexed lookup. ON CONFLICT DO NOTHING: if a positive row already exists
  // (race with createMerchantScopedUserMap, or a customer connected IG between
  // our Profile API call and this insert), we leave the positive row intact —
  // never downgrade positive → negative.
  async recordNonSpiralScopedId(merchantId: string, senderScopedId: string, instagramHandle?: string | null, instagramGlobalUserId?: string | null): Promise<void> {
    // Normalize identically to clearNegativeCacheForInstagramIdentity so the
    // lookup there always matches what we stored here, regardless of upstream
    // formatting (leading '@', whitespace, etc.).
    const normalizedHandle = instagramHandle
      ? instagramHandle.replace(/^@/, '').trim() || null
      : null;
    await db
      .insert(merchantScopedUserMap)
      .values({
        merchantId,
        senderScopedId,
        spiralCustomerId: null,
        instagramUserId: null,
        // Account-wide Instagram numeric ID — the canonical identifier used to
        // invalidate this row if/when this person becomes a Spiral customer.
        // Stable across handle changes and across merchant pages.
        instagramGlobalUserId: instagramGlobalUserId || null,
        // Display-only fallback; kept for legacy invalidation if global ID is
        // unavailable at write time (e.g. scraper failure).
        instagramHandle: normalizedHandle,
        isSpiral: false,
      })
      .onConflictDoNothing({
        target: [merchantScopedUserMap.merchantId, merchantScopedUserMap.senderScopedId],
      });
  }

  // Wipe every negative-cache row that matches ANY of the supplied identity
  // keys (scoped ID, IG user ID, or handle). Called the moment a customer
  // completes Spiral-code Instagram verification so previously-cached
  // "not a Spiral customer" rows for the same person — under any merchant —
  // are removed. Future story_mentions from those scoped IDs then re-resolve
  // and get upgraded to positive mappings via createMerchantScopedUserMap.
  //
  // Positive rows (isSpiral=true) are NEVER touched, so even if a key happens
  // to match a positive mapping it stays intact.
  //
  // Note on legacy data: negative rows written before instagramHandle was
  // persisted (and where neither scopedId nor userId match — e.g. merchant-
  // page-scoped IDs vs the @joinspiral-page scoped ID we have at DM time)
  // cannot be auto-invalidated and will linger until they self-heal on next
  // re-resolution attempt or are cleaned up out-of-band.
  async clearNegativeCacheForInstagramIdentity(identity: {
    senderScopedId?: string | null;
    instagramUserId?: string | null;
    instagramHandle?: string | null;
    instagramGlobalUserId?: string | null;
  }): Promise<number> {
    const conditions: SQL[] = [];

    if (identity.senderScopedId) {
      conditions.push(eq(merchantScopedUserMap.senderScopedId, identity.senderScopedId));
    }
    if (identity.instagramUserId) {
      conditions.push(eq(merchantScopedUserMap.instagramUserId, identity.instagramUserId));
    }
    // Primary cross-merchant matcher: account-wide Instagram numeric ID.
    // This is the only key that reliably joins a DM-time identity to a
    // merchant-page-scoped negative row, since Meta page-scopes everything else.
    if (identity.instagramGlobalUserId) {
      conditions.push(eq(merchantScopedUserMap.instagramGlobalUserId, identity.instagramGlobalUserId));
    }
    if (identity.instagramHandle) {
      const handle = identity.instagramHandle.replace(/^@/, '').trim();
      if (handle) {
        conditions.push(sql`lower(${merchantScopedUserMap.instagramHandle}) = lower(${handle})`);
      }
    }

    if (conditions.length === 0) return 0;

    const matchAnyKey = conditions.length === 1 ? conditions[0] : or(...conditions);
    const deleted = await db
      .delete(merchantScopedUserMap)
      .where(
        and(
          eq(merchantScopedUserMap.isSpiral, false),
          matchAnyKey,
        )
      )
      .returning({ id: merchantScopedUserMap.id });
    return deleted.length;
  }

  // Bump lastSeenAt (and optionally refresh the cached display handle) when we
  // see a known scoped ID again. Cheap write, useful for ops/debugging.
  async touchMerchantScopedUserMap(id: string, instagramHandle?: string | null): Promise<void> {
    const update: Record<string, unknown> = { lastSeenAt: new Date() };
    if (instagramHandle !== undefined && instagramHandle !== null) {
      update.instagramHandle = instagramHandle;
    }
    await db
      .update(merchantScopedUserMap)
      .set(update)
      .where(eq(merchantScopedUserMap.id, id));
  }

  // Refresh the customer's display handle (e.g. when Instagram reports a new
  // username for the same user ID). Backend identity is instagramUserId so this
  // is purely a display-layer update.
  async updateSpiralCustomerHandle(id: string, instagramHandle: string): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({ instagramHandle })
      .where(eq(spiralCustomers.id, id));
  }

  async getMerchantScopedUserMapByCustomer(merchantId: string, customerId: string): Promise<MerchantScopedUserMap | undefined> {
    const [result] = await db
      .select()
      .from(merchantScopedUserMap)
      .where(
        and(
          eq(merchantScopedUserMap.merchantId, merchantId),
          eq(merchantScopedUserMap.spiralCustomerId, customerId)
        )
      );
    return result;
  }

  async updateStoreWebhookStatus(id: string, status: string): Promise<void> {
    await db
      .update(storeSettings)
      .set({ webhookSubscriptionStatus: status })
      .where(eq(storeSettings.id, id));
  }

  async updateStoreLastWebhookReceived(id: string): Promise<void> {
    await db
      .update(storeSettings)
      .set({ lastWebhookReceivedAt: new Date() })
      .where(eq(storeSettings.id, id));
  }

  async getSpiralCustomerByInstagramHandle(handle: string): Promise<SpiralCustomer | undefined> {
    const normalizedHandle = handle.toLowerCase().replace('@', '');
    const allCustomers = await db.select().from(spiralCustomers);
    return allCustomers.find(c => 
      c.instagramHandle?.toLowerCase().replace('@', '') === normalizedHandle
    );
  }

  async updateOrderWebhookTimestamp(orderId: string): Promise<void> {
    await db
      .update(orders)
      .set({ webhookTimestamp: new Date() })
      .where(eq(orders.id, orderId));
  }

  async updateOrderVerificationId(orderId: string, verificationId: string): Promise<void> {
    await db
      .update(orders)
      .set({ verificationId })
      .where(eq(orders.id, orderId));
  }

  async getCustomersNeedingInstagramReminder(createdBefore: Date): Promise<SpiralCustomer[]> {
    return await db
      .select()
      .from(spiralCustomers)
      .where(
        and(
          eq(spiralCustomers.emailVerified, true),
          eq(spiralCustomers.marketingEmailOptOut, false),
          isNull(spiralCustomers.instagramAccessToken),
          isNull(spiralCustomers.instagramReminderSentAt),
          lt(spiralCustomers.createdAt, createdBefore),
        )
      );
  }

  async markInstagramReminderSent(id: string): Promise<void> {
    await db
      .update(spiralCustomers)
      .set({ instagramReminderSentAt: new Date() })
      .where(eq(spiralCustomers.id, id));
  }

  async recordEmailSendFailure(failure: InsertEmailSendFailure): Promise<EmailSendFailure> {
    const [created] = await db
      .insert(emailSendFailures)
      .values(failure)
      .returning();
    return created;
  }

  async getRecentEmailSendFailures(limit: number = 50): Promise<EmailSendFailure[]> {
    return await db
      .select()
      .from(emailSendFailures)
      .orderBy(desc(emailSendFailures.createdAt))
      .limit(limit);
  }

  async ensureUnsubscribeToken(id: string): Promise<string> {
    const existing = await this.getSpiralCustomerById(id);
    if (existing?.unsubscribeToken) return existing.unsubscribeToken;
    const token = randomBytes(24).toString("base64url");
    await db
      .update(spiralCustomers)
      .set({ unsubscribeToken: token })
      .where(eq(spiralCustomers.id, id));
    return token;
  }

  async getSpiralCustomerByUnsubscribeToken(token: string): Promise<SpiralCustomer | undefined> {
    const [customer] = await db
      .select()
      .from(spiralCustomers)
      .where(eq(spiralCustomers.unsubscribeToken, token));
    return customer || undefined;
  }

  async setMarketingEmailOptOut(id: string, optOut: boolean): Promise<SpiralCustomer> {
    const [updated] = await db
      .update(spiralCustomers)
      .set({
        marketingEmailOptOut: optOut,
        marketingEmailOptOutAt: optOut ? new Date() : null,
      })
      .where(eq(spiralCustomers.id, id))
      .returning();
    return updated;
  }

  async createPublicityCheck(check: InsertPublicityCheck): Promise<PublicityCheck> {
    const [created] = await db
      .insert(publicityChecks)
      .values(check)
      .returning();
    return created;
  }

  async getIncompletePublicityCheckByVerification(verificationId: string): Promise<PublicityCheck | undefined> {
    const [row] = await db
      .select()
      .from(publicityChecks)
      .where(
        and(
          eq(publicityChecks.verificationId, verificationId),
          isNull(publicityChecks.completedAt),
        ),
      )
      .limit(1);
    return row;
  }

  async getPublicityCheckByVerificationAndStage(verificationId: string, stage: string): Promise<PublicityCheck | undefined> {
    const [row] = await db
      .select()
      .from(publicityChecks)
      .where(
        and(
          eq(publicityChecks.verificationId, verificationId),
          eq(publicityChecks.stage, stage),
        ),
      )
      .limit(1);
    return row;
  }

  async getDuePublicityChecks(now: Date): Promise<PublicityCheck[]> {
    return await db
      .select()
      .from(publicityChecks)
      .where(
        and(
          isNull(publicityChecks.completedAt),
          lt(publicityChecks.scheduledAt, now),
        ),
      )
      .orderBy(publicityChecks.scheduledAt)
      .limit(50);
  }

  async recordPublicityCheckAttempt(
    id: string,
    opts: { lastError?: string | null; lastResult?: string | null; rescheduleAt?: Date | null; completed?: boolean },
  ): Promise<PublicityCheck> {
    const existing = await db.select().from(publicityChecks).where(eq(publicityChecks.id, id));
    const current = existing[0];
    const nextAttempts = (current?.attempts ?? 0) + 1;
    const updateSet: Partial<PublicityCheck> = {
      attempts: nextAttempts,
      lastError: opts.lastError ?? null,
      lastResult: opts.lastResult ?? null,
    };
    if (opts.completed) {
      updateSet.completedAt = new Date();
    }
    if (opts.rescheduleAt) {
      updateSet.scheduledAt = opts.rescheduleAt;
    }
    const [updated] = await db
      .update(publicityChecks)
      .set(updateSet)
      .where(eq(publicityChecks.id, id))
      .returning();
    return updated;
  }

  async markVerificationAwaitingReview(verificationId: string, storyMediaId: string | null): Promise<void> {
    const setData: Record<string, unknown> = { status: "awaiting_review" };
    if (storyMediaId) {
      setData.storyMediaId = storyMediaId;
    }
    await db
      .update(verifications)
      .set(setData)
      .where(eq(verifications.id, verificationId));
  }
}

export const storage = new DatabaseStorage();
