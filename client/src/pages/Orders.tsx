import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ShoppingBag, ChevronRight, CheckCircle2, Clock, Store } from "lucide-react";
import type { Order } from "@shared/schema";

interface LineItem {
  title: string;
  variantTitle?: string | null;
  quantity: number;
}

function parseLineItems(raw: string | null | undefined): LineItem[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LineItem[];
  } catch {
    return [];
  }
}

function getStatusLabel(order: Order) {
  if (order.verificationStatus === "verified") return "Verified";
  if (order.verificationStatus === "story_detected") return "Story Received";
  if (order.status === "delivered") return "Post Your Story";
  if (order.status === "fulfilled") return "On the way";
  return "Awaiting Shipment";
}

function isCompleted(order: Order) {
  const status = getStatusLabel(order);
  return status === "Verified" || status === "Story Received";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "Verified":
      return "bg-green-500/20 text-green-300 border border-green-400/20";
    case "Story Received":
      return "bg-blue-500/20 text-blue-300 border border-blue-400/20";
    case "Post Your Story":
      return "bg-amber-500/20 text-amber-300 border border-amber-400/20";
    case "On the way":
      return "bg-blue-500/20 text-blue-300 border border-blue-400/20";
    default:
      return "bg-white/10 text-white/70 border border-white/10";
  }
}

function itemSummaryText(lineItems: LineItem[]) {
  return lineItems
    .map((item) => {
      const variant =
        item.variantTitle && item.variantTitle !== "Default Title"
          ? ` · ${item.variantTitle}`
          : "";
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
      return `${item.title}${variant}${qty}`;
    })
    .join(", ");
}

function StoreLogo({ src, name }: { src?: string | null; name?: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || "Store"}
        className="w-10 h-10 rounded-xl object-contain bg-white/10 p-1 flex-shrink-0"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
      <Store className="w-5 h-5 text-white/40" />
    </div>
  );
}

function OrderCard({ order, dimmed = false }: { order: Order; dimmed?: boolean }) {
  const status = getStatusLabel(order);
  const lineItems = parseLineItems(order.lineItems);
  const summary = itemSummaryText(lineItems);

  return (
    <Link href={`/orders/${order.id}`}>
      <div
        className={`p-4 rounded-2xl backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate transition-opacity ${dimmed ? "bg-white/5 opacity-70" : "bg-white/10"}`}
        data-testid={`card-order-${order.id}`}
      >
        <div className="flex items-start gap-3">
          <StoreLogo src={order.storeLogo} name={order.storeName} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`font-medium text-sm truncate ${dimmed ? "text-white/70" : "text-white"}`}>
                  {order.storeName || `Order #${order.shopifyOrderId.slice(-6)}`}
                </p>
                {order.storeName && (
                  <p className="text-xs text-white/40">#{order.shopifyOrderId.slice(-6)}</p>
                )}
              </div>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(status)}`}
              >
                {status}
              </span>
            </div>

            {summary ? (
              <p className={`text-sm mt-1.5 line-clamp-2 leading-snug ${dimmed ? "text-white/40" : "text-white/60"}`}>
                {summary}
              </p>
            ) : null}

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <p className="text-xs text-white/40">
                  {new Date(order.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                {status === "Verified" && (
                  <>
                    <span className="text-white/20">·</span>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-400" />
                      <p className="text-xs text-green-400 font-medium">Confirmed</p>
                    </div>
                  </>
                )}
                {status === "Post Your Story" && (
                  <>
                    <span className="text-white/20">·</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-300" />
                      <p className="text-xs text-amber-300 font-medium">Post to keep discount</p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-semibold ${dimmed ? "text-green-400/60" : "text-green-300"}`}>
                  -${Number(order.discountAmount).toFixed(2)}
                </span>
                <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

