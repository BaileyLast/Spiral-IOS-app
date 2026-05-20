import './_group.css';
import { ArrowLeft, Check, MoveRight, Instagram } from "lucide-react";

type LineItem = {
  name: string;
  imageUrl: string | null;
  productUrl?: string | null;
  quantity: number;
};

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
      imageUrl: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=320&h=320&fit=crop",
      productUrl: "https://www.glossier.com/products/cloud-paint",
      quantity: 2,
    },
    {
      name: "Boy Brow — Brown",
      imageUrl: "https://images.unsplash.com/photo-1629198725876-0f82a9883c84?w=320&h=320&fit=crop",
      productUrl: "https://www.glossier.com/products/boy-brow",
      quantity: 1,
    },
  ] as LineItem[],
};

function LineItemView({ item }: { item: LineItem }) {
  return (
    <div className="flex items-center gap-4 py-4 border-b border-gray-100 last:border-0">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="w-16 h-20 object-cover rounded-lg bg-gray-50" />
      ) : (
        <div className="w-16 h-20 rounded-lg bg-gray-100" />
      )}
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900 leading-snug pr-4">{item.name}</p>
        <p className="text-xs text-gray-400 mt-1">Qty {item.quantity}</p>
      </div>
    </div>
  );
}

export function OrderDetail() {
  const isAwaiting = ORDER.status === "awaiting";

  return (
    <div className="spiral-editorial pb-12">
      <header className="px-6 h-20 flex items-center justify-between sticky top-0 bg-[#FCFCFA]/80 backdrop-blur-xl z-50">
        <button className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-gray-900 hover:bg-gray-50 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-[10px] uppercase tracking-widest font-semibold text-gray-400">Order #{ORDER.shopifyOrderId}</span>
        <div className="w-10" /> {/* Spacer */}
      </header>

      <main>
        {/* Magazine-style hero section for the discount */}
        <section className="px-8 pt-6 pb-12 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-white card-shadow flex items-center justify-center mb-6">
             <img src="https://www.google.com/s2/favicons?domain=glossier.com&sz=128" alt="Glossier" className="w-8 h-8 object-contain" />
          </div>
          <h1 className="font-editorial text-4xl mb-4 tracking-tight">glossier</h1>
          
          <div className="inline-flex flex-col items-center justify-center bg-white rounded-full px-8 py-4 card-shadow">
            <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-1">Discount secured</span>
            <span className="font-editorial-medium text-5xl text-mint">
              ${Number(ORDER.discountAmount).toFixed(2)}
            </span>
          </div>
        </section>

        {/* The large Mint Post-Story Hero CTA */}
        {isAwaiting && (
          <section className="px-6 mb-12">
            <div className="bg-mint rounded-[32px] p-8 text-white relative overflow-hidden shadow-[0_20px_40px_-15px_rgba(78,204,163,0.5)]">
              {/* Decorative shapes */}
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-black/5 rounded-full blur-3xl" />
              
              <div className="relative z-10">
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-6">
                  <Instagram className="w-6 h-6 text-white" />
                </div>
                
                <h2 className="font-editorial-medium text-3xl leading-tight mb-3">
                  post your story
                </h2>
                <p className="text-white/80 text-sm leading-relaxed mb-8 max-w-[240px]">
                  Share your Glossier order on Instagram and tag @glossier to verify this discount.
                </p>

                <button className="w-full bg-white text-mint rounded-full py-4 px-6 font-bold text-sm tracking-wide flex items-center justify-between hover:scale-[0.98] transition-transform shadow-lg shadow-white/20">
                  <span>Open Instagram</span>
                  <MoveRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="px-6 space-y-6">
          <div className="bg-white rounded-3xl p-6 card-shadow border border-white">
            <h3 className="font-editorial text-2xl mb-6">timeline</h3>
            <div className="space-y-6 pl-2">
              <div className="flex gap-4 relative">
                <div className="absolute left-[7px] top-6 bottom-[-24px] w-px bg-gray-100" />
                <div className="w-4 h-4 rounded-full bg-gray-900 border-4 border-white shadow-sm relative z-10 mt-1" />
                <div>
                  <p className="font-medium text-sm text-gray-900">Delivered</p>
                  <p className="text-xs text-gray-400 mt-1">Ready for your story</p>
                </div>
              </div>
              <div className="flex gap-4 relative">
                <div className="absolute left-[7px] top-6 bottom-[-24px] w-px bg-gray-100" />
                <div className="w-4 h-4 rounded-full bg-gray-200 border-4 border-white shadow-sm relative z-10 mt-1" />
                <div>
                  <p className="font-medium text-sm text-gray-400">Shipped</p>
                </div>
              </div>
              <div className="flex gap-4 relative">
                <div className="w-4 h-4 rounded-full bg-gray-200 border-4 border-white shadow-sm relative z-10 mt-1" />
                <div>
                  <p className="font-medium text-sm text-gray-400">Order placed</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 card-shadow border border-white">
             <div className="flex items-center justify-between mb-6">
               <h3 className="font-editorial text-2xl">items</h3>
               <span className="text-sm font-medium text-gray-900">${Number(ORDER.orderTotal).toFixed(2)}</span>
             </div>
             <div>
               {ORDER.lineItems.map((item, i) => (
                 <LineItemView key={i} item={item} />
               ))}
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}
