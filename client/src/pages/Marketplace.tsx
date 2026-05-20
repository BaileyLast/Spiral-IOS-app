import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Store, Sparkles, X, Instagram, ChevronRight, Search, Check } from "lucide-react";
import { getCountryByCode, detectCountryFromLocale } from "@/lib/countries";
import { normalizeCategoryForDisplay, type BrandCategory } from "@shared/categories";
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

type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | "REELS";

interface InstagramMediaItem {
  mediaUrl: string;
  mediaType: InstagramMediaType;
  thumbnailUrl: string | null;
}

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
  discountTiers?: DiscountTier[] | null;
  products?: ProductCard[];
  instagramMedia?: InstagramMediaItem[];
}

function maxDiscountPercent(brand: Brand): number {
  const tiers = brand.discountTiers ?? [];
  if (tiers.length === 0) return 0;
  return tiers.reduce((max, t) => (t.discountPercent > max ? t.discountPercent : max), 0);
}

// Returns the discount % a shopper with `followerCount` followers unlocks at
// `brand`, or 0 if no tier matches (i.e. they're below the brand's minimum).
function discountForFollowers(brand: Brand, followerCount: number | null | undefined): number {
  const tiers = brand.discountTiers ?? [];
  if (!followerCount || followerCount <= 0 || tiers.length === 0) return 0;
  for (const t of tiers) {
    const min = t.fromFollowers ?? 0;
    const max = t.toFollowers ?? Infinity;
    if (followerCount >= min && followerCount <= max) {
      return t.discountPercent;
    }
  }
  return 0;
}

