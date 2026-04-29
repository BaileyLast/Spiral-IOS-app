import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Store, Sparkles, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getCountryByCode, detectCountryFromLocale } from "@/lib/countries";

const FALLBACK_PALETTE = [
  "bg-[#FEDA75] text-[#7a4a00]",
  "bg-[#FA7E1E] text-white",
  "bg-[#D62976] text-white",
  "bg-[#962FBF] text-white",
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

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

interface Brand {
  storeName: string;
  storefrontUrl: string;
  instagramUsername: string | null;
  instagramProfilePictureUrl: string | null;
  category: string | null;
  country: string | null;
  shippingCountries: string[] | null;
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
    return brands.filter((b) => brandShipsToCountry(b, effectiveCountry));
  }, [brands, effectiveCountry]);

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-6 pt-8 pb-4">
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Marketplace</h1>
        <p className="text-gray-400 mt-1">Discover brands with Spiral discounts</p>
      </header>

      {usingLocaleFallback && !bannerDismissed && country && (
        <div
          className="mx-6 mb-4 flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
          data-testid="banner-locale-fallback"
        >
          <p className="text-xs text-gray-500 flex-1">
            Showing brands shipping to <span className="font-semibold text-gray-700">{country.name}</span>.{" "}
            <button
              onClick={() => setLocation("/manage-account")}
              className="text-[#D62976] font-semibold hover-elevate rounded px-1"
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

      <main className="px-6 pb-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3" data-testid="grid-brands-loading">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] rounded-2xl bg-gray-100 animate-pulse"
                data-testid={`skeleton-brand-${i}`}
              />
            ))}
          </div>
        ) : filteredBrands.length === 0 ? (
          <div
            className="p-8 rounded-2xl bg-gray-50 border border-gray-100 text-center"
            data-testid="card-empty-marketplace"
          >
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-4">
              <Store className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">
              {country ? `No brands shipping to ${country.name} yet` : "No brands available yet"}
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              We're adding new partner brands every week — check back soon.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-[#D62976] font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>New brands added weekly</span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3" data-testid="grid-brands">
            {filteredBrands.filter((b) => isSafeHttpUrl(b.storefrontUrl)).map((brand) => {
              const displayName = cleanBrandName(brand.storeName, brand.instagramUsername);
              const initial = brandInitial(brand.instagramUsername || displayName);
              const palette = paletteFor(brand.instagramUsername || displayName);
              return (
                <a
                  key={brand.storefrontUrl}
                  href={brand.storefrontUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl bg-gray-50 border border-gray-100 p-4 hover-elevate active-elevate-2"
                  data-testid={`card-brand-${brand.instagramUsername || brand.storeName}`}
                >
                  <div className="flex flex-col items-center text-center">
                    <Avatar className="w-16 h-16 mb-3">
                      {brand.instagramProfilePictureUrl && (
                        <AvatarImage
                          src={brand.instagramProfilePictureUrl}
                          alt={displayName}
                          className="object-cover"
                        />
                      )}
                      <AvatarFallback
                        className={`text-2xl font-bold ${palette}`}
                        data-testid={`fallback-brand-${brand.instagramUsername || brand.storeName}`}
                      >
                        {initial}
                      </AvatarFallback>
                    </Avatar>
                    <p
                      className="font-bold text-gray-900 text-sm truncate w-full"
                      data-testid={`text-brand-name-${brand.instagramUsername || brand.storeName}`}
                    >
                      {displayName}
                    </p>
                    {brand.instagramUsername && (
                      <p className="text-xs text-gray-400 truncate w-full mt-0.5">
                        @{brand.instagramUsername}
                      </p>
                    )}
                    {brand.category && (
                      <p className="text-[10px] uppercase tracking-wider text-[#D62976] font-semibold mt-2">
                        {brand.category}
                      </p>
                    )}
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
