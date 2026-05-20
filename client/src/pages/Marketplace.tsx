import { useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Store, Sparkles, X, Instagram, ChevronRight } from "lucide-react";
import { getCountryByCode, detectCountryFromLocale } from "@/lib/countries";
import { normalizeCategoryForDisplay } from "@shared/categories";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const FALLBACK_GRADIENTS = [
  "linear-gradient(135deg, #A8F5E0 0%, #4ECCA3 100%)",
  "linear-gradient(135deg, #4ECCA3 0%, #2BAE88 100%)",
  "linear-gradient(135deg, #E6F8F0 0%, #A8F0D1 100%)",
  "linear-gradient(135deg, #2BAE88 0%, #1A996E 100%)",
];

function cleanBrandName(storeName: string, instagramUsername: string | null): string {
  const looksLikeShopify = /\.myshopify\.com$/i.test(storeName);
  if (looksLikeShopify) {
    const slug = storeName
      .replace(/\.myshopify\.com$/i, "")
      .replace(/-/g, " ")
      .trim();
    if (instagramUsername && /^test/i.test(slug)) return instagramUsername;
    return slug
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  return storeName;
}

function brandInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : "?";
}

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_GRADIENTS[h % FALLBACK_GRADIENTS.length];
}

interface ProductCard {
  id: string;
  title: string;
  handle: string | null;
  image: string | null;
  price: string | null;
  productUrl: string;
  available: boolean;
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
  products?: ProductCard[];
}

interface CustomerProfile {
  country?: string;
}

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function brandShipsToCountry(brand: Brand, country: string | null): boolean {
  if (brand.shippingCountries == null) return true;
  if (brand.shippingCountries.length === 0) return false;
  if (brand.shippingCountries.includes("*")) return true;
  if (!country) return true;
  const target = country.toUpperCase();
  return brand.shippingCountries.some((c) => c?.toUpperCase() === target);
}

function formatProductPrice(price: string | null): string | null {
  if (!price) return null;
  const n = Number(price);
  if (!Number.isFinite(n)) return null;
  return `£${n.toFixed(2)}`;
}

interface BrandCardProps {
  brand: Brand;
  onOpenBrand: (brandId: string) => void;
}

