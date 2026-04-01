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
  type InsertMerchantScopedUserMap
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray, and, lt, isNull, desc } from "drizzle-orm";

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
  updateSpiralCustomerProfile(id: string, data: { name?: string; dateOfBirth?: string | null; address?: string | null }): Promise<SpiralCustomer>;
  getOrdersByCustomerId(customerId: string): Promise<Order[]>;
  // Spiral verification codes
  createSpiralCode(code: InsertSpiralCode): Promise<SpiralCode>;
  getSpiralCodeByCode(code: string): Promise<SpiralCode | undefined>;
  getSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined>;
  getPendingSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined>;
  verifySpiralCode(code: string, instagramUserId: string, instagramHandle: string): Promise<SpiralCode>;
  invalidateSpiralCode(code: string): Promise<void>;
  // Merchant scoped user map
  createMerchantScopedUserMap(map: InsertMerchantScopedUserMap): Promise<MerchantScopedUserMap>;
  getMerchantScopedUserMap(merchantId: string, senderScopedId: string): Promise<MerchantScopedUserMap | undefined>;
  getMerchantScopedUserMapByCustomer(merchantId: string, customerId: string): Promise<MerchantScopedUserMap | undefined>;
  // Store settings webhook tracking
  updateStoreWebhookStatus(id: string, status: string): Promise<void>;
  updateStoreLastWebhookReceived(id: string): Promise<void>;
  // Customer lookup by Instagram handle
  getSpiralCustomerByInstagramHandle(handle: string): Promise<SpiralCustomer | undefined>;
  // Order webhook tracking
  updateOrderWebhookTimestamp(orderId: string): Promise<void>;
  updateOrderVerificationId(orderId: string, verificationId: string): Promise<void>;
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

  async updateSpiralCustomerProfile(id: string, data: { name?: string; dateOfBirth?: string | null; address?: string | null }): Promise<SpiralCustomer> {
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

  async invalidateSpiralCode(code: string): Promise<void> {
    await db
      .update(spiralCodes)
      .set({ status: "expired" })
      .where(eq(spiralCodes.code, code.toUpperCase()));
  }

  async createMerchantScopedUserMap(map: InsertMerchantScopedUserMap): Promise<MerchantScopedUserMap> {
    const [created] = await db
      .insert(merchantScopedUserMap)
      .values(map)
      .returning();
    return created;
  }

  async getMerchantScopedUserMap(merchantId: string, senderScopedId: string): Promise<MerchantScopedUserMap | undefined> {
    const [result] = await db
      .select()
      .from(merchantScopedUserMap)
      .where(
        and(
          eq(merchantScopedUserMap.merchantId, merchantId),
          eq(merchantScopedUserMap.senderScopedId, senderScopedId)
        )
      );
    return result;
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
}

export const storage = new DatabaseStorage();
