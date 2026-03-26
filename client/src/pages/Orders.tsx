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

function OrderCard({ order }: { order: Order }) {
  const status = getStatusLabel(order);
  const lineItems = parseLineItems(order.lineItems);
  const itemSummary = lineItems
    .map((item) => {
      const variant = item.variantTitle && item.variantTitle !== "Default Title" ? ` · ${item.variantTitle}` : "";
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
      return `${item.title}${variant}${qty}`;
    })
    .join(", ");

  return (
    <Link href={`/orders/${order.id}`}>
      <div
        className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 cursor-pointer hover-elevate"
        data-testid={`card-order-${order.id}`}
      >
        <div className="flex items-start gap-3">
          <StoreLogo src={order.storeLogo} name={order.storeName} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-white text-sm truncate">
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

            {itemSummary ? (
              <p className="text-sm text-white/60 mt-1.5 line-clamp-2 leading-snug">
                {itemSummary}
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
                <span className="text-sm font-semibold text-green-300">
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

const MOCK_ORDERS = [
  {
    id: "mock-1",
    storeName: "Allbirds",
    storeLogo: "https://www.google.com/s2/favicons?domain=allbirds.com&sz=64",
    shopifyOrderId: "481923",
    lineItems: JSON.stringify([
      { title: "Tree Runner Go", variantTitle: "Natural White / Size 10", quantity: 1 },
      { title: "Wool Dasher Mizzle", variantTitle: "Dark Grey", quantity: 1 },
    ]),
    discountAmount: "12.00",
    createdAt: new Date("2026-03-26").toISOString(),
    status: "fulfilled",
    verificationStatus: "verified",
  },
  {
    id: "mock-2",
    storeName: "Glossier",
    storeLogo: "https://www.google.com/s2/favicons?domain=glossier.com&sz=64",
    shopifyOrderId: "479301",
    lineItems: JSON.stringify([
      { title: "Cloud Paint", variantTitle: "Puff", quantity: 2 },
      { title: "Boy Brow", variantTitle: "Brown", quantity: 1 },
    ]),
    discountAmount: "8.50",
    createdAt: new Date("2026-03-18").toISOString(),
    status: "delivered",
    verificationStatus: "pending",
  },
  {
    id: "mock-3",
    storeName: "SKIMS",
    storeLogo: "https://www.google.com/s2/favicons?domain=skims.com&sz=64",
    shopifyOrderId: "472108",
    lineItems: JSON.stringify([
      { title: "Soft Lounge Long Slip Dress", variantTitle: "Cocoa / XS", quantity: 1 },
    ]),
    discountAmount: "15.00",
    createdAt: new Date("2026-03-10").toISOString(),
    status: "fulfilled",
    verificationStatus: "pending",
  },
] as unknown as Order[];

export default function Orders() {
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/customer/orders"],
  });

  return (
    <div className="min-h-screen safe-top">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-semibold text-white" data-testid="text-page-title">
          Your Discounts
        </h1>
        <p className="text-white/60 mt-1">Track your purchases and savings</p>
      </header>

      <main className="px-6 pb-8">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 animate-pulse"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 bg-white/10 rounded w-28 mb-2" />
                    <div className="h-3 bg-white/10 rounded w-48 mb-3" />
                    <div className="h-3 bg-white/10 rounded w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/30 uppercase tracking-wider px-1 mb-4">
              Preview — how your orders will look
            </p>
            {MOCK_ORDERS.map((mock) => (
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
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusBadge(getStatusLabel(mock))}`}
                      >
                        {getStatusLabel(mock)}
                      </span>
                    </div>
                    <p className="text-sm text-white/60 mt-1.5 line-clamp-2 leading-snug">
                      {parseLineItems(mock.lineItems)
                        .map((item) => {
                          const variant =
                            item.variantTitle && item.variantTitle !== "Default Title"
                              ? ` · ${item.variantTitle}`
                              : "";
                          const qty = item.quantity > 1 ? ` ×${item.quantity}` : "";
                          return `${item.title}${variant}${qty}`;
                        })
                        .join(", ")}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-white/40">
                          {new Date(mock.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                        {getStatusLabel(mock) === "Verified" && (
                          <>
                            <span className="text-white/20">·</span>
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-green-400" />
                              <p className="text-xs text-green-400 font-medium">Confirmed</p>
                            </div>
                          </>
                        )}
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
                      <span className="text-sm font-semibold text-green-300">
                        -${mock.discountAmount}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
