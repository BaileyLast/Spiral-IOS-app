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
  type StoreSettings, 
  type DiscountTier, 
  type Verification,
  type ShopifyProduct,
  type ShopifyCollection,
  type SpiralCustomer,
  type Order,
  type SpiralCode,
  type InsertStoreSettings,
  type InsertDiscountTier,
  type InsertVerification,
  type InsertShopifyProduct,
  type InsertShopifyCollection,
  type InsertSpiralCustomer,
  type InsertOrder,
  type InsertSpiralCode
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray, and, lt, isNull } from "drizzle-orm";

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
  markStoryDetected(verificationId: string, storyMediaId: string, storyUrl: string): Promise<Verification>;
  markVerified(verificationId: string): Promise<Verification>;
  markFailed(verificationId: string, reason: string): Promise<Verification>;
  triggerClawback(verificationId: string, refundId: string): Promise<Verification>;
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
  getOrdersByCustomerId(customerId: string): Promise<Order[]>;
  // Spiral verification codes
  createSpiralCode(code: InsertSpiralCode): Promise<SpiralCode>;
  getSpiralCodeByCode(code: string): Promise<SpiralCode | undefined>;
  getSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined>;
  getPendingSpiralCodeByCustomerId(customerId: string): Promise<SpiralCode | undefined>;
  verifySpiralCode(code: string, instagramUserId: string, instagramHandle: string): Promise<SpiralCode>;
  invalidateSpiralCode(code: string): Promise<void>;
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
    const now = new Date();
    return await db
      .select()
      .from(verifications)
      .where(
        and(
          eq(verifications.status, "story_detected"),
          lt(verifications.confirmationDueAt, now),
          isNull(verifications.verifiedAt),
          isNull(verifications.failedAt)
        )
      );
  }

  async markStoryDetected(verificationId: string, storyMediaId: string, storyUrl: string): Promise<Verification> {
    const now = new Date();
    const confirmationDueAt = new Date(now.getTime() + 22 * 60 * 60 * 1000); // 22 hours from now
    
    const [updated] = await db
      .update(verifications)
      .set({
        status: "story_detected",
        storyMediaId,
        storyUrl,
        storyDetectedAt: now,
        confirmationDueAt,
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

  async markFailed(verificationId: string, reason: string): Promise<Verification> {
    const [updated] = await db
      .update(verifications)
      .set({
        status: "failed",
        failedAt: new Date(),
        failureReason: reason,
      })
      .where(eq(verifications.id, verificationId))
      .returning();
    
    return updated;
  }

  async triggerClawback(verificationId: string, refundId: string): Promise<Verification> {
    const verification = await this.getVerificationById(verificationId);
    
    const [updated] = await db
      .update(verifications)
      .set({
        clawbackTriggered: true,
        clawbackAmount: verification?.discountAmount || "0",
        clawbackRefundId: refundId,
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
          eq(orders.verificationStatus, "pending_verification")
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
      .where(eq(spiralCodes.customerId, customerId));
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
      );
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
}

export const storage = new DatabaseStorage();
