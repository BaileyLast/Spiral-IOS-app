import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft, Store, ExternalLink, Instagram } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import spiralLogoUrl from "@assets/Spiral_logo_1779298156773.png";

interface DiscountTier {
  fromFollowers: number;
  toFollowers: number | null;
  discountPercent: number;
}

interface Brand {
  id: string;
  storeName: string;
  storefrontUrl: string;
  instagramUsername: string | null;
  instagramProfilePictureUrl: string | null;
  category: string | null;
  secondaryCategories: string[] | null;
  country: string | null;
  shippingCountries: string[] | null;
  selectedProductCount: number;
  minFollowers?: number;
  discountTiers?: DiscountTier[];
}

interface Product {
  id: string;
  title: string;
  handle: string | null;
  image: string | null;
  price: string | null;
  productUrl: string;
  available: boolean;
}

interface CustomerProfile {
  id: string;
  instagramHandle?: string | null;
  instagramUserId?: string | null;
  followerCount?: number | null;
  accountStatus?: string | null;
  softBannedReason?: string | null;
}

const FALLBACK_PALETTE = [
  "bg-[#A8F5E0] text-[#155843]",
  "bg-[#4ECCA3] text-white",
  "bg-[#2BAE88] text-white",
  "bg-[#EBF9F5] text-[#2BAE88]",
];

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

function cleanBrandName(storeName: string, instagramUsername: string | null): string {
  const looksLikeShopify = /\.myshopify\.com$/i.test(storeName);
  if (looksLikeShopify) {
    const slug = storeName.replace(/\.myshopify\.com$/i, "").replace(/-/g, " ").trim();
    if (instagramUsername && /^test/i.test(slug)) return instagramUsername;
    return slug.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  }
  return storeName;
}

function formatPrice(value: number | null): string | null {
  if (value == null || !isFinite(value)) return null;
  return `$${value.toFixed(2)}`;
}

function parsePrice(price: string | null): number | null {
  if (!price) return null;
  const n = parseFloat(price);
  return isFinite(n) ? n : null;
}

// Mirrors the matching rule used in `/api/checkout/calculate-discount`.
// Returns the discountPercent for the shopper's follower count, or null
// if no tier matches (or the brand has no tiers configured).
function pickTierPercent(tiers: DiscountTier[], followerCount: number): number | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.fromFollowers - b.fromFollowers);
  const match = sorted.find(
    (t) => followerCount >= t.fromFollowers && (t.toFollowers === null || followerCount <= t.toFollowers),
  );
  return match ? match.discountPercent : null;
}

type PricingState =
  | { kind: "loading" }
  | { kind: "soft_banned"; reason: string | null }
  | { kind: "not_connected" }
  | { kind: "below_min"; minFollowers: number; followerCount: number }
  | { kind: "no_tier"; lowestTierFollowers: number | null; followerCount: number }
  | { kind: "no_rules" }
  | { kind: "eligible"; percent: number };

function resolvePricingState(
  profile: CustomerProfile | null | undefined,
  brand: Brand | null,
): PricingState {
  if (!brand) return { kind: "loading" };
  // No profile yet → don't promise anything; render originals silently.
  if (!profile) return { kind: "loading" };
  if (profile.accountStatus === "soft_banned") {
    return { kind: "soft_banned", reason: profile.softBannedReason ?? null };
  }
  const tiers = brand.discountTiers ?? [];
  // Brand simply hasn't configured Spiral discounts.
  if (tiers.length === 0) return { kind: "no_rules" };
  if (!profile.instagramHandle) return { kind: "not_connected" };
  const followerCount = profile.followerCount ?? 0;
  const minFollowers = brand.minFollowers ?? 0;
  if (followerCount < minFollowers) {
    return { kind: "below_min", minFollowers, followerCount };
  }
  const percent = pickTierPercent(tiers, followerCount);
  if (percent == null || percent <= 0) {
    const lowest = [...tiers].sort((a, b) => a.fromFollowers - b.fromFollowers)[0];
    return {
      kind: "no_tier",
      lowestTierFollowers: lowest ? lowest.fromFollowers : null,
      followerCount,
    };
  }
  return { kind: "eligible", percent };
}