interface CustomerProfile {
  country?: string;
  followerCount?: number | null;
  instagramUserId?: string | null;
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

function discountedProductPrice(price: string | null, pct: number): string | null {
  if (!price) return null;
  const n = Number(price);
  if (!Number.isFinite(n) || !Number.isFinite(pct) || pct <= 0) return null;
  const discounted = n * (1 - pct / 100);
  return `£${discounted.toFixed(2)}`;
}

const IMAGE_SLIDE_MS = 5000;
const MAX_SLIDES = 4;

interface HeroSlideshowProps {
  media: InstagramMediaItem[];
  fallbackImageUrl: string | null;
  fallbackImageAlt: string;
  fallbackInitial: string;
  fallbackGradient: string;
  alt: string;
  testKey: string;
}

// Ambient brand hero — slow cross-fade through the brand's recent IG posts.
// Images dwell IMAGE_SLIDE_MS; videos play to completion before advancing.
// Pauses when offscreen or when the browser tab is hidden so we don't burn
// CPU/bandwidth on cards the shopper can't see.
function HeroSlideshow({
  media,
  fallbackImageUrl,
  fallbackImageAlt,
  fallbackInitial,
  fallbackGradient,
  alt,
  testKey,
}: HeroSlideshowProps) {
  // Use a stable signature (URLs + types) so parent re-renders with a fresh
  // array reference but the same content don't reset playback mid-slide.
  const mediaSignature = useMemo(
    () => media.slice(0, MAX_SLIDES).map((m) => `${m.mediaType}|${m.mediaUrl}`).join("\n"),
    [media],
  );
  const slides = useMemo(
    () => media.slice(0, MAX_SLIDES),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mediaSignature],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0]));
  const [videoFailed, setVideoFailed] = useState<Record<number, boolean>>({});
  const [fallbackImgFailed, setFallbackImgFailed] = useState(false);

  // Reset slideshow state only when the actual media content changes.
  useEffect(() => {
    setIndex(0);
    setLoaded(new Set([0]));
    setVideoFailed({});
  }, [mediaSignature]);

  // Pause when card is offscreen.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.intersectionRatio >= 0.5),
      { threshold: [0, 0.5, 1] },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  // Pause when tab is hidden.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setIsTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const active = isVisible && isTabVisible;

  const advance = useCallback(() => {
    setIndex((i) => {
      const total = Math.max(1, slides.length);
      const next = (i + 1) % total;
      setLoaded((s) => {
        if (s.has(next)) return s;
        const copy = new Set(s);
        copy.add(next);
        return copy;
      });
      return next;
    });
  }, [slides.length]);

  const markVideoFailed = useCallback((i: number) => {
    setVideoFailed((p) => (p[i] ? p : { ...p, [i]: true }));
  }, []);

  // Image-timer effect — only for non-video (or failed-video) current slides.
  // Video slides advance on the `ended` event instead.
  const currentSlide = slides[index];
  const isVideoType = (t: InstagramMediaType) => t === "VIDEO" || t === "REELS";
  const treatAsImage =
    !currentSlide ||
    !isVideoType(currentSlide.mediaType) ||
    !!videoFailed[index];

  useEffect(() => {
    if (!active || slides.length <= 1 || !treatAsImage) return;
    const t = window.setTimeout(advance, IMAGE_SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [active, index, treatAsImage, slides.length, advance]);

  // Empty slideshow → fall back to the existing static hero behavior.
  if (slides.length === 0) {
    const showImage = fallbackImageUrl && !fallbackImgFailed;
    return (
      <div ref={containerRef} className="absolute inset-0">
        {showImage ? (
          <img
            src={fallbackImageUrl}
            alt={fallbackImageAlt}
            className="w-full h-full object-cover"
            onError={() => setFallbackImgFailed(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: fallbackGradient }}
            data-testid={`fallback-brand-${testKey}`}
          >
            <span className="text-7xl font-black text-white drop-shadow-md">
              {fallbackInitial}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      data-testid={`slideshow-${testKey}`}
    >
      {slides.map((slide, i) => {
        if (!loaded.has(i)) return null;
        const isActive = i === index;
        return (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-700 ease-in-out"
            style={{ opacity: isActive ? 1 : 0 }}
          >
            <SlideMedia
              slide={slide}
              isActive={isActive}
              active={active}
              hasFailed={!!videoFailed[i]}
              fallbackInitial={fallbackInitial}
              fallbackGradient={fallbackGradient}
              alt={alt}
              onVideoEnded={advance}
              onVideoFailed={() => markVideoFailed(i)}
            />
          </div>
        );
      })}
    </div>
  );
}

interface SlideMediaProps {
  slide: InstagramMediaItem;
  isActive: boolean;
  active: boolean;
  hasFailed: boolean;
  fallbackInitial: string;
  fallbackGradient: string;
  alt: string;
  onVideoEnded: () => void;
  onVideoFailed: () => void;
}

function SlideMedia({
  slide,
  isActive,
  active,
  hasFailed,
  fallbackInitial,
  fallbackGradient,
  alt,
  onVideoEnded,
  onVideoFailed,
}: SlideMediaProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Tracks whether this slide is in the middle of a playback session. We
  // rewind to t=0 when a slide *becomes* active for the first time, but on
  // subsequent visibility/tab flips we resume from where we paused.
  const playbackStartedRef = useRef(false);
  const isVideo = (slide.mediaType === "VIDEO" || slide.mediaType === "REELS") && !hasFailed;

  // Reset playback-session flag whenever this slide leaves the active spot
  // so the next time it becomes active it starts fresh from t=0.
  useEffect(() => {
    if (!isActive) playbackStartedRef.current = false;
  }, [isActive]);

  // Drive playback. If autoplay is rejected (e.g. browser policy) treat the
  // slide as a still — parent will then start its image timer.
  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (!v) return;
    if (isActive && active) {
      if (!playbackStartedRef.current) {
        try {
          v.currentTime = 0;
        } catch {
          // some browsers throw if metadata isn't loaded yet — ignored
        }
        playbackStartedRef.current = true;
      }
      const p = v.play();
      if (p && typeof (p as Promise<void>).catch === "function") {
        (p as Promise<void>).catch(() => onVideoFailed());
      }
    } else {
      v.pause();
    }
  }, [isActive, active, isVideo, onVideoFailed]);

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={slide.mediaUrl}
        poster={slide.thumbnailUrl ?? undefined}
        muted
        playsInline
        preload={isActive ? "auto" : "metadata"}
        onEnded={() => {
          if (isActive) onVideoEnded();
        }}
        onError={() => onVideoFailed()}
        className="w-full h-full object-cover"
      />
    );
  }

  const stillUrl =
    slide.mediaType === "IMAGE"
      ? slide.mediaUrl
      : slide.thumbnailUrl ?? slide.mediaUrl;

  if (imgFailed || !stillUrl) {
    return (
      <div
        className="w-full h-full flex items-center justify-center"
        style={{ background: fallbackGradient }}
      >
        <span className="text-7xl font-black text-white drop-shadow-md">
          {fallbackInitial}
        </span>
      </div>
    );
  }

  return (
    <img
      src={stillUrl}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setImgFailed(true)}
    />
  );
}

