import { type StoreSettings, type DiscountTier, type Verification } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getStoreSettings(): Promise<StoreSettings | undefined>;
  getDiscountTiers(): Promise<DiscountTier[]>;
  getVerifications(): Promise<Verification[]>;
}

export class MemStorage implements IStorage {
  private storeSettings: StoreSettings | undefined;
  private discountTiers: Map<string, DiscountTier>;
  private verifications: Map<string, Verification>;

  constructor() {
    this.discountTiers = new Map();
    this.verifications = new Map();
  }

  async getStoreSettings(): Promise<StoreSettings | undefined> {
    return this.storeSettings;
  }

  async getDiscountTiers(): Promise<DiscountTier[]> {
    return Array.from(this.discountTiers.values());
  }

  async getVerifications(): Promise<Verification[]> {
    return Array.from(this.verifications.values());
  }
}

export const storage = new MemStorage();
