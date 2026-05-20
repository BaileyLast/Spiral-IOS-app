import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight, Store, Lock } from "lucide-react";
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
  const formatted = Math.round(pct) === pct ? pct.toFixed(0) : pct.toFixed(1);
  return `${formatted}% off`;
}

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "Verified";
  if (order.verificationStatus === "quick_verified") return "Confirmed";
  if (order.verificationStatus === "not_public") return "Repost Story";
  if (order.verificationStatus === "taken_down_early") return "Repost Story";
  if (order.verificationStatus === "awaiting_review") return "Confirming";
  if (order.verificationStatus === "story_detected") return "Story Received";
  if (order.status === "delivered") return "Story Needed";
  // Use the raw Shopify shipment_status when present so the shopper sees
  // honest progress regardless of how this merchant ships.
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
  return status === "Verified" || status === "Confirmed";
}

// Visual treatment per status. Two design rules:
// 1. Only "action-needed" states get a tinted pill (Story Needed = primary
//    mint, Repost Story = orange). Everything else uses a neutral grey pill
//    so colour noise stays low and the action-needed cards visually win.
// 2. Every state still gets a coloured dot so the eye can scan state at a
//    glance without reading text. Klarna/Apple-style.
function getStatusBadgeStyle(status: string): { pill: string; dot: string } {
  switch (status) {
    case "Verified":
    case "Confirmed":
      return { pill: "bg-gray-50 text-gray-700", dot: "bg-emerald-500" };
    case "Confirming":
    case "Story Received":
      return { pill: "bg-gray-50 text-gray-700", dot: "bg-blue-500" };
    case "Story Needed":
      return { pill: "bg-primary/10 text-primary", dot: "bg-primary" };
    case "Repost Story":
      return { pill: "bg-orange-50 text-orange-700", dot: "bg-orange-500" };
    case "Ready for pickup":
      return { pill: "bg-gray-50 text-gray-700", dot: "bg-indigo-500" };
    case "Out for delivery":
    case "On the way":
      return { pill: "bg-gray-50 text-gray-700", dot: "bg-sky-500" };
    case "Delivery attempted":
    case "Delivery issue":
      return { pill: "bg-gray-50 text-gray-700", dot: "bg-orange-500" };
    default:
      return { pill: "bg-gray-50 text-gray-600", dot: "bg-gray-400" };
  }
}

function itemSummaryText(lineItems: LineItem[]) {
  return lineItems
    .map((item) => {
      const name = lineItemDisplayName(item);
      if (!name) return "";
      const variant =
        item.variantTitle && item.variantTitle !== "Default Title"
          ? ` · ${item.variantTitle}`
          : "";
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
      return `${name}${variant}${qty}`;
    })
    .filter((entry) => entry.length > 0)
    .join(", ");
}

function StoreLogo({ src, name }: { src?: string | null; name?: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || "Store"}
        className="w-10 h-10 rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 flex-shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
      <Store className="w-5 h-5 text-gray-400" />
    </div>
  );
}

