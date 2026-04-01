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
  return "Ordered";
}

function isCompleted(order: Order) {
  const status = getStatusLabel(order);
  return status === "Verified" || status === "Story Received";
}

function getStatusBadge(status: string) {
  switch (status) {
    case "Verified":
      return "bg-green-50 text-green-700 border border-green-200";
    case "Story Received":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    case "Post Your Story":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "On the way":
      return "bg-blue-50 text-blue-700 border border-blue-200";
    default:
      return "bg-gray-100 text-gray-600 border border-gray-200";
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

function OrderCard({ order, dimmed = false }: { order: Order; dimmed?: boolean }) {
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
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(status)}`}
              >
                {status}
              </span>
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
                {status === "Verified" && (
                  <>
                    <span className="text-gray-200">·</span>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                      <p className="text-xs text-green-600 font-medium">Confirmed</p>
                    </div>
                  </>
                )}
                {status === "Post Your Story" && (
                  <>
                    <span className="text-gray-200">·</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <p className="text-xs text-amber-600 font-medium">Post to keep discount</p>
                    </div>
                  </>
                )}
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

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  const activeOrders = orders.filter((o) => !isCompleted(o));
  const historyOrders = orders.filter((o) => isCompleted(o));
  const hasRealOrders = orders.length > 0;

  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight" data-testid="text-page-title">
          Your Discounts
        </h1>
        <p className="text-gray-400 mt-1">Track your purchases and savings</p>
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
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider px-1 mb-3">Active</p>
                <div className="space-y-3">
                  {activeOrders.map((order) => (
                    <OrderCard key={order.id} order={order} />
                  ))}
                </div>
              </section>
            )}

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
        ) : (
          <>
            <section>
              <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider px-1 mb-3">
                Active — preview
              </p>
              <div className="space-y-3">
                {MOCK_ACTIVE.map((mock) => (
                  <div
                    key={mock.id}
                    className="p-4 rounded-2xl bg-white border border-gray-100"
                  >
                    <div className="flex items-start gap-3">
                      <StoreLogo src={mock.storeLogo} name={mock.storeName} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm">{mock.storeName}</p>
                            <p className="text-xs text-gray-400">#{mock.shopifyOrderId}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(getStatusLabel(mock))}`}>
                            {getStatusLabel(mock)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1.5 line-clamp-2 leading-snug">
                          {itemSummaryText(parseLineItems(mock.lineItems))}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400">
                              {new Date(mock.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            {getStatusLabel(mock) === "Post Your Story" && (
                              <>
                                <span className="text-gray-200">·</span>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  <p className="text-xs text-amber-600 font-medium">Post to keep discount</p>
                                </div>
                              </>
                            )}
                          </div>
                          <span className="text-sm font-bold text-green-700">-${mock.discountAmount}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <p className="text-xs text-gray-300 font-semibold uppercase tracking-wider px-1 mb-3">
                History — preview
              </p>
              <div className="space-y-3">
                {MOCK_HISTORY.map((mock) => (
                  <div
                    key={mock.id}
                    className="p-4 rounded-2xl bg-gray-50 border border-gray-100 opacity-60"
                  >
                    <div className="flex items-start gap-3">
                      <StoreLogo src={mock.storeLogo} name={mock.storeName} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-500 text-sm">{mock.storeName}</p>
                            <p className="text-xs text-gray-400">#{mock.shopifyOrderId}</p>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(getStatusLabel(mock))}`}>
                            {getStatusLabel(mock)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-1.5 line-clamp-2 leading-snug">
                          {itemSummaryText(parseLineItems(mock.lineItems))}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-400">
                              {new Date(mock.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                            <span className="text-gray-200">·</span>
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-500" />
                              <p className="text-xs text-green-600 font-medium">Confirmed</p>
                            </div>
                          </div>
                          <span className="text-sm font-bold text-green-600/60">-${mock.discountAmount}</span>
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