interface BrandCardProps {
  brand: Brand;
  onOpenBrand: (brandId: string) => void;
  igConnected: boolean;
  shopperDiscount: number;
}

function BrandCard({ brand, onOpenBrand, igConnected, shopperDiscount }: BrandCardProps) {
  const displayName = cleanBrandName(brand.storeName, brand.instagramUsername);
  const initial = brandInitial(brand.instagramUsername || displayName);
  const gradient = gradientFor(brand.instagramUsername || displayName);
  const maxDiscount = maxDiscountPercent(brand);
  // Once IG is linked, the badge always reflects the shopper's actual unlocked
  // tier on this brand — no toggle required. Without IG, fall back to teasing
  // the brand's max tier. Either way, badge is hidden when the value is 0.
  const badgePercent = igConnected ? shopperDiscount : maxDiscount;
  const badgeLabel = igConnected ? "Your discount" : "Up to";
  const primary = normalizeCategoryForDisplay(brand.category);
  const secondary = (brand.secondaryCategories ?? [])
    .map((c) => normalizeCategoryForDisplay(c))
    .filter((c): c is NonNullable<typeof c> => c !== null && c !== primary)
    .slice(0, 2);
  const testKey = brand.instagramUsername || brand.storeName;

  const products = (brand.products ?? []).filter((p) => isSafeHttpUrl(p.productUrl));
  const heroProduct = products.find((p) => p.image) ?? null;
  // When IG media is present every product appears in the carousel; without
  // IG media we still promote the first imaged product into the hero so the
  // card never goes blank.
  const igMedia = brand.instagramMedia ?? [];
  const carouselProducts =
    igMedia.length > 0 ? products : products.filter((p) => p.id !== heroProduct?.id);

  // Track which thumbnail images failed to load so we can show a deterministic
  // fallback instead of a blank gray box. Keyed by a stable id per thumb.
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const markImgError = useCallback((key: string) => {
    setImgErrors((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  // Hero fallback when there's no IG media: existing first-product image,
  // then IG profile pic, then deterministic gradient+initial.
  const heroFallbackImageUrl =
    heroProduct?.image ?? brand.instagramProfilePictureUrl ?? null;

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
        {badgePercent > 0 && (
          <span
            className="flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full bg-[#E6F8F0] text-[#1A996E] text-xs font-black"
            data-testid={`badge-brand-discount-${testKey}`}
          >
            {badgeLabel} {badgePercent}% off
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {/* Hero backdrop with carousel floating on top */}
      <div
        className="relative w-full h-80 overflow-hidden bg-gray-100"
        data-testid={`region-brand-hero-${testKey}`}
      >
        {/* Tap-to-open-brand backdrop (sits behind the carousel) */}
        <button
          type="button"
          onClick={() => onOpenBrand(brand.id)}
          className="absolute inset-0 w-full h-full text-left"
          aria-label={`Open ${displayName}`}
          data-testid={`button-brand-hero-${testKey}`}
        >
          <HeroSlideshow
            media={igMedia}
            fallbackImageUrl={heroFallbackImageUrl}
            fallbackImageAlt={heroProduct?.title ?? displayName}
            fallbackInitial={initial}
            fallbackGradient={gradient}
            alt={displayName}
            testKey={testKey}
          />
          {/* Soft wash so light card text/UI stays legible regardless of image */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/35 to-black/45 pointer-events-none" />
        </button>

        {/* Category strip — top-left, sits above carousel */}
        {(primary || secondary.length > 0) && (
          <div className="absolute top-3 left-3 right-3 text-white pointer-events-none">
            <p
              className="text-[10px] uppercase tracking-widest font-black drop-shadow"
              data-testid={`text-brand-category-${testKey}`}
            >
              {primary && <span className="text-[#A8F0D1]">{primary}</span>}
              {primary && secondary.length > 0 && (
                <span className="text-white/80 font-bold ml-2">
                  · {secondary.join(" · ")}
                </span>
              )}
              {!primary && secondary.length > 0 && (
                <span className="text-white/85 font-bold">{secondary.join(" · ")}</span>
              )}
            </p>
          </div>
        )}

        {/* Product carousel — vertically centered, floats on the backdrop */}
        {carouselProducts.length > 0 && (
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
            <div
              className="flex gap-4 overflow-x-auto pl-4 pr-4 scroll-pl-4 snap-x snap-mandatory scrollbar-none"
              style={{ scrollbarWidth: "none" }}
              data-testid={`carousel-products-${testKey}`}
            >
              {carouselProducts.map((p) => {
                const formatted = formatProductPrice(p.price);
                const discounted = discountedProductPrice(p.price, shopperDiscount);
                const showDiscount = !!discounted && !!formatted;
                const thumbKey = `thumb-${p.id}`;
                const showThumbImage = !!p.image && !imgErrors[thumbKey];
                return (
                  <a
                    key={p.id}
                    href={p.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-[44%] snap-start rounded-lg bg-white shadow-lg p-2 hover-elevate active-elevate-2"
                    data-testid={`link-product-${p.id}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="w-full aspect-square bg-gray-100 rounded-md overflow-hidden">
                      {showThumbImage && p.image ? (
                        <img
                          src={p.image}
                          alt={p.title}
                          className="w-full h-full object-cover"
                          onError={() => markImgError(thumbKey)}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-3xl font-black text-white"
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
                    {showDiscount ? (
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span
                          className="text-sm font-black text-[#1A996E]"
                          data-testid={`text-product-discounted-price-${p.id}`}
                        >
                          {discounted}
                        </span>
                        <span
                          className="text-[11px] text-gray-400 font-medium line-through"
                          data-testid={`text-product-original-price-${p.id}`}
                        >
                          {formatted}
                        </span>
                      </div>
                    ) : (
                      formatted && (
                        <p
                          className="text-xs text-gray-600 font-bold mt-0.5"
                          data-testid={`text-product-price-${p.id}`}
                        >
                          {formatted}
                        </p>
                      )
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>

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

interface CategoryChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
}

function CategoryChip({ label, selected, onClick, testId }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center h-9 px-4 rounded-full text-xs font-black whitespace-nowrap hover-elevate active-elevate-2 ${
        selected
          ? "bg-[#1A996E] text-white"
          : "bg-white text-gray-700 border border-gray-200"
      }`}
      aria-pressed={selected}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

export default function Marketplace() {
  const [, setLocation] = useLocation();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<BrandCategory | "all">("all");
  const [bestForMeOn, setBestForMeOn] = useState(false);

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

  // "Best discount for me" is only meaningful when we actually know the
  // shopper's follower count — i.e. they've linked Instagram. Otherwise we
  // hide the toggle entirely.
  const followerCount = profile?.followerCount ?? 0;
  const personalAvailable = !!profile?.instagramUserId && followerCount > 0;
  const personalMode = personalAvailable && bestForMeOn;

  // If the shopper disconnects Instagram while the toggle was on, silently
  // turn it off so the badges/sort don't claim a personal % we can't compute.
  useEffect(() => {
    if (!personalAvailable && bestForMeOn) {
      setBestForMeOn(false);
    }
  }, [personalAvailable, bestForMeOn]);

  // Country + product-count filter — runs before search/category so the
  // category chip row only shows categories that actually have shippable brands.
  const countryFilteredBrands = useMemo(() => {
    if (!brands) return [];
    return brands
      .filter((b) => (b.selectedProductCount ?? 0) > 0)
      .filter((b) => brandShipsToCountry(b, effectiveCountry))
      .filter((b) => isSafeHttpUrl(b.storefrontUrl));
  }, [brands, effectiveCountry]);

  // Categories present in the current (country-filtered) brand list, ordered
  // by how often they appear so the most popular chips render first.
  const availableCategories = useMemo<BrandCategory[]>(() => {
    const counts = new Map<BrandCategory, number>();
    for (const b of countryFilteredBrands) {
      const cats: (BrandCategory | null)[] = [
        normalizeCategoryForDisplay(b.category),
        ...(b.secondaryCategories ?? []).map((c) => normalizeCategoryForDisplay(c)),
      ];
      const seen = new Set<BrandCategory>();
      for (const c of cats) {
        if (!c || seen.has(c)) continue;
        seen.add(c);
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [countryFilteredBrands]);

  // If the user had a category selected and the list refreshes without it,
  // fall back to "all" so the page doesn't go silently empty.
  useEffect(() => {
    if (selectedCategory === "all") return;
    if (!availableCategories.includes(selectedCategory)) {
      setSelectedCategory("all");
    }
  }, [availableCategories, selectedCategory]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleBrands = useMemo(() => {
    const filtered = countryFilteredBrands.filter((b) => {
      if (selectedCategory !== "all") {
        const primary = normalizeCategoryForDisplay(b.category);
        const secondaries = (b.secondaryCategories ?? [])
          .map((c) => normalizeCategoryForDisplay(c))
          .filter((c): c is BrandCategory => c !== null);
        const all = primary ? [primary, ...secondaries] : secondaries;
        if (!all.includes(selectedCategory)) return false;
      }
      if (normalizedQuery) {
        const display = cleanBrandName(b.storeName, b.instagramUsername).toLowerCase();
        const handle = (b.instagramUsername ?? "").toLowerCase();
        const store = b.storeName.toLowerCase();
        if (
          !display.includes(normalizedQuery) &&
          !handle.includes(normalizedQuery) &&
          !store.includes(normalizedQuery)
        ) {
          return false;
        }
      }
      return true;
    });

    if (!personalMode) return filtered;

    // Stable sort by personal discount desc. Brands the shopper doesn't
    // qualify for (0%) sink to the bottom but stay in their original order.
    return filtered
      .map((b, idx) => ({ b, idx, pct: discountForFollowers(b, followerCount) }))
      .sort((a, z) => (z.pct - a.pct) || (a.idx - z.idx))
      .map((x) => x.b);
  }, [countryFilteredBrands, selectedCategory, normalizedQuery, personalMode, followerCount]);

  const hasActiveFilters =
    normalizedQuery.length > 0 || selectedCategory !== "all" || bestForMeOn;
  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setBestForMeOn(false);
  };

  return (
    <div className="min-h-screen bg-warm safe-top pb-12">
      <header className="px-6 pt-10 pb-4 space-y-4">
        <h1
          className="text-3xl font-black tracking-tight text-gray-900"
          data-testid="text-page-title"
        >
          Discover
        </h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="search"
            inputMode="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search brands"
            aria-label="Search brands"
            className="w-full h-11 pl-10 pr-10 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#4ECCA3] focus:ring-2 focus:ring-[#4ECCA3]/20"
            data-testid="input-search-brands"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center hover-elevate"
              data-testid="button-clear-search"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        {availableCategories.length > 0 && (
          <div
            className="flex gap-2 overflow-x-auto -mx-6 px-6 pb-1 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
            data-testid="row-category-chips"
          >
            <CategoryChip
              label="All"
              selected={selectedCategory === "all"}
              onClick={() => setSelectedCategory("all")}
              testId="chip-category-all"
            />
            {availableCategories.map((cat) => (
              <CategoryChip
                key={cat}
                label={cat}
                selected={selectedCategory === cat}
                onClick={() => setSelectedCategory(cat)}
                testId={`chip-category-${cat.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
              />
            ))}
          </div>
        )}

        {personalAvailable && (
          <div className="flex" data-testid="row-personal-toggle">
            <button
              type="button"
              onClick={() => setBestForMeOn((v) => !v)}
              aria-pressed={bestForMeOn}
              className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-black whitespace-nowrap hover-elevate active-elevate-2 ${
                bestForMeOn
                  ? "bg-[#1A996E] text-white"
                  : "bg-white text-gray-700 border border-gray-200"
              }`}
              data-testid="button-toggle-best-for-me"
            >
              {bestForMeOn && <Check className="w-3.5 h-3.5" />}
              Best discount for me
            </button>
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
          hasActiveFilters ? (
            <div
              className="creator-card p-8 text-center"
              data-testid="card-empty-filtered"
            >
              <div className="w-16 h-16 rounded-2xl bg-[#E6F8F0] flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-[#4ECCA3]" />
              </div>
              <h3 className="font-black text-gray-900 mb-2 text-lg">
                No brands match
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Try a different search or category.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center justify-center gap-2 text-xs text-[#1A996E] font-black bg-[#E6F8F0] px-4 py-2 rounded-full hover-elevate"
                data-testid="button-clear-filters"
              >
                Clear filters
              </button>
            </div>
          ) : (
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
          )
        ) : (
          <div className="space-y-4" data-testid="grid-brands">
            {visibleBrands.map((brand) => (
              <BrandCard
                key={brand.id}
                brand={brand}
                igConnected={personalAvailable}
                shopperDiscount={
                  personalAvailable ? discountForFollowers(brand, followerCount) : 0
                }
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
