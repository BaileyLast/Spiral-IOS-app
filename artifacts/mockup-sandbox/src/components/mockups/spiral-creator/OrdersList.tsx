import './_group.css';
import { ChevronRight, CheckCircle2, Package, Instagram } from "lucide-react";

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
    case "Verified": return "bg-[#E6F8F0] text-[#1A996E]";
    case "Story Received": return "bg-blue-50 text-blue-600";
    case "Story Needed": return "bg-[#4ECCA3] text-white shadow-[0_2px_8px_rgba(78,204,163,0.3)]";
    case "On the way": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-500";
  }
}

function OrderCard({ order, dimmed = false }: { order: MockOrder; dimmed?: boolean }) {
  const status = statusLabel(order);
  const mainImage = order.lineItems[0]?.imageUrl || "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=300&h=300&fit=crop";

  return (
    <div className={`creator-card overflow-hidden ${dimmed ? 'opacity-70 grayscale-[0.2]' : ''}`}>
      <div className="relative h-40 w-full overflow-hidden bg-gray-100">
        <img src={mainImage} className="w-full h-full object-cover" alt="Product" />
        <div className="absolute top-4 left-4 flex gap-2">
          <div className="glass-pill rounded-full p-1 pr-3 flex items-center gap-2 shadow-sm">
            <img src={order.storeLogo} alt={order.storeName} className="w-6 h-6 rounded-full bg-white" />
            <span className="text-xs font-bold text-gray-900">{order.storeName}</span>
          </div>
        </div>
        <div className="absolute top-4 right-4">
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase ${statusBadge(status)}`}>
            {status}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end text-white">
          <div>
            <p className="text-sm font-medium line-clamp-1 opacity-90">{order.lineItems[0]?.name || "Order"}</p>
            <p className="text-xs opacity-75 mt-0.5">#{order.shopifyOrderId}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-[#A8F0D1]">-${Number(order.discountAmount).toFixed(2)}</p>
          </div>
        </div>
      </div>
      
      {status === "Story Needed" && (
        <div className="p-4 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#E6F8F0] flex items-center justify-center text-[#4ECCA3]">
              <Instagram className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Post a story</p>
              <p className="text-xs text-gray-500">to unlock your discount</p>
            </div>
          </div>
          <button className="tactile-btn px-5 py-2.5 text-sm">Post</button>
        </div>
      )}
      
      {status === "Verified" && (
        <div className="p-4 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-[#1A996E]">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Verified</p>
              <p className="text-xs text-gray-500">Discount unlocked</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </div>
      )}
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
      { name: "Cloud Paint", imageUrl: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=400&h=400&fit=crop", quantity: 2 },
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
      { name: "Tree Dasher 2", imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=400&h=400&fit=crop", quantity: 1 },
    ],
    discountAmount: "14.00",
    orderTotal: "110.00",
    discountPercent: "12.00",
    createdAt: "2026-03-20",
    status: "fulfilled",
    verificationStatus: "pending",
  },
];

const HISTORY: MockOrder[] = [
  {
    id: "h1",
    storeName: "SKIMS",
    storeLogo: "https://www.google.com/s2/favicons?domain=skims.com&sz=64",
    shopifyOrderId: "475610",
    lineItems: [
      { name: "Soft Lounge Long Slip Dress", imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=400&fit=crop", quantity: 1 },
    ],
    discountAmount: "15.00",
    orderTotal: "98.00",
    discountPercent: "15.00",
    createdAt: "2026-03-18",
    status: "delivered",
    verificationStatus: "verified",
  },
];

export function OrdersList() {
  return (
    <div className="min-h-screen creator-theme pb-12">
      <header className="px-6 pt-12 pb-6">
        <h1 className="text-3xl font-black tracking-tight text-gray-900 mb-2">My Orders</h1>
        <div className="glass-pill inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white shadow-sm border border-gray-100">
          <div className="w-2 h-2 rounded-full bg-[#4ECCA3] animate-pulse" />
          <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">2 in progress</span>
        </div>
      </header>

      <main className="px-6 space-y-8">
        <section className="space-y-4">
          {ACTIVE.map((o) => <OrderCard key={o.id} order={o} />)}
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Past</h2>
            <div className="h-px bg-gray-200 flex-1" />
          </div>
          {HISTORY.map((o) => <OrderCard key={o.id} order={o} dimmed />)}
        </section>
      </main>
    </div>
  );
}
