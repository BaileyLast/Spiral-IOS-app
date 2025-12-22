import { 
  storeSettings, 
  discountTiers, 
  verifications,
  shopifyProducts,
  shopifyCollections,
  selectedProducts,
  selectedCollections,
  orders,
  type StoreSettings, 
  type DiscountTier, 
  type Verification,
  type ShopifyProduct,
  type ShopifyCollection,
  type Order,
  type InsertStoreSettings,
  type InsertDiscountTier,
  type InsertVerification,
  type InsertShopifyProduct,
  type InsertShopifyCollection,
  type InsertOrder
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
  getOrderByShopifyOrderId(shopifyOrderId: string): Promise<Order | undefined>;
  getOrderByInstagramUserId(instagramUserId: string): Promise<Order | undefined>;
  updateOrderVerificationStatus(orderId: string, status: string, verificationId?: string): Promise<void>;
  // Products and Collections
  syncProducts(products: InsertShopifyProduct[]): Promise<ShopifyProduct[]>;
  getProducts(): Promise<ShopifyProduct[]>;
  syncCollections(collections: InsertShopifyCollection[]): Promise<ShopifyCollection[]>;
  getCollections(): Promise<ShopifyCollection[]>;
  getSelectedProducts(): Promise<ShopifyProduct[]>;
  getSelectedCollections(): Promise<ShopifyCollection[]>;
  setSelectedProducts(productIds: string[]): Promise<void>;
  setSelectedCollections(collectionIds: string[]): Promise<void>;
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

  async updateOrderVerificationStatus(orderId: string, status: string, verificationId?: string): Promise<void> {
    await db
      .update(orders)
      .set({
        verificationStatus: status,
        ...(verificationId && { verificationId }),
      })
      .where(eq(orders.id, orderId));
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
}

export const storage = new DatabaseStorage();
