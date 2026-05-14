import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft, Store, ExternalLink } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

interface Product {
  id: string;
  title: string;
  handle: string | null;
  image: string | null;
  price: string | null;
  productUrl: string;
  available: boolean;
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

function formatPrice(price: string | null): string | null {
  if (!price) return null;
  const n = parseFloat(price);
  if (!isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

export default function MerchantProducts() {
  const [, params] = useRoute<{ brandId: string }>("/marketplace/:brandId");
  const [, setLocation] = useLocation();
  const brandId = params?.brandId ? decodeURIComponent(params.brandId) : "";

  const { data: brands } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
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
      </header>

      <main className="px-4 pb-8 pt-4">
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
              const formatted = formatPrice(p.price);
              return (
                <a
                  key={p.id}
                  href={p.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden hover-elevate active-elevate-2"
                  data-testid={`card-product-${p.id}`}
                >
                  <div className="aspect-square bg-white flex items-center justify-center overflow-hidden">
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
                  </div>
                  <div className="p-3">
                    <p
                      className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 min-h-[2.5rem]"
                      data-testid={`text-product-title-${p.id}`}
                    >
                      {p.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      {formatted ? (
                        <p className="text-sm font-bold text-gray-900" data-testid={`text-product-price-${p.id}`}>
                          {formatted}
                        </p>
                      ) : (
                        <span />
                      )}
                      {!p.available && (
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
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
