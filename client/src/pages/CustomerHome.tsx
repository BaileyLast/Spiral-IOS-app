import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { ArrowRight, ChevronRight, Instagram, Lock, Tag } from "lucide-react";
import type { Order } from "@shared/schema";
import HomeInstagramConnect from "@/components/HomeInstagramConnect";
import { OrderCard, isCompleted } from "@/pages/Orders";
import { formatCurrency, detectCountryFromLocale } from "@/lib/countries";
import { useAuthGuard } from "@/hooks/use-auth-guard";
import { normalizeCategoryForDisplay, type BrandCategory } from "@shared/categories";
import {
  type Brand,
  cleanBrandName,
  brandInitial,
  gradientFor,
  brandShipsToCountry,
  isSafeHttpUrl,
  discountForFollowers,
  maxDiscountPercent,
} from "@/pages/Marketplace";

// Muted, Spiral-adjacent tile colors for the Browse categories grid (cycled).
const CATEGORY_TILE_COLORS = [
  "#1F7A5C",
  "#C96F4A",
  "#4C5B9E",
  "#B04A6E",
  "#7A8B4C",
  "#3E8FA3",
];

interface CustomerProfile {
  id: string;
  email: string;
  name?: string;
  instagramHandle?: string;
  instagramProfilePicture?: string;
  instagramAccountType?: string;
  followerCount?: number;
  accountStatus?: string;
  softBannedReason?: string | null;
  country?: string | null;
}

