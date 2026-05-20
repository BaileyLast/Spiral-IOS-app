import './_group.css';
import { useState } from "react";
import { ArrowLeft, Check, Instagram, ShoppingBag, Box } from "lucide-react";

type LineItem = {
  name: string;
  imageUrl: string | null;
  productUrl?: string | null;
  quantity: number;
};

function formatPercent(raw: string) {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const f = Math.round(n) === n ? n.toFixed(0) : n.toFixed(1);
  return `${f}% off`;
}

function LineItemThumb({ src, alt }: { src: string | null; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <div className="w-14 h-14 rounded-2xl bg-[#F3F3F3] flex items-center justify-center flex-shrink-0">
        <ShoppingBag className="w-6 h-6 text-[#A3A3A3]" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-14 h-14 rounded-2xl object-cover bg-[#F3F3F3] flex-shrink-0"
      onError={() => setErrored(true)}
    />
  );
}

function LineItemRow({ item }: { item: LineItem }) {
  const productUrl = typeof item.productUrl === "string" && /^https?:\/\//i.test(item.productUrl) ? item.productUrl : null;

  const inner = (
    <>
      <LineItemThumb src={item.imageUrl} alt={item.name} />
      <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
        <p className="text-[15px] font-medium text-[#111111] truncate">{item.name}</p>
        {item.quantity > 1 && (
          <span className="text-[15px] text-[#A3A3A3] font-medium flex-shrink-0">×{item.quantity}</span>
        )}
      </div>
    </>
  );

  if (productUrl) {
    return (
      <a href={productUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 py-2 hover:opacity-80 transition-opacity">
        {inner}
      </a>
    );
  }

  return <div className="flex items-center gap-4 py-2">{inner}</div>;
}

const ORDER = {
  shopifyOrderId: "479301",
  storeName: "Glossier",
  discountAmount: "8.50",
  orderTotal: "42.00",
  discountPercent: "15.00",
  status: "awaiting" as const,
  lineItems: [
    {
      name: "Cloud Paint — Dusk",
      imageUrl: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=160&h=160&fit=crop",
      productUrl: "https://www.glossier.com/products/cloud-paint",
      quantity: 2,
    },
    {
      name: "Boy Brow — Brown",
      imageUrl: null,
      productUrl: "https://www.glossier.com/products/boy-brow",
      quantity: 1,
    },
  ] as LineItem[],
};

export function OrderDetail() {
  const status = ORDER.status;
  const percentLabel = formatPercent(ORDER.discountPercent);

  const steps = [
    { id: "ordered", label: "Order Placed", complete: true },
    { id: "shipped", label: "Shipped", complete: true },
    { id: "delivered", label: "Delivered", complete: true },
    { id: "verified", label: "Story Verified", complete: false },
  ];

  return (
    <div className="premium-container min-h-screen pb-12">
      <header className="flex items-center justify-between px-6 h-16 pt-2">
        <button className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-[#111111] active:bg-[#F3F3F3] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-semibold tracking-tight text-[15px]">Order #{ORDER.shopifyOrderId.slice(-6)}</span>
        <div className="w-10" />
      </header>

      <main className="px-6 space-y-8 pt-4">
        
        {/* HERO CARD for Post Story */}
        {status === "awaiting" && (
          <div className="premium-hero-card p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mb-4">
              <Instagram className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold tracking-tight mb-2">Time to post</h2>
            <p className="text-[15px] text-white/90 leading-relaxed mb-6">
              Post a story tagging <span className="font-bold text-white">@{ORDER.storeName.toLowerCase()}</span> to unlock your discount for next time.
            </p>
            <button className="w-full bg-white text-[#4ECCA3] font-bold text-[15px] py-3.5 rounded-full active:scale-[0.98] transition-transform">
              Open Instagram
            </button>
          </div>
        )}

        <section>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-xl font-bold tracking-tight">{ORDER.storeName}</h2>
            <div className="text-right">
              <span className="text-xl font-bold tracking-tight block">${Number(ORDER.orderTotal).toFixed(2)}</span>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-[#F3F3F3] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <div className="space-y-2">
              {ORDER.lineItems.map((item, i) => (
                <LineItemRow key={i} item={item} />
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="bg-white rounded-3xl border border-[#F3F3F3] p-5 shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#F3F3F3]">
              <span className="text-[15px] font-medium text-[#737373]">Discount Earned</span>
              <div className="text-right">
                <span className="text-[17px] font-bold text-[#4ECCA3]">${Number(ORDER.discountAmount).toFixed(2)}</span>
                {percentLabel && <span className="ml-2 text-[13px] font-medium text-[#4ECCA3]/70 bg-[#4ECCA3]/10 px-2 py-0.5 rounded-md">{percentLabel}</span>}
              </div>
            </div>

            <div className="space-y-6 pt-2">
              {steps.map((step, i) => {
                const isLast = i === steps.length - 1;
                return (
                  <div key={step.id} className="flex gap-4 relative">
                    {!isLast && (
                      <div className="absolute left-[11px] top-7 bottom-[-16px] w-[2px] bg-[#F3F3F3]" />
                    )}
                    <div className="relative z-10 flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step.complete ? "bg-[#111111]" : "bg-[#F3F3F3]"}`}>
                        {step.complete && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <div className="pt-0.5">
                      <p className={`text-[15px] font-medium tracking-tight ${step.complete ? "text-[#111111]" : "text-[#A3A3A3]"}`}>{step.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