export default function MerchantProducts() {
  const [, params] = useRoute<{ brandId: string }>("/marketplace/:brandId");
  const [, setLocation] = useLocation();
  const brandId = params?.brandId ? decodeURIComponent(params.brandId) : "";

  const { data: brands } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: profile } = useQuery<CustomerProfile>({ queryKey: ["/api/customer/me"] });

  const brand = useMemo(() => {
    if (!brands || !brandId) return null;
    return brands.find((b) => b.id === brandId) ?? null;
  }, [brands, brandId]);

  const { data: products, isLoading, isError } = useQuery<Product[]>({
    queryKey: ["/api/brands", brandId, "products"],
    queryFn: async () => {
      const res = await fetch(`/api/brands/${encodeURIComponent(brandId)}/products`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!brandId,
  });

  const pricingState = useMemo(() => resolvePricingState(profile ?? null, brand), [profile, brand]);

  const displayName = brand ? cleanBrandName(brand.storeName, brand.instagramUsername) : "";
  const initial = (displayName.trim()[0] || "?").toUpperCase();
  const palette = paletteFor(brand?.instagramUsername || displayName);

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-4 pt-6 pb-4 sticky top-0 bg-white z-10 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocation("/marketplace")}
            className="w-9 h-9 -ml-2 rounded-full flex items-center justify-center hover-elevate"
            aria-label="Back"
            data-testid="button-back-marketplace"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="w-10 h-10 shrink-0">
              {brand?.instagramProfilePictureUrl && (
                <AvatarImage src={brand.instagramProfilePictureUrl} alt={displayName} className="object-cover" />
              )}
              <AvatarFallback className={`text-base font-bold ${palette}`}>{initial}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="font-bold text-gray-900 text-base truncate" data-testid="text-merchant-name">
                {displayName}
              </h1>
              {brand?.instagramUsername && (
                <p className="text-xs text-gray-400 truncate">@{brand.instagramUsername}</p>
              )}
            </div>
            {brand?.storefrontUrl && (
              <a
                href={brand.storefrontUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full flex items-center justify-center hover-elevate"
                aria-label="Visit store"
                data-testid="link-visit-store"
              >
                <ExternalLink className="w-4 h-4 text-gray-500" />
              </a>
            )}
          </div>
        </div>
        {pricingState.kind === "eligible" && (
          <p
            className="mt-3 text-sm text-[#2BAE88]"
            data-testid="badge-spiral-discount"
          >
            You receive <span className="font-bold">{pricingState.percent}% off</span> selected products at this store
          </p>
        )}
      </header>

      <main className="px-4 pb-8 pt-4">
        {pricingState.kind === "soft_banned" && (
          <div
            className="mb-4 rounded-2xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900"
            data-testid="banner-on-hold"
          >
            <p className="font-semibold">Your next discount is on hold</p>
            <p className="text-orange-800/80 mt-0.5">
              {pricingState.reason === "inherited_from_instagram"
                ? "Your Instagram account owes a Story from a previous Spiral order. Post it to unlock your next discount."
                : "Post a Story for your previous order to unlock your next discount."}
            </p>
          </div>
        )}
        {pricingState.kind === "not_connected" && (
          <div
            className="mb-4 rounded-2xl border border-[#A8F5E0] bg-[#EBF9F5] p-3 text-sm text-[#155843] flex items-start gap-2"
            data-testid="banner-connect-instagram"
          >
            <Instagram className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              <button
                onClick={() => setLocation("/connect-instagram")}
                className="font-semibold underline underline-offset-2"
                data-testid="link-connect-instagram"
              >
                Connect Instagram
              </button>{" "}
              to see your Spiral discount at this brand.
            </p>
          </div>
        )}
        {pricingState.kind === "below_min" && (
          <div
            className="mb-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600"
            data-testid="banner-min-followers"
          >
            {pricingState.minFollowers.toLocaleString()} followers needed for a Spiral discount at this brand.
          </div>
        )}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3" data-testid="grid-products-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-2xl bg-gray-100 animate-pulse"
                data-testid={`skeleton-product-${i}`}
              />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 text-center" data-testid="card-products-error">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Couldn't load products</h3>
            <p className="text-sm text-gray-400">Try again in a moment.</p>
          </div>
        ) : !products || products.length === 0 ? (
          <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 text-center" data-testid="card-products-empty">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">No products yet</h3>
            <p className="text-sm text-gray-400">This brand hasn't listed anything publicly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3" data-testid="grid-products">
            {products.map((p) => {
              const original = parsePrice(p.price);
              const formattedOriginal = formatPrice(original);
              const discounted =
                pricingState.kind === "eligible" && original != null
                  ? Math.max(0, original * (1 - pricingState.percent / 100))
                  : null;
              const formattedDiscounted = formatPrice(discounted);
              const showDual = formattedDiscounted != null && formattedOriginal != null;
              return (
                <a
                  key={p.id}
                  href={p.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden hover-elevate active-elevate-2"
                  data-testid={`card-product-${p.id}`}
                >
                  <div className="relative aspect-square bg-white flex items-center justify-center overflow-hidden">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt={p.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        data-testid={`img-product-${p.id}`}
                      />
                    ) : (
                      <Store className="w-8 h-8 text-gray-200" />
                    )}
                    <span
                      className="absolute top-2 right-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/70 backdrop-blur-sm shadow-sm ring-1 ring-black/5"
                      data-testid={`badge-product-spiral-${p.id}`}
                    >
                      <img
                        src={spiralLogoUrl}
                        alt="Spiral discount"
                        width={18}
                        height={18}
                        className="block"
                      />
                    </span>
                  </div>
                  <div className="p-3">
                    <p
                      className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 min-h-[2.5rem]"
                      data-testid={`text-product-title-${p.id}`}
                    >
                      {p.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {showDual ? (
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span
                            className="text-xs text-gray-400 line-through decoration-[#4ECCA3] decoration-2"
                            data-testid={`text-product-price-original-${p.id}`}
                          >
                            {formattedOriginal}
                          </span>
                          <span
                            className="text-sm font-bold text-[#2BAE88] truncate"
                            data-testid={`text-product-price-spiral-${p.id}`}
                          >
                            {formattedDiscounted}
                          </span>
                        </div>
                      ) : formattedOriginal ? (
                        <p className="text-sm font-bold text-gray-900" data-testid={`text-product-price-${p.id}`}>
                          {formattedOriginal}
                        </p>
                      ) : (
                        <span />
                      )}
                      {!p.available && (
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold shrink-0">
                          Sold out
                        </span>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
