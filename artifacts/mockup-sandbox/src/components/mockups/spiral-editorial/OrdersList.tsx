import './_group.css';
import { ArrowRight, ArrowUpRight } from "lucide-react";

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

function statusLabel(o: MockOrder) {
  if (o.verificationStatus === "verified") return "verified";
  if (o.verificationStatus === "story_detected") return "story received";
  if (o.status === "delivered") return "story needed";
  if (o.status === "fulfilled") return "on the way";
  return "ordered";
}

function StatusIndicator({ status }: { status: string }) {
  let dotColor = "bg-gray-300";
  if (status === "verified") dotColor = "bg-mint";
  if (status === "story needed") dotColor = "bg-[#4ECCA3]"; // same mint
  if (status === "on the way" || status === "story received") dotColor = "bg-gray-400";

  return (
    <div className="flex items-center gap-2 bg-white/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-gray-100/50 shadow-sm">
      <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">
        {status}
      </span>
    </div>
  );
}

function OrderItem({ order, dimmed = false }: { order: MockOrder; dimmed?: boolean }) {
  const status = statusLabel(order);
  
  const date = new Date(order.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className={`relative flex gap-6 group cursor-pointer hover-elevate ${dimmed ? "opacity-60" : ""}`}>
      {/* Timeline line */}
      <div className="absolute left-6 top-10 bottom-[-24px] w-px bg-gray-100 group-last:bg-transparent" />
      
      {/* Left side: Date & Dot */}
      <div className="flex flex-col items-center pt-2 z-10 w-12 flex-shrink-0">
        <span className="text-xs text-gray-400 font-medium tracking-wide">{date}</span>
        <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-gray-200 mt-3" />
      </div>

      {/* Right side: Card */}
      <div className="flex-1 bg-white rounded-3xl p-6 card-shadow border border-white relative z-10 overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-center gap-3">
            <img 
              src={order.storeLogo} 
              alt={order.storeName} 
              className="w-8 h-8 rounded-full object-cover bg-gray-50 border border-gray-100" 
            />
            <h3 className="font-editorial text-xl tracking-tight">{order.storeName.toLowerCase()}</h3>
          </div>
          <StatusIndicator status={status} />
        </div>

        {/* Big mint moment per card for active discount amount */}
        {!dimmed && (
          <div className="mb-6 flex items-baseline gap-1">
            <span className="text-mint font-editorial-medium text-4xl">
              ${Number(order.discountAmount).toFixed(2)}
            </span>
            <span className="text-sm text-gray-400 font-medium">saved</span>
          </div>
        )}
        
        {dimmed && (
          <div className="mb-6">
            <span className="text-gray-400 font-editorial text-2xl">
              ${Number(order.discountAmount).toFixed(2)}
            </span>
            <span className="text-xs text-gray-400 ml-1">saved</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-2 pt-4 border-t border-gray-50">
          <p className="text-sm text-gray-400 font-medium">
            Order #{order.shopifyOrderId}
          </p>
          <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-mint group-hover:text-white transition-colors">
            <ArrowUpRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrdersList() {
  return (
    <div className="spiral-editorial pb-24">
      <header className="px-8 pt-16 pb-12 flex justify-between items-end">
        <div>
          <h1 className="font-editorial text-5xl text-gray-900 tracking-tight leading-none mb-2">
            discounts
          </h1>
          <p className="text-gray-400 text-sm font-medium tracking-wide">
            Your editorial history
          </p>
        </div>
      </header>

      <main className="px-6 space-y-20">
        <section>
          <div className="px-2 space-y-6">
            {ACTIVE.map((o) => <OrderItem key={o.id} order={o} />)}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-4 px-6 mb-8">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Archive</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="px-2 space-y-6">
            {HISTORY.map((o) => <OrderItem key={o.id} order={o} dimmed />)}
          </div>
        </section>
      </main>
    </div>
  );
}