export default function CustomerHome() {
  const [, setLocation] = useLocation();
  const { data: profile, error: profileError } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/me"],
  });

  const { data: orders = [], error: ordersError } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  const { data: stats, error: statsError } = useQuery<{
    totalSaved: number;
    ordersCompleted: number;
    discountPercent: number;
    pendingVerificationCount: number;
  }>({
    queryKey: ["/api/customer/stats"],
  });

  // The brand list powers the "You may be interested in" and category tiles
  // below, and doubles as the Marketplace prefetch so that tab opens instantly.
  const { data: brands } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });

  const localeCountry = useMemo(() => detectCountryFromLocale(), []);
  const effectiveCountry =
    profile?.country?.toUpperCase() || (localeCountry ? localeCountry.toUpperCase() : null);
  const followerCount = profile?.followerCount ?? 0;
  // Mirror Marketplace's personal-mode gate: only claim a "% for you" when
  // Instagram is actually linked, not merely when a follower count lingers.
  const igLinked = !!profile?.instagramHandle && followerCount > 0;

  // Same eligibility rules as the Marketplace: has products, ships here, safe URL.
  const eligibleBrands = useMemo(() => {
    if (!brands) return [];
    return brands
      .filter((b) => (b.selectedProductCount ?? 0) > 0)
      .filter((b) => brandShipsToCountry(b, effectiveCountry))
      .filter((b) => isSafeHttpUrl(b.storefrontUrl));
  }, [brands, effectiveCountry]);

  // "You may be interested in": until Core tracks store performance, rank by
  // the shopper's own unlocked discount, then by the brand's best tier.
  const recommendedBrands = useMemo(() => {
    return [...eligibleBrands]
      .sort((a, b) => {
        const mine = discountForFollowers(b, followerCount) - discountForFollowers(a, followerCount);
        if (mine !== 0) return mine;
        return maxDiscountPercent(b) - maxDiscountPercent(a);
      })
      .slice(0, 6);
  }, [eligibleBrands, followerCount]);

  // Best % this shopper can get anywhere (falls back to best tier when IG isn't linked).
  const bestPercent = useMemo(() => {
    let best = 0;
    for (const b of eligibleBrands) {
      const mine = igLinked ? discountForFollowers(b, followerCount) : maxDiscountPercent(b);
      if (mine > best) best = mine;
    }
    return best;
  }, [eligibleBrands, followerCount, igLinked]);

  // Categories that actually have shippable brands, ordered by frequency,
  // each carrying up to two product images for the tile artwork.
  const categoryTiles = useMemo(() => {
    const map = new Map<BrandCategory, { count: number; images: string[] }>();
    for (const b of eligibleBrands) {
      const cats = new Set(
        [normalizeCategoryForDisplay(b.category), ...(b.secondaryCategories ?? []).map((c) => normalizeCategoryForDisplay(c))].filter(
          (c): c is BrandCategory => !!c,
        ),
      );
      const images = (b.products ?? [])
        .map((p) => p.image)
        .filter((img): img is string => isSafeHttpUrl(img));
      for (const c of Array.from(cats)) {
        const entry = map.get(c) ?? { count: 0, images: [] };
        entry.count += 1;
        for (const img of images) {
          if (entry.images.length < 2 && !entry.images.includes(img)) entry.images.push(img);
        }
        map.set(c, entry);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([cat, v]) => ({ category: cat, images: v.images }));
  }, [eligibleBrands]);

  // Tap-vs-swipe guard for the recommendations carousel: on iOS a horizontal
  // drag would otherwise fire the card's click before the scroll happens.
  const dragRef = useRef({ x: 0, y: 0, startedAt: 0, moved: false });
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    dragRef.current = { x: t.clientX, y: t.clientY, startedAt: Date.now(), moved: false };
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t || dragRef.current.moved) return;
    if (Math.abs(t.clientX - dragRef.current.x) > 10 || Math.abs(t.clientY - dragRef.current.y) > 10) {
      dragRef.current.moved = true;
    }
  }, []);
  const wasCleanTap = useCallback(() => {
    const d = dragRef.current;
    // Mouse clicks (no touchstart recorded) always count as taps.
    if (d.startedAt === 0) return true;
    return !d.moved && Date.now() - d.startedAt < 500;
  }, []);

  // If the session is dead, treat the shopper as logged out instead of rendering
  // the signed-in shell with stale/empty data (e.g. on-hold banner + no orders).
  useAuthGuard(profileError, ordersError, statsError);

  const recentOrders = [...orders]
    .sort((a, b) => Number(isCompleted(a)) - Number(isCompleted(b)))
    .slice(0, 3);
  const isSoftBanned = profile?.accountStatus === "soft_banned";
  // Mirrors server-side getOwedOrdersForCustomer exactly so banner count never disagrees
  // with checkout: taken_down_early (final-fail debt) is owed regardless of delivery; quick
  // states (pending / awaiting_review / not_public) only count once delivered.
  const owedOrders = orders.filter((o) => {
    const v = o.verificationStatus;
    if (v === "taken_down_early") return true;
    if (o.status === "delivered" && (v === "pending" || v === "awaiting_review" || v === "not_public")) return true;
    return false;
  });
  const pendingCount = owedOrders.length;

  // Always show the "Your Spiral" card once stats have loaded — even for brand
  // new shoppers (Saved 0 / Orders 0) so the Home screen is never blank.
  const hasStats = !!stats;

  // Honest "average saved per order": the mean of the discount percent that was
  // actually applied to each completed order. We deliberately do NOT show the
  // tier percent from the backend — every brand sets its own discount rules, so
  // a single "your discount" number would be a promise the app can't keep.
  const completedWithPercent = orders.filter(
    (o) => isCompleted(o) && Number(o.discountPercent) > 0,
  );
  const avgPercent =
    completedWithPercent.length > 0
      ? completedWithPercent.reduce((sum, o) => sum + Number(o.discountPercent), 0) /
        completedWithPercent.length
      : 0;
  const discountText =
    avgPercent > 0
      ? avgPercent % 1 === 0
        ? avgPercent.toFixed(0)
        : avgPercent.toFixed(1)
      : null;

  return (
    <div className="min-h-screen-safe bg-warm pb-12">
      <main className="px-6 pt-10 space-y-6">
        {profile && !profile.instagramHandle && <HomeInstagramConnect />}

        {hasStats && (
          <div
            className="creator-card p-6 !bg-gray-900 text-white"
            data-testid="card-stats"
          >
            <h3 className="font-black text-lg mb-5">Your Spiral</h3>

            <div
              className="mb-5 pb-5 border-b border-gray-800"
              data-testid="card-discount"
            >
              <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                Average saved per order
              </p>
              <p
                className="text-5xl font-black tracking-tight text-[#A8F0D1]"
                data-testid="text-discount-percent"
              >
                {discountText ? `${discountText}%` : "—"}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                  Saved
                </p>
                <p
                  className="text-2xl font-black text-[#A8F0D1]"
                  data-testid="text-total-saved"
                >
                  {formatCurrency(stats!.totalSaved, profile?.country)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mb-1">
                  Orders
                </p>
                <p
                  className="text-2xl font-black text-white"
                  data-testid="text-orders-completed"
                >
                  {stats!.ordersCompleted}
                </p>
              </div>
            </div>
          </div>
        )}

        {isSoftBanned && (
          <div
            className="creator-card story-bg-gradient p-6 text-white relative overflow-hidden"
            data-testid="banner-soft-banned"
          >
            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4 pointer-events-none">
              <Instagram className="w-32 h-32" />
            </div>

            <div className="relative z-10">
              <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
                <Lock className="w-7 h-7" />
              </div>
              <h2
                className="text-2xl font-black mb-2 leading-tight"
                data-testid="text-soft-ban-heading"
              >
                Keep your Spiral going
              </h2>
              <p
                className="text-[#E6F8F0] font-medium text-sm mb-5 max-w-[320px]"
                data-testid="text-soft-ban-body"
              >
                {profile?.softBannedReason === "inherited_from_instagram"
                  ? "Your Instagram owes a Story from an earlier Spiral order. Post it tagging the brand to keep earning discounts."
                  : pendingCount > 1
                    ? `You've got ${pendingCount} orders waiting on a Story. Post one for your latest purchase to keep earning discounts with Spiral.`
                    : "You've got a Story to post. Share your latest purchase tagging the brand to keep earning discounts with Spiral."}
              </p>

              <Link href="/discounts">
                <div
                  className="glass-pill flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-white/90 cursor-pointer hover-elevate"
                  data-testid="link-see-pending-orders"
                >
                  <span className="text-sm font-bold text-gray-900">
                    See pending orders
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#4ECCA3] flex-shrink-0" />
                </div>
              </Link>
            </div>
          </div>
        )}

        {recommendedBrands.length > 0 && (
          <section className="space-y-4" data-testid="section-recommended">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              You may be interested in
            </h2>
            <div
              className="-mx-6 px-6 flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none"
              style={{ scrollbarWidth: "none", touchAction: "pan-x pan-y" }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              data-testid="carousel-recommended"
            >
              {recommendedBrands.map((b) => {
                const name = cleanBrandName(b.storeName, b.instagramUsername);
                const heroImage =
                  (b.products ?? []).map((p) => p.image).find((img) => isSafeHttpUrl(img)) ??
                  b.instagramProfilePictureUrl ??
                  null;
                const myPct = igLinked ? discountForFollowers(b, followerCount) : 0;
                const pct = myPct > 0 ? myPct : maxDiscountPercent(b);
                const pctLabel =
                  pct > 0 ? (myPct > 0 ? `${pct}% off for you` : `Up to ${pct}% off`) : null;
                return (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (wasCleanTap()) setLocation(`/marketplace/${encodeURIComponent(b.id)}`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setLocation(`/marketplace/${encodeURIComponent(b.id)}`);
                      }
                    }}
                    className="relative flex-shrink-0 w-[78%] h-64 rounded-2xl overflow-hidden snap-start cursor-pointer"
                    data-testid={`card-recommended-${b.id}`}
                  >
                    {heroImage ? (
                      <img
                        src={heroImage}
                        alt={name}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: gradientFor(b.instagramUsername || name) }}
                      >
                        <span className="text-7xl font-black text-white drop-shadow-md">
                          {brandInitial(b.instagramUsername || name)}
                        </span>
                      </div>
                    )}
                    {/* Dark wash keeps the white text readable on any image */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/5 pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-black text-lg leading-tight truncate">
                          {name}
                        </p>
                        {pctLabel && (
                          <p className="text-[#A8F0D1] text-sm font-bold">{pctLabel}</p>
                        )}
                      </div>
                      <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center flex-shrink-0">
                        <ArrowRight className="w-4 h-4 text-gray-900" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {(categoryTiles.length > 0 || bestPercent > 0) && (
          <section className="space-y-4" data-testid="section-categories">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
              Browse categories
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setLocation("/marketplace?sort=best")}
                className="relative h-40 rounded-2xl overflow-hidden text-left p-4 story-bg-gradient hover-elevate"
                data-testid="tile-best-discounts"
              >
                <p className="text-white font-black text-base leading-tight">Best discounts</p>
                {bestPercent > 0 && (
                  <p className="text-white/90 text-xs font-bold mt-0.5">
                    {igLinked ? `Up to ${bestPercent}% for you` : `Up to ${bestPercent}% off`}
                  </p>
                )}
                <Tag className="absolute -bottom-4 -right-3 w-24 h-24 text-white/85 rotate-[-15deg] drop-shadow-lg" />
              </button>

              {categoryTiles.map((tile, i) => (
                <button
                  key={tile.category}
                  type="button"
                  onClick={() =>
                    setLocation(`/marketplace?category=${encodeURIComponent(tile.category)}`)
                  }
                  className="h-40 rounded-2xl overflow-hidden text-left p-4 flex flex-col hover-elevate"
                  style={{ backgroundColor: CATEGORY_TILE_COLORS[i % CATEGORY_TILE_COLORS.length] }}
                  data-testid={`tile-category-${tile.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                >
                  <p className="text-white font-black text-base leading-tight mb-3 truncate w-full">
                    {tile.category}
                  </p>
                  <div className="flex gap-2 flex-1 min-h-0">
                    {tile.images.length > 0 ? (
                      tile.images.map((img) => (
                        <div key={img} className="flex-1 bg-white rounded-xl overflow-hidden">
                          <img
                            src={img}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="flex-1 bg-white/20 rounded-xl" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {recentOrders.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                Recent Orders
              </h2>
              <Link href="/discounts">
                <button
                  className="flex items-center gap-1 text-xs font-bold text-[#4ECCA3] hover-elevate rounded-full px-2 py-1"
                  data-testid="link-view-all-orders"
                >
                  View all
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </Link>
            </div>

            <div className="space-y-4">
              {recentOrders.map((order) => (
                <OrderCard key={order.id} order={order} overlayOnly />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
