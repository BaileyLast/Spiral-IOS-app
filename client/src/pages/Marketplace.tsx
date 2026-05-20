import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Store, Sparkles, X, Instagram } from "lucide-react";
import { getCountryByCode, detectCountryFromLocale } from "@/lib/countries";
import { normalizeCategoryForDisplay } from "@shared/categories";

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
  // Unsynced brands (shippingCountries === null/undefined) → show to everyone
  // as a safe fallback. An empty array means the merchant ships nowhere, so
  // we hide them.
  if (brand.shippingCountries == null) return true;
  if (brand.shippingCountries.length === 0) return false;
  // Worldwide shippers → show to everyone
  if (brand.shippingCountries.includes("*")) return true;
  // Without a country we can't filter — be permissive
  if (!country) return true;
  const target = country.toUpperCase();
  return brand.shippingCountries.some((c) => c?.toUpperCase() === target);
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
    // Defensive: server already filters out brands with no curated products,
    // but guard here too in case an older server build is still running.
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
                <div className="h-56 w-full bg-gray-100" />
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
            {visibleBrands.map((brand) => {
              const displayName = cleanBrandName(brand.storeName, brand.instagramUsername);
              const initial = brandInitial(brand.instagramUsername || displayName);
              const gradient = gradientFor(brand.instagramUsername || displayName);
              const primary = normalizeCategoryForDisplay(brand.category);
              const secondary = (brand.secondaryCategories ?? [])
                .map((c) => normalizeCategoryForDisplay(c))
                .filter((c): c is NonNullable<typeof c> => c !== null && c !== primary)
                .slice(0, 2);
              const testKey = brand.instagramUsername || brand.storeName;

              return (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => setLocation(`/marketplace/${encodeURIComponent(brand.id)}`)}
                  className="creator-card overflow-hidden block w-full text-left"
                  data-testid={`card-brand-${testKey}`}
                >
                  <div className="relative h-56 w-full overflow-hidden bg-gray-100">
                    {brand.instagramProfilePictureUrl ? (
                      <img
                        src={brand.instagramProfilePictureUrl}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{ background: gradient }}
                        data-testid={`fallback-brand-${testKey}`}
                      >
                        <span className="text-7xl font-black text-white drop-shadow-md">
                          {initial}
                        </span>
                      </div>
                    )}

                    <div className="absolute top-4 left-4 flex gap-2">
                      <div className="glass-pill rounded-full px-3 py-1.5 flex items-center gap-2 shadow-sm">
                        <span
                          className="text-xs font-bold text-gray-900"
                          data-testid={`text-brand-name-${testKey}`}
                        >
                          {displayName}
                        </span>
                      </div>
                    </div>

                    {brand.instagramUsername && (
                      <div className="absolute top-4 right-4">
                        <div className="glass-pill rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
                          <Instagram className="w-3 h-3 text-[#4ECCA3]" />
                          <span className="text-xs font-bold text-gray-900">
                            @{brand.instagramUsername}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

                    <div className="absolute bottom-4 left-4 right-4 text-white">
                      {primary && (
                        <p
                          className="text-[10px] uppercase tracking-widest text-[#A8F0D1] font-black mb-1"
                          data-testid={`text-brand-category-${testKey}`}
                        >
                          {primary}
                          {secondary.length > 0 && (
                            <span
                              className="text-white/70 font-bold ml-2"
                              data-testid={`text-brand-secondary-${testKey}`}
                            >
                              · {secondary.join(" · ")}
                            </span>
                          )}
                        </p>
                      )}
                      {!primary && secondary.length > 0 && (
                        <p
                          className="text-[10px] uppercase tracking-widest text-white/80 font-bold mb-1"
                          data-testid={`text-brand-secondary-${testKey}`}
                        >
                          {secondary.join(" · ")}
                        </p>
                      )}
                      <p className="text-base font-black leading-tight">
                        Shop {displayName}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
