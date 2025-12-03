import { 
  storeSettings, 
  discountTiers, 
  verifications,
  shopifyProducts,
  shopifyCollections,
  campaigns,
  campaignProducts,
  campaignCollections,
  type StoreSettings, 
  type DiscountTier, 
  type Verification,
  type ShopifyProduct,
  type ShopifyCollection,
  type Campaign,
  type CampaignProduct,
  type CampaignCollection,
  type InsertStoreSettings,
  type InsertDiscountTier,
  type InsertVerification,
  type InsertShopifyProduct,
  type InsertShopifyCollection,
  type InsertCampaign,
  type InsertCampaignProduct,
  type InsertCampaignCollection
} from "@shared/schema";
import { db } from "./db";
import { eq, inArray } from "drizzle-orm";

export interface IStorage {
  getStoreSettings(): Promise<StoreSettings | undefined>;
  updateStoreSettings(settings: InsertStoreSettings): Promise<StoreSettings>;
  updateMinFollowers(minFollowers: number): Promise<StoreSettings>;
  getDiscountTiers(): Promise<DiscountTier[]>;
  getDiscountTiersByCampaign(campaignId: string): Promise<DiscountTier[]>;
  createDiscountTier(tier: InsertDiscountTier): Promise<DiscountTier>;
  updateDiscountTier(id: string, tier: InsertDiscountTier): Promise<DiscountTier>;
  deleteDiscountTier(id: string): Promise<void>;
  replaceAllDiscountTiers(tiers: InsertDiscountTier[]): Promise<DiscountTier[]>;
  replaceCampaignDiscountTiers(campaignId: string, tiers: InsertDiscountTier[]): Promise<DiscountTier[]>;
  getVerifications(): Promise<Verification[]>;
  createVerification(verification: InsertVerification): Promise<Verification>;
  syncProducts(products: InsertShopifyProduct[]): Promise<ShopifyProduct[]>;
  getProducts(): Promise<ShopifyProduct[]>;
  syncCollections(collections: InsertShopifyCollection[]): Promise<ShopifyCollection[]>;
  getCollections(): Promise<ShopifyCollection[]>;
  getCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | undefined>;
  createCampaign(campaign: InsertCampaign): Promise<Campaign>;
  updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign>;
  deleteCampaign(id: string): Promise<void>;
  getCampaignProducts(campaignId: string): Promise<ShopifyProduct[]>;
  getCampaignCollections(campaignId: string): Promise<ShopifyCollection[]>;
  setCampaignProducts(campaignId: string, productIds: string[]): Promise<void>;
  setCampaignCollections(campaignId: string, collectionIds: string[]): Promise<void>;
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
          instagramHandle: "@mystore",
          minFollowers,
        })
        .returning();
      return created;
    }
  }

  async getDiscountTiers(): Promise<DiscountTier[]> {
    return await db.select().from(discountTiers);
  }

  async getDiscountTiersByCampaign(campaignId: string): Promise<DiscountTier[]> {
    return await db
      .select()
      .from(discountTiers)
      .where(eq(discountTiers.campaignId, campaignId));
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

  async replaceCampaignDiscountTiers(campaignId: string, tiers: InsertDiscountTier[]): Promise<DiscountTier[]> {
    await db.delete(discountTiers).where(eq(discountTiers.campaignId, campaignId));
    
    if (tiers.length === 0) {
      return [];
    }
    
    const created = await db
      .insert(discountTiers)
      .values(
        tiers.map((tier) => ({
          ...tier,
          campaignId,
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

  async getCampaigns(): Promise<Campaign[]> {
    return await db.select().from(campaigns);
  }

  async getCampaign(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .limit(1);
    return campaign || undefined;
  }

  async createCampaign(campaign: InsertCampaign): Promise<Campaign> {
    const [created] = await db
      .insert(campaigns)
      .values(campaign)
      .returning();
    return created;
  }

  async updateCampaign(id: string, campaign: Partial<InsertCampaign>): Promise<Campaign> {
    const [updated] = await db
      .update(campaigns)
      .set({
        ...campaign,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, id))
      .returning();
    
    if (!updated) {
      throw new Error("Campaign not found");
    }
    
    return updated;
  }

  async deleteCampaign(id: string): Promise<void> {
    await db.delete(campaignProducts).where(eq(campaignProducts.campaignId, id));
    await db.delete(campaignCollections).where(eq(campaignCollections.campaignId, id));
    await db.delete(discountTiers).where(eq(discountTiers.campaignId, id));
    
    const result = await db
      .delete(campaigns)
      .where(eq(campaigns.id, id))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Campaign not found");
    }
  }

  async getCampaignProducts(campaignId: string): Promise<ShopifyProduct[]> {
    const productLinks = await db
      .select()
      .from(campaignProducts)
      .where(eq(campaignProducts.campaignId, campaignId));
    
    if (productLinks.length === 0) {
      return [];
    }
    
    const productIds = productLinks.map(link => link.productId);
    const products = await db
      .select()
      .from(shopifyProducts)
      .where(inArray(shopifyProducts.id, productIds));
    
    return products;
  }

  async getCampaignCollections(campaignId: string): Promise<ShopifyCollection[]> {
    const collectionLinks = await db
      .select()
      .from(campaignCollections)
      .where(eq(campaignCollections.campaignId, campaignId));
    
    if (collectionLinks.length === 0) {
      return [];
    }
    
    const collectionIds = collectionLinks.map(link => link.collectionId);
    const collections = await db
      .select()
      .from(shopifyCollections)
      .where(inArray(shopifyCollections.id, collectionIds));
    
    return collections;
  }

  async setCampaignProducts(campaignId: string, productIds: string[]): Promise<void> {
    await db.delete(campaignProducts).where(eq(campaignProducts.campaignId, campaignId));
    
    if (productIds.length > 0) {
      await db
        .insert(campaignProducts)
        .values(productIds.map(productId => ({ campaignId, productId })));
    }
  }

  async setCampaignCollections(campaignId: string, collectionIds: string[]): Promise<void> {
    await db.delete(campaignCollections).where(eq(campaignCollections.campaignId, campaignId));
    
    if (collectionIds.length > 0) {
      await db
        .insert(campaignCollections)
        .values(collectionIds.map(collectionId => ({ campaignId, collectionId })));
    }
  }
}

export const storage = new DatabaseStorage();