function BrandCard({ brand, onOpenBrand }: BrandCardProps) {
  const displayName = cleanBrandName(brand.storeName, brand.instagramUsername);
  const initial = brandInitial(brand.instagramUsername || displayName);
  const gradient = gradientFor(brand.instagramUsername || displayName);
  const primary = normalizeCategoryForDisplay(brand.category);
  const secondary = (brand.secondaryCategories ?? [])
    .map((c) => normalizeCategoryForDisplay(c))
    .filter((c): c is NonNullable<typeof c> => c !== null && c !== primary)
    .slice(0, 2);
  const testKey = brand.instagramUsername || brand.storeName;

  const products = (brand.products ?? []).filter((p) => isSafeHttpUrl(p.productUrl));
  const heroProduct = products.find((p) => p.image) ?? null;
  const carouselProducts = products.filter((p) => p.id !== heroProduct?.id);

  // Track which images failed to load so we can show a deterministic
  // fallback instead of a blank gray box. Keyed by a stable id per slot.
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const markImgError = useCallback((key: string) => {
    setImgErrors((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const heroImageUrl = heroProduct?.image ?? brand.instagramProfilePictureUrl ?? null;
  const heroImageKey = heroProduct?.image
    ? `hero-product-${heroProduct.id}`
    : "hero-profile";
  const showHeroImage = !!heroImageUrl && !imgErrors[heroImageKey];

  return (
    <div
      className="creator-card overflow-hidden"
      data-testid={`card-brand-${testKey}`}
    >
      {/* Header strip */}
      <button
        type="button"
        onClick={() => onOpenBrand(brand.id)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover-elevate"
        data-testid={`button-brand-header-${testKey}`}
      >
        <Avatar className="w-9 h-9">
          {brand.instagramProfilePictureUrl ? (
            <AvatarImage src={brand.instagramProfilePictureUrl} alt={displayName} />
          ) : null}
          <AvatarFallback
            className="text-sm font-black text-white"
            style={{ background: gradient }}
          >
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-black text-gray-900 truncate"
            data-testid={`text-brand-name-${testKey}`}
          >
            {displayName}
          </p>
          {brand.instagramUsername && (
            <p
              className="text-xs text-gray-500 font-medium flex items-center gap-1 truncate"
              data-testid={`text-brand-handle-${testKey}`}
            >
              <Instagram className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">@{brand.instagramUsername}</span>
            </p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {/* Hero — first product image (or fallback) */}
      <button
        type="button"
        onClick={() => onOpenBrand(brand.id)}
        className="block w-full relative h-44 overflow-hidden bg-gray-100 text-left"
        data-testid={`button-brand-hero-${testKey}`}
      >
        {showHeroImage && heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt={heroProduct?.title ?? displayName}
            className="w-full h-full object-cover"
            onError={() => markImgError(heroImageKey)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: gradient }}
            data-testid={`fallback-brand-${testKey}`}
          >
            <span className="text-7xl font-black text-white drop-shadow-md">{initial}</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />

        {(primary || secondary.length > 0) && (
          <div className="absolute bottom-3 left-3 right-3 text-white">
            <p
              className="text-[10px] uppercase tracking-widest font-black"
              data-testid={`text-brand-category-${testKey}`}
            >
              {primary && <span className="text-[#A8F0D1]">{primary}</span>}
              {primary && secondary.length > 0 && (
                <span className="text-white/70 font-bold ml-2">
                  · {secondary.join(" · ")}
                </span>
              )}
              {!primary && secondary.length > 0 && (
                <span className="text-white/80 font-bold">{secondary.join(" · ")}</span>
              )}
            </p>
          </div>
        )}
      </button>

      {/* Product carousel */}
      {carouselProducts.length > 0 && (
        <div
          className="flex gap-3 overflow-x-auto px-4 py-3 snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: "none" }}
          data-testid={`carousel-products-${testKey}`}
        >
          {carouselProducts.map((p) => {
            const formatted = formatProductPrice(p.price);
            const thumbKey = `thumb-${p.id}`;
            const showThumbImage = !!p.image && !imgErrors[thumbKey];
            return (
              <a
                key={p.id}
                href={p.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-28 snap-start hover-elevate rounded-md p-1 -m-1"
                data-testid={`link-product-${p.id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-28 h-28 bg-gray-100 rounded-md overflow-hidden">
                  {showThumbImage && p.image ? (
                    <img
                      src={p.image}
                      alt={p.title}
                      className="w-full h-full object-cover"
                      onError={() => markImgError(thumbKey)}
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-2xl font-black text-white"
                      style={{ background: gradient }}
                    >
                      {initial}
                    </div>
                  )}
                </div>
                <p
                  className="mt-2 text-xs font-bold text-gray-900 line-clamp-2 leading-tight"
                  data-testid={`text-product-title-${p.id}`}
                >
                  {p.title}
                </p>
                {formatted && (
                  <p
                    className="text-xs text-gray-600 font-bold mt-0.5"
                    data-testid={`text-product-price-${p.id}`}
                  >
                    {formatted}
                  </p>
                )}
              </a>
            );
          })}
        </div>
      )}

      {/* Shop all footer */}
      <button
        type="button"
        onClick={() => onOpenBrand(brand.id)}
        className="w-full px-4 py-3 flex items-center justify-between hover-elevate border-t border-gray-100 text-left"
        data-testid={`button-brand-shop-all-${testKey}`}
      >
        <span className="text-sm font-black text-gray-900">Shop {displayName}</span>
        <ChevronRight className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

export default function Marketplace() {
  const [, setLocation] = useLocation();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { data: profile } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: brands, isLoading } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const localeCountry = useMemo(() => detectCountryFromLocale(), []);
  const profileCountry = profile?.country?.toUpperCase() || null;
  const effectiveCountry = profileCountry || (localeCountry ? localeCountry.toUpperCase() : null);
  const usingLocaleFallback = !profileCountry && !!localeCountry;
  const country = getCountryByCode(effectiveCountry);

  const filteredBrands = useMemo(() => {
    if (!brands) return [];
    return brands
      .filter((b) => (b.selectedProductCount ?? 0) > 0)
      .filter((b) => brandShipsToCountry(b, effectiveCountry));
  }, [brands, effectiveCountry]);

  const visibleBrands = filteredBrands.filter((b) => isSafeHttpUrl(b.storefrontUrl));

  return (
    <div className="min-h-screen bg-warm safe-top pb-12">
      <header className="px-6 pt-10 pb-6">
        <h1
          className="text-3xl font-black tracking-tight text-gray-900 mb-2"
          data-testid="text-page-title"
        >
          Discover
        </h1>
        {visibleBrands.length > 0 && (
          <div className="glass-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-gray-100">
            <div className="w-2 h-2 rounded-full bg-[#4ECCA3] animate-pulse" />
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              {visibleBrands.length} brand{visibleBrands.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </header>

      <main className="px-6 space-y-6">
        {usingLocaleFallback && !bannerDismissed && country && (
          <div
            className="creator-card p-4 flex items-center gap-3"
            data-testid="banner-locale-fallback"
          >
            <p className="text-xs text-gray-500 flex-1 font-medium">
              Showing brands shipping to{" "}
              <span className="font-bold text-gray-900">{country.name}</span>.{" "}
              <button
                onClick={() => setLocation("/manage-account")}
                className="text-[#4ECCA3] font-bold hover-elevate rounded px-1"
                data-testid="link-set-country"
              >
                Change
              </button>
            </p>
            <button
              onClick={() => setBannerDismissed(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center hover-elevate"
              aria-label="Dismiss"
              data-testid="button-dismiss-banner"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4" data-testid="grid-brands-loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="creator-card overflow-hidden animate-pulse"
                data-testid={`skeleton-brand-${i}`}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-32 bg-gray-100 rounded" />
                    <div className="h-2 w-20 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="h-44 w-full bg-gray-100" />
                <div className="flex gap-3 px-4 py-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="w-28 h-28 bg-gray-100 rounded-md flex-shrink-0" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : visibleBrands.length === 0 ? (
          <div
            className="creator-card p-8 text-center"
            data-testid="card-empty-marketplace"
          >
            <div className="w-16 h-16 rounded-2xl bg-[#E6F8F0] flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8 text-[#4ECCA3]" />
            </div>
            <h3 className="font-black text-gray-900 mb-2 text-lg">
              {country ? `No brands shipping to ${country.name} yet` : "No brands available yet"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              We're adding new partner brands every week — check back soon.
            </p>
            <div className="inline-flex items-center justify-center gap-2 text-xs text-[#1A996E] font-bold bg-[#E6F8F0] px-3 py-1.5 rounded-full">
              <Sparkles className="w-4 h-4" />
              <span>New brands added weekly</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="grid-brands">
            {visibleBrands.map((brand) => (
              <BrandCard
                key={brand.id}
                brand={brand}
                onOpenBrand={(id) =>
                  setLocation(`/marketplace/${encodeURIComponent(id)}`)
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