export function OrderCard({ order, dimmed = false }: { order: Order; dimmed?: boolean }) {
  const status = getStatusLabel(order);
  const lineItems = parseLineItems(order.lineItems);
  const summary = itemSummaryText(lineItems);

  return (
    <Link href={`/orders/${order.id}`}>
      <div
        className={`p-4 rounded-2xl border cursor-pointer hover-elevate transition-opacity ${dimmed ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-100"}`}
        data-testid={`card-order-${order.id}`}
      >
        <div className="flex items-start gap-3">
          <StoreLogo src={order.storeLogo} name={order.storeName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-semibold text-sm truncate ${dimmed ? "text-gray-400" : "text-gray-900"}`}>
                  {order.storeName || `Order #${order.shopifyOrderId.slice(-6)}`}
                </p>
                {order.storeName && (
                  <p className="text-xs text-gray-400">#{order.shopifyOrderId.slice(-6)}</p>
                )}
              </div>
              {(() => {
                const { pill, dot } = getStatusBadgeStyle(status);
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${pill}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {status}
                  </span>
                );
              })()}
            </div>

            {summary ? (
              <p className={`text-sm mt-1.5 line-clamp-2 leading-snug ${dimmed ? "text-gray-300" : "text-gray-500"}`}>
                {summary}
              </p>
            ) : null}

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400">
                  {new Date(order.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-bold ${dimmed ? "text-green-600/60" : "text-green-700"}`}>
                  -${Number(order.discountAmount).toFixed(2)}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>
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
      { name: "Cloud Paint", imageUrl: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=120&h=120&fit=crop", quantity: 2 },
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
      { name: "Tree Dasher 2 — Blizzard / Size 9", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=120&h=120&fit=crop", quantity: 1 },
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
      { name: "Soft Lounge Long Slip Dress — Cocoa / XS", imageUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=120&h=120&fit=crop", quantity: 1 },
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
      { name: "Tree Runner Go — Natural White / Size 10", imageUrl: "https://images.unsplash.com/photo-1600185365926-3a2ce3cdb9eb?w=120&h=120&fit=crop", quantity: 1 },
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
    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded w-28 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-48 mb-3" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

interface MeResponse {
  id: string;
  email: string;
  accountStatus?: string;
  softBannedReason?: string | null;
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
  // Mirrors server-side getOwedOrdersForCustomer exactly so banner count never disagrees
  // with checkout: taken_down_early (final-fail debt) is owed regardless of delivery; quick
  // states (pending / awaiting_review / not_public) only count once delivered.
  const owedCount = orders.filter((o) => {
    const v = o.verificationStatus;
    if (v === "taken_down_early") return true;
    if (o.status === "delivered" && (v === "pending" || v === "awaiting_review" || v === "not_public")) return true;
    return false;
  }).length;

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight" data-testid="text-page-title">
          Your Discounts
        </h1>
        <p className="text-gray-400 mt-1">Track your purchases and savings</p>
      </header>

      <main className="px-6 pb-8 space-y-6">
        {isSoftBanned && (
          <div
            className="p-4 rounded-2xl bg-orange-50 border border-orange-200 flex items-start gap-3"
            data-testid="banner-soft-banned"
          >
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Lock className="w-4 h-4 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-orange-900 text-sm" data-testid="text-soft-ban-heading">
                Your next discount is on hold
              </p>
              <p className="text-xs text-orange-700 mt-0.5" data-testid="text-soft-ban-body">
                {me?.softBannedReason === "inherited_from_instagram"
                  ? "Your Instagram account owes a Story from a previous Spiral order. Post that Story tagging the brand to unlock your next Spiral discount."
                  : owedCount > 1
                    ? `Post a Story tagging the brand for your ${owedCount} pending orders to unlock your next Spiral discount.`
                    : "Post a Story tagging the brand for your pending order to unlock your next Spiral discount."}
              </p>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : hasRealOrders ? (
          <>
            {activeOrders.length > 0 && (() => {
              // When any active order is awaiting a Story, dim the rest so the
              // action-needed cards visually win. If everything is in flight,
              // every card stays full-strength.
              const hasStoryNeeded = activeOrders.some(
                (o) => getStatusLabel(o) === "Story Needed",
              );
              return (
                <section>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider px-1 mb-3">Active</p>
                  <div className="space-y-3">
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
                  </div>
                </section>
              );
            })()}

            {activeOrders.length === 0 && historyOrders.length > 0 && (
              <section>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider px-1 mb-3">Active</p>
                <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-500">No active orders</p>
                  <p className="text-xs text-gray-400 mt-0.5">All your discounts have been confirmed</p>
                </div>
              </section>
            )}

            {historyOrders.length > 0 && (
              <section>
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider px-1 mb-3">History</p>
                <div className="space-y-3">
                  {historyOrders.map((order) => (
                    <OrderCard key={order.id} order={order} dimmed />
                  ))}
                </div>
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
                <section>
                  <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider px-1 mb-3">
                    Active — preview
                  </p>
                  <div className="space-y-3">
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
                  </div>
                </section>
              );
            })()}

            <section>
              <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider px-1 mb-3">
                History — preview
              </p>
              <div className="space-y-3">
                {MOCK_HISTORY.map((mock) => (
                  <OrderCard key={mock.id} order={mock} dimmed />
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 text-center" data-testid="empty-orders">
            <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">No orders yet</h3>
            <p className="text-sm text-gray-400">
              When you make a purchase with Spiral, it will appear here
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