const MOCK_ACTIVE: Order[] = [
  {
    id: "mock-active-1",
    storeName: "Glossier",
    storeLogo: "https://www.google.com/s2/favicons?domain=glossier.com&sz=64",
    shopifyOrderId: "479301",
    lineItems: JSON.stringify([
      { title: "Cloud Paint", variantTitle: "Puff", quantity: 2 },
      { title: "Boy Brow", variantTitle: "Brown", quantity: 1 },
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
    postDeadline: null,
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
      { title: "Tree Dasher 2", variantTitle: "Blizzard / Size 9", quantity: 1 },
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
    postDeadline: null,
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
      { title: "Soft Lounge Long Slip Dress", variantTitle: "Cocoa / XS", quantity: 1 },
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
    postDeadline: null,
    verificationId: null,
    webhookTimestamp: null,
    shopperEmail: "",
    spiralCustomerId: null,
  } as unknown as Order,
];

const MOCK_HISTORY: Order[] = [
  {
    id: "mock-history-1",
    storeName: "Allbirds",
    storeLogo: "https://www.google.com/s2/favicons?domain=allbirds.com&sz=64",
    shopifyOrderId: "481923",
    lineItems: JSON.stringify([
      { title: "Tree Runner Go", variantTitle: "Natural White / Size 10", quantity: 1 },
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
    postDeadline: null,
    verificationId: null,
    webhookTimestamp: null,
    shopperEmail: "",
    spiralCustomerId: null,
  } as unknown as Order,
];

function SkeletonCard() {
  return (
    <div className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex-shrink-0" />
        <div className="flex-1">
          <div className="h-4 bg-white/10 rounded w-28 mb-2" />
          <div className="h-3 bg-white/10 rounded w-48 mb-3" />
          <div className="h-3 bg-white/10 rounded w-20" />
        </div>
      </div>
    </div>
  );
}

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  const activeOrders = orders.filter((o) => !isCompleted(o));
  const historyOrders = orders.filter((o) => isCompleted(o));
  const hasRealOrders = orders.length > 0;

  return (
    <div className="min-h-screen safe-top">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-semibold text-white" data-testid="text-page-title">
          Your Discounts
        </h1>
        <p className="text-white/60 mt-1">Track your purchases and savings</p>
      </header>

      <main className="px-6 pb-8 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : hasRealOrders ? (
          <>
            {activeOrders.length > 0 && (
              <section>
                <p className="text-xs text-white/40 uppercase tracking-wider px-1 mb-3">Active</p>
                <div className="space-y-3">
                  {activeOrders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            )}

            {activeOrders.length === 0 && historyOrders.length > 0 && (
              <section>
                <p className="text-xs text-white/40 uppercase tracking-wider px-1 mb-3">Active</p>
                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-6 h-6 text-white/40" />
                  </div>
                  <p className="text-sm font-medium text-white/60">No active orders</p>
                  <p className="text-xs text-white/30 mt-0.5">All your discounts have been confirmed</p>
                </div>
              </section>
            )}

            {historyOrders.length > 0 && (
              <section>
                <p className="text-xs text-white/40 uppercase tracking-wider px-1 mb-3">History</p>
                <div className="space-y-3">
                  {historyOrders.map((order) => (
                    <OrderCard key={order.id} order={order} dimmed />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <section>
              <p className="text-xs text-white/30 uppercase tracking-wider px-1 mb-3">
                Active — preview
              </p>
              <div className="space-y-3">
                {MOCK_ACTIVE.map((mock) => (
                  <div
                    key={mock.id}
                    className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10"
                  >
                    <div className="flex items-start gap-3">
                      <StoreLogo src={mock.storeLogo} name={mock.storeName} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-white text-sm">{mock.storeName}</p>
                            <p className="text-xs text-white/40">#{mock.shopifyOrderId}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(getStatusLabel(mock))}`}>
                            {getStatusLabel(mock)}
                          </span>
                        </div>
                        <p className="text-sm text-white/60 mt-1.5 line-clamp-2 leading-snug">
                          {itemSummaryText(parseLineItems(mock.lineItems))}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-white/40">
                              {new Date(mock.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            {getStatusLabel(mock) === "Post Your Story" && (
                              <>
                                <span className="text-white/20">·</span>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-300" />
                                  <p className="text-xs text-amber-300 font-medium">Post to keep discount</p>
                                </div>
                              </>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-green-300">-${mock.discountAmount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <p className="text-xs text-white/30 uppercase tracking-wider px-1 mb-3">
                History — preview
              </p>
              <div className="space-y-3">
                {MOCK_HISTORY.map((mock) => (
                  <div
                    key={mock.id}
                    className="p-4 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 opacity-70"
                  >
                    <div className="flex items-start gap-3">
                      <StoreLogo src={mock.storeLogo} name={mock.storeName} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-white/70 text-sm">{mock.storeName}</p>
                            <p className="text-xs text-white/40">#{mock.shopifyOrderId}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(getStatusLabel(mock))}`}>
                            {getStatusLabel(mock)}
                          </span>
                        </div>
                        <p className="text-sm text-white/40 mt-1.5 line-clamp-2 leading-snug">
                          {itemSummaryText(parseLineItems(mock.lineItems))}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-white/40">
                              {new Date(mock.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            <span className="text-white/20">·</span>
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-400" />
                              <p className="text-xs text-green-400 font-medium">Confirmed</p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-green-400/60">-${mock.discountAmount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
