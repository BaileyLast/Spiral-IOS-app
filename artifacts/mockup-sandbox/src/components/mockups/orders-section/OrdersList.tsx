import './_group.css';
import { ShoppingBag, ChevronRight, CheckCircle2, Clock, Store } from "lucide-react";

type LineItem = {
  name?: string | null;
  imageUrl?: string | null;
  variantTitle?: string | null;
  quantity: number;
};

type MockOrder = {
  id: string;
  storeName: string;
  storeLogo: string;
  shopifyOrderId: string;
  lineItems: LineItem[];
  discountAmount: string;
  orderTotal: string;
  discountPercent: string;
  createdAt: string;
  status: "pending" | "fulfilled" | "delivered";
  verificationStatus: "pending" | "verified" | "story_detected";
};

function statusLabel(o: MockOrder) {
  if (o.verificationStatus === "verified") return "Verified";
  if (o.verificationStatus === "story_detected") return "Story Received";
  if (o.status === "delivered") return "Story Needed";
  if (o.status === "fulfilled") return "On the way";
  return "Ordered";
}

function statusBadge(s: string) {
  switch (s) {
    case "Verified": return "bg-green-50 text-green-700 border border-green-200";
    case "Story Received": return "bg-blue-50 text-blue-700 border border-blue-200";
    case "Story Needed": return "bg-amber-50 text-amber-700 border border-amber-200";
    case "On the way": return "bg-blue-50 text-blue-700 border border-blue-200";
    default: return "bg-gray-100 text-gray-600 border border-gray-200";
  }
}

function summaryText(items: LineItem[]) {
  return items
    .map((it) => {
      const name = (it.name ?? "").trim();
      if (!name) return "";
      const v = it.variantTitle && it.variantTitle !== "Default Title" ? ` · ${it.variantTitle}` : "";
      const q = it.quantity > 1 ? ` ×${it.quantity}` : "";
      return `${name}${v}${q}`;
    })
    .filter(Boolean)
    .join(", ");
}

function StoreLogo({ src, name }: { src: string; name: string }) {
  return (
    <img
      src={src}
      alt={name}
      className="w-10 h-10 rounded-xl object-contain bg-gray-50 border border-gray-100 p-1 flex-shrink-0"
      onError={(e) => {
        const el = e.currentTarget;
        el.style.display = "none";
        const sib = el.nextElementSibling as HTMLElement | null;
        if (sib) sib.style.display = "flex";
      }}
    />
  );
}

function StoreLogoFallback() {
  return (
    <div className="w-10 h-10 rounded-xl bg-gray-100 hidden items-center justify-center flex-shrink-0">
      <Store className="w-5 h-5 text-gray-400" />
    </div>
  );
}

function OrderCard({ order, dimmed = false }: { order: MockOrder; dimmed?: boolean }) {
  const status = statusLabel(order);
  const summary = summaryText(order.lineItems);

  return (
    <div
      className={`p-4 rounded-2xl border cursor-pointer hover-elevate transition-opacity ${
        dimmed ? "bg-gray-50 border-gray-100 opacity-60" : "bg-white border-gray-100"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          <StoreLogo src={order.storeLogo} name={order.storeName} />
          <StoreLogoFallback />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-semibold text-sm truncate ${dimmed ? "text-gray-400" : "text-gray-900"}`}>
                {order.storeName}
              </p>
              <p className="text-xs text-gray-400">#{order.shopifyOrderId.slice(-6)}</p>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${statusBadge(status)}`}>
              {status}
            </span>
          </div>

          {summary && (
            <p className={`text-sm mt-1.5 line-clamp-2 leading-snug ${dimmed ? "text-gray-300" : "text-gray-500"}`}>
              {summary}
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400">
                {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
              {status === "Story Needed" && (
                <>
                  <span className="text-gray-200">·</span>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-500" />
                    <p className="text-xs text-amber-600 font-medium">Unlocks your next discount</p>
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
  );
}

const ACTIVE: MockOrder[] = [
  {
    id: "a1",
    storeName: "Glossier",
    storeLogo: "https://www.google.com/s2/favicons?domain=glossier.com&sz=64",
    shopifyOrderId: "479301",
    lineItems: [
      { name: "Cloud Paint", imageUrl: null, quantity: 2 },
      { name: "Boy Brow", imageUrl: null, quantity: 1 },
    ],
    discountAmount: "8.50",
    orderTotal: "42.00",
    discountPercent: "15.00",
    createdAt: "2026-03-24",
    status: "delivered",
    verificationStatus: "pending",
  },
  {
    id: "a2",
    storeName: "Allbirds",
    storeLogo: "https://www.google.com/s2/favicons?domain=allbirds.com&sz=64",
    shopifyOrderId: "477842",
    lineItems: [
      { name: "Tree Dasher 2 — Blizzard / Size 9", imageUrl: null, quantity: 1 },
    ],
    discountAmount: "14.00",
    orderTotal: "110.00",
    discountPercent: "12.00",
    createdAt: "2026-03-20",
    status: "fulfilled",
    verificationStatus: "pending",
  },
  {
    id: "a3",
    storeName: "SKIMS",
    storeLogo: "https://www.google.com/s2/favicons?domain=skims.com&sz=64",
    shopifyOrderId: "475610",
    lineItems: [
      { name: "Soft Lounge Long Slip Dress — Cocoa / XS", imageUrl: null, quantity: 1 },
    ],
    discountAmount: "15.00",
    orderTotal: "98.00",
    discountPercent: "15.00",
    createdAt: "2026-03-18",
    status: "pending",
    verificationStatus: "pending",
  },
];

const HISTORY: MockOrder[] = [
  {
    id: "h1",
    storeName: "Allbirds",
    storeLogo: "https://www.google.com/s2/favicons?domain=allbirds.com&sz=64",
    shopifyOrderId: "481923",
    lineItems: [
      { name: "Tree Runner Go — Natural White / Size 10", imageUrl: null, quantity: 1 },
    ],
    discountAmount: "12.00",
    orderTotal: "95.00",
    discountPercent: "12.00",
    createdAt: "2026-02-14",
    status: "fulfilled",
    verificationStatus: "verified",
  },
];

export function OrdersList() {
  return (
    <div className="min-h-screen bg-white">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Your Discounts</h1>
        <p className="text-gray-400 mt-1">Track your purchases and savings</p>
      </header>

      <main className="px-6 pb-8 space-y-6">
        <section>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider px-1 mb-3">Active</p>
          <div className="space-y-3">
            {ACTIVE.map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        </section>

        <section>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider px-1 mb-3">History</p>
          <div className="space-y-3">
            {HISTORY.map((o) => <OrderCard key={o.id} order={o} dimmed />)}
          </div>
        </section>
      </main>
    </div>
  );
}
