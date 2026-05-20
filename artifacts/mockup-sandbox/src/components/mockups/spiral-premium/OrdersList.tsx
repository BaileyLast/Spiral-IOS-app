import './_group.css';
import { ChevronRight } from "lucide-react";

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

function OrderCard({ order, dimmed = false }: { order: MockOrder; dimmed?: boolean }) {
  const status = statusLabel(order);
  const summary = summaryText(order.lineItems);
  
  const isActionable = status === "Story Needed";

  return (
    <div className={`premium-card p-5 cursor-pointer ${dimmed ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isActionable && (
            <div className="w-2 h-2 rounded-full bg-[#4ECCA3] shadow-[0_0_8px_rgba(78,204,163,0.6)]" />
          )}
          <span className="font-semibold text-base tracking-tight text-[#111111]">{order.storeName}</span>
        </div>
        <span className="text-sm font-medium tracking-tight text-[#111111]">
          -${Number(order.discountAmount).toFixed(2)}
        </span>
      </div>

      <p className="text-sm text-[#737373] line-clamp-1 mb-4">
        {summary}
      </p>

      <div className="flex items-center justify-between border-t border-[#F3F3F3] pt-3">
        <span className="text-[13px] text-[#A3A3A3] font-medium tracking-wide">
          {new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-medium ${isActionable ? "text-[#4ECCA3]" : "text-[#737373]"}`}>
            {status}
          </span>
          <ChevronRight className="w-4 h-4 text-[#D8D8D8]" />
        </div>
      </div>
    </div>
  );
}

const ACTIVE: MockOrder[] = [
  {
    id: "a1",
    storeName: "Glossier",
    storeLogo: "",
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
    storeLogo: "",
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
    storeLogo: "",
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
    storeLogo: "",
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
    <div className="premium-container min-h-screen pb-12">
      <header className="px-6 pt-12 pb-8">
        <h1 className="text-[28px] font-bold tracking-tight text-[#111111] mb-1">Activity</h1>
        <p className="text-[15px] text-[#737373]">Your discounts and pending stories.</p>
      </header>

      <main className="px-6 space-y-10">
        <section>
          <p className="text-[13px] text-[#A3A3A3] font-medium tracking-wide uppercase mb-4 px-1">Action Required</p>
          <div className="space-y-4">
            {ACTIVE.filter(o => statusLabel(o) === "Story Needed").map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        </section>

        <section>
          <p className="text-[13px] text-[#A3A3A3] font-medium tracking-wide uppercase mb-4 px-1">In Progress</p>
          <div className="space-y-4">
            {ACTIVE.filter(o => statusLabel(o) !== "Story Needed").map((o) => <OrderCard key={o.id} order={o} />)}
          </div>
        </section>

        <section>
          <p className="text-[13px] text-[#A3A3A3] font-medium tracking-wide uppercase mb-4 px-1">History</p>
          <div className="space-y-4">
            {HISTORY.map((o) => <OrderCard key={o.id} order={o} dimmed />)}
          </div>
        </section>
      </main>
    </div>
  );
}
