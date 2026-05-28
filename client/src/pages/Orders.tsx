import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight, Store, Lock, Instagram, CheckCircle2 } from "lucide-react";
import type { Order } from "@shared/schema";

export interface LineItem {
  name?: string | null;
  title?: string | null;
  variantTitle?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  quantity: number;
}

export function parseLineItems(raw: string | null | undefined): LineItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LineItem[]) : [];
  } catch {
    return [];
  }
}

export function lineItemDisplayName(item: LineItem): string {
  return (item.name ?? item.title ?? "").toString().trim();
}

export function formatDiscountPercent(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const pct = typeof raw === "number" ? raw : parseFloat(raw);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  // Tiers are whole numbers starting at 10%. Shopify rounds the applied
  // discount down to whole cents, which shaves the realised % a hair below
  // the tier (e.g. tier 10% on $16.99 → $1.69 → 9.94%). Snap to the nearest
  // whole % so the display always reads back to the tier the merchant set.
  return `${Math.round(pct)}% off`;
}

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "Story verified";
  if (order.verificationStatus === "quick_verified") return "Confirmed";
  if (order.verificationStatus === "not_public") return "Repost Story";
  if (order.verificationStatus === "taken_down_early") return "Repost Story";
  if (order.verificationStatus === "awaiting_review") return "Confirming";
  if (order.verificationStatus === "story_detected") return "Story Received";
  if (order.status === "delivered") return "Story Needed";
  if (order.status === "fulfilled") {
    switch (order.shopifyTrackingStatus) {
      case "ready_for_pickup":
        return "Ready for pickup";
      case "out_for_delivery":
        return "Out for delivery";
      case "attempted_delivery":
        return "Delivery attempted";
      case "failure":
        return "Delivery issue";
      case "in_transit":
      case "confirmed":
      case "label_printed":
      case "label_purchased":
      default:
        return "On the way";
    }
  }
  return "Ordered";
}

function isCompleted(order: Order) {
  const status = getStatusLabel(order);
  return status === "Story verified" || status === "Confirmed";
}

// Tactile Creator status pill (image-card overlay). The "Story Needed" state
// gets the loud mint pill so it visually wins; everything else stays calm.
function statusPillClasses(status: string) {
  switch (status) {
    case "Story verified":
    case "Confirmed":
      return "bg-[#E6F8F0] text-[#1A996E]";
    case "Story Received":
    case "Confirming":
      return "bg-blue-50 text-blue-600";
    case "Story Needed":
      return "bg-[#4ECCA3] text-white shadow-[0_2px_8px_rgba(78,204,163,0.3)]";
    case "Repost Story":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-white/90 text-gray-700";
  }
}

function isGoogleFaviconUrl(src: string): boolean {
  return /(^|\/\/)(www\.)?google\.com\/s2\/favicons/i.test(src);
}

