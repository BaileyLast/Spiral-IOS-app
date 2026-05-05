export const BRAND_CATEGORIES = [
  "Fashion",
  "Beauty",
  "Health & Wellness",
  "Sports & Fitness",
  "Home & Garden",
  "Food & Drink",
  "Jewellery & Watches",
  "Kids & Baby",
  "Pets",
  "Electronics",
  "Stationery & Gifts",
  "Automotive",
  "DIY, Tools & Hardware",
  "Hobbies & Collectibles",
  "Books & Media",
  "Travel & Luggage",
  "Digital Products",
  "Adult",
] as const;

export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

export function isValidBrandCategory(value: unknown): value is BrandCategory {
  return typeof value === "string" && (BRAND_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeCategoryForDisplay(value: string | null | undefined): BrandCategory | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "other") return null;
  return isValidBrandCategory(trimmed) ? trimmed : null;
}
