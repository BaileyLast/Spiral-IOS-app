import './_group.css';
import { useState } from "react";
import { ArrowLeft, CheckCircle, Clock, Package, Camera, Instagram, ShoppingBag } from "lucide-react";

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
      <div
        className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0"
        aria-label={`${alt} placeholder`}
      >
        <ShoppingBag className="w-5 h-5 text-gray-300" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-12 h-12 rounded-md object-cover bg-gray-100 flex-shrink-0"
      onError={() => setErrored(true)}
    />
  );
}

function LineItemRow({ item }: { item: LineItem }) {
  const productUrl =
    typeof item.productUrl === "string" && /^https?:\/\//i.test(item.productUrl) ? item.productUrl : null;

  const inner = (
    <>
      <LineItemThumb src={item.imageUrl} alt={item.name} />
      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
        <p className="text-sm text-gray-900 truncate">{item.name}</p>
        {item.quantity > 1 && (
          <span className="text-sm text-gray-400 flex-shrink-0">×{item.quantity}</span>
        )}
      </div>
    </>
  );

  if (productUrl) {
    return (
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 -mx-2 px-2 py-1 rounded-md hover-elevate active-elevate-2"
      >
        {inner}
      </a>
    );
  }

  return <div className="flex items-center gap-3">{inner}</div>;
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
    { id: "ordered", label: "Order placed", icon: Package, complete: true },
    { id: "shipped", label: "On the way", icon: Clock, complete: true },
    { id: "delivered", label: "Delivered", icon: CheckCircle, complete: true },
    { id: "verified", label: "Story verified", icon: CheckCircle, complete: false },
  ];

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center px-4 h-14 border-b border-gray-100">
        <button
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors h-9 w-9 text-gray-500 hover-elevate active-elevate-2"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="ml-2 text-lg font-bold text-gray-900">Order Details</h1>
      </header>

      <main className="px-6 pb-8 pt-6 space-y-6">
        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-gray-400">Order</p>
              <p className="text-lg font-bold text-gray-900">#{ORDER.shopifyOrderId.slice(-6)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-400">Your discount</p>
              <p className="text-lg font-bold text-green-700">-${Number(ORDER.discountAmount).toFixed(2)}</p>
              {percentLabel && (
                <p className="text-xs text-green-700/80 mt-0.5">{percentLabel}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Order total</span>
            <span className="font-semibold text-gray-900">${Number(ORDER.orderTotal).toFixed(2)}</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">Items</h2>
          <div className="space-y-3">
            {ORDER.lineItems.map((item, i) => (
              <LineItemRow key={i} item={item} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Quantity shown reflects items discounted under your tier.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100">
          <h2 className="font-bold text-gray-900 mb-4">Order Progress</h2>
          <div className="space-y-4">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isLast = i === steps.length - 1;
              return (
                <div key={step.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step.complete ? "bg-[#4ECCA3]/10" : "bg-gray-100"}`}>
                      <Icon className={`w-4 h-4 ${step.complete ? "text-[#4ECCA3]" : "text-gray-300"}`} />
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 h-6 mt-1 ${step.complete ? "bg-[#4ECCA3]/20" : "bg-gray-100"}`} />
                    )}
                  </div>
                  <div className="flex-1 pb-2">
                    <p className={`font-medium ${step.complete ? "text-gray-900" : "text-gray-300"}`}>{step.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {status === "awaiting" && (
          <div className="p-5 rounded-2xl bg-amber-50 border border-amber-200">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Camera className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-amber-900">Post your Story to unlock your next discount</h3>
                <p className="text-sm text-amber-700 mt-1">
                  Until this is verified, you can't use Spiral on your next purchase.
                </p>
              </div>
            </div>
            <div className="bg-amber-100/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-amber-800">
                <Instagram className="w-4 h-4" />
                <span className="font-semibold">How to post:</span>
              </div>
              <ol className="text-sm text-amber-800 space-y-2 ml-6 list-decimal">
                <li>Take a photo or video of your purchase</li>
                <li>Add it to your Instagram Story</li>
                <li>Tag the brand using the @ mention sticker</li>
              </ol>
              <p className="text-xs text-amber-600 mt-2">
                We'll verify your story automatically once you tag the brand
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