function StoreBadgeImg({ src, name }: { src?: string | null; name?: string | null }) {
  const safeSrc = src && !isGoogleFaviconUrl(src) ? src : null;
  if (!safeSrc) {
    return (
      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
        <Store className="w-3 h-3 text-gray-400" />
      </div>
    );
  }
  return (
    <img
      src={safeSrc}
      alt={name || "Store"}
      className="w-6 h-6 rounded-full bg-white object-contain"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

export function OrderCard({ order, dimmed = false }: { order: Order; dimmed?: boolean }) {
  const status = getStatusLabel(order);
  const lineItems = parseLineItems(order.lineItems);
  const firstItem = lineItems[0];
  const itemName = firstItem ? lineItemDisplayName(firstItem) : "";
  const heroImage = firstItem?.imageUrl || null;

  return (
    <Link href={`/orders/${order.id}`} className="block">
      <div
        className={`creator-card overflow-hidden cursor-pointer ${dimmed ? "opacity-70 grayscale-[0.2]" : ""}`}
        data-testid={`card-order-${order.id}`}
      >
        <div className="relative h-40 w-full overflow-hidden bg-gray-100">
          {heroImage ? (
            <img src={heroImage} className="w-full h-full object-cover" alt={itemName || "Order"} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
              <ShoppingBag className="w-12 h-12 text-gray-300" />
            </div>
          )}

          <div className="absolute top-4 left-4 flex gap-2">
            <div className="glass-pill rounded-full p-1 pr-3 flex items-center gap-2 shadow-sm">
              <StoreBadgeImg src={order.storeLogo} name={order.storeName} />
              <span className="text-xs font-bold text-gray-900" data-testid={`text-store-name-${order.id}`}>
                {order.storeName || `Order #${order.shopifyOrderId.slice(-6)}`}
              </span>
            </div>
          </div>

          <div className="absolute top-4 right-4">
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase ${statusPillClasses(status)}`}
              data-testid={`status-order-${order.id}`}
            >
              {status}
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end text-white">
            <div className="min-w-0">
              {itemName && (
                <p className="text-sm font-medium line-clamp-1 opacity-90">{itemName}</p>
              )}
              <p className="text-xs opacity-75 mt-0.5">#{order.shopifyOrderId.slice(-6)}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-[#A8F0D1]">
                You saved ${Number(order.discountAmount).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {status === "Story Needed" && (
          <div className="p-4 bg-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-[#E6F8F0] flex items-center justify-center text-[#4ECCA3] flex-shrink-0">
                <Instagram className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-gray-900">Post a Story</p>
            </div>
            <span className="tactile-btn px-5 py-2.5 text-sm">Open</span>
          </div>
        )}

        {(status === "Story verified" || status === "Confirmed") && (
          <div className="p-4 bg-white flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-[#1A996E] flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-gray-900">{status}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
          </div>
        )}
      </div>
    </Link>
  );
}

export function OrderRowCompact({ order }: { order: Order }) {
  const lineItems = parseLineItems(order.lineItems);
  const firstItem = lineItems[0];
  const itemName = firstItem ? lineItemDisplayName(firstItem) : "";

  return (
    <Link href={`/orders/${order.id}`} className="block">
      <div
        className="creator-card flex items-center gap-3 px-4 py-3 cursor-pointer hover-elevate"
        data-testid={`card-order-${order.id}`}
      >
        <StoreBadgeImg src={order.storeLogo} name={order.storeName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 truncate" data-testid={`text-store-name-${order.id}`}>
              {order.storeName || `Order #${order.shopifyOrderId.slice(-6)}`}
            </p>
            <span className="text-xs text-gray-400 flex-shrink-0">#{order.shopifyOrderId.slice(-6)}</span>
          </div>
          {itemName && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{itemName}</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-[#1A996E]">
            ${Number(order.discountAmount).toFixed(2)}
          </p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide font-bold">saved</p>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
      </div>
    </Link>
  );
}

export const MOCK_ACTIVE: Order[] = [
  {
    id: "mock-active-1",
    storeName: "Glossier",
    storeLogo: "https://www.google.com/s2/favicons?domain=glossier.com&sz=64",
    shopifyOrderId: "479301",
    lineItems: JSON.stringify([
      { name: "Cloud Paint", imageUrl: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=400&h=400&fit=crop", quantity: 2 },
      { name: "Boy Brow", imageUrl: null, quantity: 1 },
    ]),
    discountAmount: "8.50",
    orderTotal: "42.00",
    discountPercent: "15.00",
    createdAt: new Date("2026-03-24").toISOString(),
    status: "delivered",
    verificationStatus: "pending",
    instagramHandle: null,
    instagramUserId: null,
    followerCount: null,
    fulfilledAt: null,
    deliveredAt: null,
    verificationId: null,
    webhookTimestamp: null,
    shopperEmail: "",
    spiralCustomerId: null,
  } as unknown as Order,
  {
    id: "mock-active-2",
    storeName: "Allbirds",
    storeLogo: "https://www.google.com/s2/favicons?domain=allbirds.com&sz=64",
    shopifyOrderId: "477842",
    lineItems: JSON.stringify([
      { name: "Tree Dasher 2 — Blizzard / Size 9", imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop", quantity: 1 },
    ]),
    discountAmount: "14.00",
    orderTotal: "110.00",
    discountPercent: "12.00",
    createdAt: new Date("2026-03-20").toISOString(),
    status: "fulfilled",
    verificationStatus: "pending",
    instagramHandle: null,
    instagramUserId: null,
    followerCount: null,
    fulfilledAt: null,
    deliveredAt: null,
    verificationId: null,
    webhookTimestamp: null,
    shopperEmail: "",
    spiralCustomerId: null,
  } as unknown as Order,
  {
    id: "mock-active-3",
    storeName: "SKIMS",
    storeLogo: "https://www.google.com/s2/favicons?domain=skims.com&sz=64",
    shopifyOrderId: "475610",
    lineItems: JSON.stringify([
      { name: "Soft Lounge Long Slip Dress — Cocoa / XS", imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop", quantity: 1 },
    ]),
    discountAmount: "15.00",
    orderTotal: "98.00",
    discountPercent: "15.00",
    createdAt: new Date("2026-03-18").toISOString(),
    status: "pending",
    verificationStatus: "pending",
    instagramHandle: null,
    instagramUserId: null,
    followerCount: null,
    fulfilledAt: null,
    deliveredAt: null,
    verificationId: null,
    webhookTimestamp: null,
    shopperEmail: "",
    spiralCustomerId: null,
  } as unknown as Order,
];

export const MOCK_HISTORY: Order[] = [
  {
    id: "mock-history-1",
    storeName: "Allbirds",
    storeLogo: "https://www.google.com/s2/favicons?domain=allbirds.com&sz=64",
    shopifyOrderId: "481923",
    lineItems: JSON.stringify([
      { name: "Tree Runner Go — Natural White / Size 10", imageUrl: "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=400&h=400&fit=crop", quantity: 1 },
    ]),
    discountAmount: "12.00",
    orderTotal: "95.00",
    discountPercent: "12.00",
    createdAt: new Date("2026-02-14").toISOString(),
    status: "fulfilled",
    verificationStatus: "verified",
    instagramHandle: null,
    instagramUserId: null,
    followerCount: null,
    fulfilledAt: null,
    deliveredAt: null,
    verificationId: null,
    webhookTimestamp: null,
    shopperEmail: "",
    spiralCustomerId: null,
  } as unknown as Order,
];

function SkeletonCard() {
  return (
    <div className="creator-card overflow-hidden animate-pulse">
      <div className="h-40 w-full bg-gray-100" />
    </div>
  );
}

interface MeResponse {
  id: string;
  email: string;
  accountStatus?: string;
  softBannedReason?: string | null;
  instagramHandle?: string | null;
}

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });
  const { data: me } = useQuery<MeResponse>({
    queryKey: ["/api/customer/me"],
  });

  const activeOrders = orders.filter((o) => !isCompleted(o));
  const historyOrders = orders.filter((o) => isCompleted(o));
  const hasRealOrders = orders.length > 0;
  const isSoftBanned = me?.accountStatus === "soft_banned";

  const inProgressCount = activeOrders.length;

  return (
    <div className="min-h-screen bg-warm safe-top pb-12">
      <header className="px-6 pt-10 pb-6">
        <h1
          className="text-3xl font-black tracking-tight text-gray-900 mb-2"
          data-testid="text-page-title"
        >
          Your Discounts
        </h1>
        {hasRealOrders && inProgressCount > 0 && (
          <div className="glass-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-gray-100">
            <div className="w-2 h-2 rounded-full bg-[#4ECCA3] animate-pulse" />
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
              {inProgressCount} in progress
            </span>
          </div>
        )}
      </header>

      <main className="px-6 space-y-8">
        {me && !me.instagramHandle && (
          <Link
            href="/home"
            className="block p-5 rounded-2xl bg-gradient-to-br from-[#EBF9F5] to-[#D6F2E6] border border-[#A8F5E0] hover-elevate active-elevate-2"
            data-testid="card-connect-instagram-prominent"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <Instagram className="w-6 h-6 text-[#2BAE88]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-black text-[#0F4F3C] text-base">
                  Verify your Instagram
                </p>
                <p className="text-sm text-[#155843] mt-0.5">
                  To start earning discounts we need to verify your Instagram account. Just follow the simple instructions here.
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-[#2BAE88] flex-shrink-0 mt-1" />
            </div>
          </Link>
        )}

        {isSoftBanned && (
          <div
            className="creator-card story-bg-gradient p-4 text-white flex items-start gap-3"
            data-testid="banner-soft-banned"
          >
            <div className="w-9 h-9 rounded-full bg-white text-[#4ECCA3] shadow-lg flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-base leading-tight" data-testid="text-soft-ban-heading">
                Keep the spiral going
              </p>
              <p className="text-xs text-[#E6F8F0] font-medium mt-1" data-testid="text-soft-ban-body">
                Complete your pending Story post(s) to keep earning Spiral discounts.
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : hasRealOrders ? (
          <>
            {activeOrders.length > 0 && (() => {
              const hasStoryNeeded = activeOrders.some(
                (o) => getStatusLabel(o) === "Story Needed",
              );
              return (
                <section className="space-y-5">
                  {activeOrders.map((order) => {
                    const isStoryNeeded = getStatusLabel(order) === "Story Needed";
                    return (
                      <OrderCard
                        key={order.id}
                        order={order}
                        dimmed={hasStoryNeeded && !isStoryNeeded}
                      />
                    );
                  })}
                </section>
              );
            })()}

            {activeOrders.length === 0 && historyOrders.length > 0 && (
              <section>
                <div className="creator-card p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#E6F8F0] flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6 text-[#4ECCA3]" />
                  </div>
                  <p className="text-sm font-bold text-gray-900">All caught up</p>
                  <p className="text-xs text-gray-500 mt-0.5">Every discount is confirmed</p>
                </div>
              </section>
            )}

            {historyOrders.length > 0 && (
              <section className="space-y-5">
                <div className="flex items-center gap-4">
                  <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Past</h2>
                  <div className="h-px bg-gray-200 flex-1" />
                </div>
                {historyOrders.map((order) => (
                  <OrderCard key={order.id} order={order} dimmed />
                ))}
              </section>
            )}
          </>
        ) : import.meta.env.DEV ? (
          <>
            {(() => {
              const mockHasStoryNeeded = MOCK_ACTIVE.some(
                (o) => getStatusLabel(o) === "Story Needed",
              );
              return (
                <section className="space-y-5">
                  <p className="text-xs text-gray-300 font-bold uppercase tracking-widest px-1">
                    Active — preview
                  </p>
                  {MOCK_ACTIVE.map((mock) => {
                    const isStoryNeeded = getStatusLabel(mock) === "Story Needed";
                    return (
                      <OrderCard
                        key={mock.id}
                        order={mock}
                        dimmed={mockHasStoryNeeded && !isStoryNeeded}
                      />
                    );
                  })}
                </section>
              );
            })()}

            <section className="space-y-3">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Past orders</h2>
                <div className="h-px bg-gray-200 flex-1" />
              </div>
              {[...historyOrders, ...MOCK_HISTORY].map((order) => (
                <OrderRowCompact key={order.id} order={order} />
              ))}
            </section>
          </>
        ) : (
          <div className="creator-card p-8 text-center" data-testid="empty-orders">
            <div className="w-16 h-16 rounded-2xl bg-[#E6F8F0] flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-[#4ECCA3]" />
            </div>
            <h3 className="font-black text-gray-900 mb-2 text-lg">No orders yet</h3>
            <p className="text-sm text-gray-500">
              When you make a purchase with Spiral, it will appear here
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
