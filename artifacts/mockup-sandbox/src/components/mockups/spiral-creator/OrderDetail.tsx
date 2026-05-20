import './_group.css';
import { ArrowLeft, CheckCircle, Package, Instagram, ShieldCheck, ChevronRight } from "lucide-react";

const ORDER = {
  shopifyOrderId: "479301",
  storeName: "Glossier",
  storeLogo: "https://www.google.com/s2/favicons?domain=glossier.com&sz=64",
  discountAmount: "8.50",
  orderTotal: "42.00",
  discountPercent: "15.00",
  status: "awaiting" as const,
  lineItems: [
    {
      name: "Cloud Paint — Dusk",
      imageUrl: "https://images.unsplash.com/photo-1631730486572-226d1f595b68?w=300&h=300&fit=crop",
      quantity: 2,
    },
    {
      name: "Boy Brow — Brown",
      imageUrl: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=300&h=300&fit=crop",
      quantity: 1,
    },
  ],
};

export function OrderDetail() {
  const isAwaiting = ORDER.status === "awaiting";

  return (
    <div className="min-h-screen creator-theme pb-12">
      <header className="px-4 py-4 flex items-center justify-between sticky top-0 bg-[#FCFCFB]/80 backdrop-blur-md z-10">
        <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
          <ArrowLeft className="w-5 h-5 text-gray-900" />
        </div>
        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm">
          <img src={ORDER.storeLogo} alt="Logo" className="w-5 h-5 rounded-full" />
          <span className="text-sm font-bold text-gray-900">Order #{ORDER.shopifyOrderId.slice(-4)}</span>
        </div>
        <div className="w-10" />
      </header>

      <main className="px-5 mt-4 space-y-6">
        
        {/* BIG TACTILE CTA */}
        {isAwaiting && (
          <div className="creator-card story-bg-gradient p-6 text-white text-center relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
              <Instagram className="w-32 h-32" />
            </div>
            
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-[#4ECCA3] shadow-lg mb-4">
                <Instagram className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black mb-2 leading-tight">Post your haul,<br/>keep your discount.</h2>
              <p className="text-[#E6F8F0] font-medium text-sm mb-6 max-w-[240px]">
                Tag @glossier on your story to verify your purchase and unlock your savings.
              </p>
              
              <button className="tactile-btn bg-white text-[#4ECCA3] w-full py-4 text-lg shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_-4px_0_rgba(240,240,240,1)] hover:bg-gray-50 active:shadow-[0_0px_0px_rgba(0,0,0,0.1),inset_0_0px_0_rgba(240,240,240,1)]">
                Post Story Now
              </button>
              
              <div className="mt-4 flex items-center gap-1.5 text-[#E6F8F0] text-xs font-medium bg-black/10 px-3 py-1.5 rounded-full">
                <ShieldCheck className="w-4 h-4" />
                <span>Auto-verifies instantly</span>
              </div>
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        <div className="creator-card p-5">
          <div className="flex justify-between items-end mb-4">
            <h3 className="font-bold text-lg text-gray-900">The Goods</h3>
            <span className="text-sm font-bold text-gray-400">{ORDER.lineItems.length} items</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {ORDER.lineItems.map((item, i) => (
              <div key={i} className="relative group rounded-2xl overflow-hidden bg-gray-100 aspect-[4/5]">
                <img src={item.imageUrl || ""} alt={item.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-white font-bold text-sm leading-tight line-clamp-2 mb-1">{item.name}</p>
                  <p className="text-white/80 text-xs font-medium">Qty: {item.quantity}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SAVINGS SUMMARY */}
        <div className="creator-card p-5 bg-gray-900 text-white">
          <h3 className="font-bold text-lg mb-4">The Math</h3>
          
          <div className="space-y-3 mb-5 border-b border-gray-800 pb-5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400 font-medium">Subtotal</span>
              <span className="font-bold">${ORDER.orderTotal}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[#A8F0D1] font-bold">Creator Discount</span>
                <span className="bg-[#4ECCA3]/20 text-[#A8F0D1] text-[10px] px-2 py-0.5 rounded-full font-black uppercase">
                  {parseFloat(ORDER.discountPercent)}% OFF
                </span>
              </div>
              <span className="font-bold text-[#A8F0D1]">-${ORDER.discountAmount}</span>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400 font-medium">Total Paid</span>
            <span className="text-2xl font-black">${(Number(ORDER.orderTotal) - Number(ORDER.discountAmount)).toFixed(2)}</span>
          </div>
        </div>

        {/* TRACKING */}
        <div className="px-2">
          <h3 className="font-bold text-gray-900 mb-4 ml-1">Journey</h3>
          <div className="space-y-0 relative before:absolute before:inset-y-2 before:left-[15px] before:w-[2px] before:bg-gray-200">
            <div className="flex gap-4 relative z-10 pb-6">
              <div className="w-8 h-8 rounded-full bg-[#4ECCA3] border-4 border-[#FCFCFB] flex items-center justify-center text-white shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div className="pt-1">
                <p className="font-bold text-gray-900 text-sm">Delivered</p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">Today, 2:40 PM</p>
              </div>
            </div>
            <div className="flex gap-4 relative z-10 pb-6">
              <div className="w-8 h-8 rounded-full bg-gray-200 border-4 border-[#FCFCFB] shrink-0" />
              <div className="pt-1 opacity-50">
                <p className="font-bold text-gray-900 text-sm">Shipped</p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">Mar 22</p>
              </div>
            </div>
            <div className="flex gap-4 relative z-10">
              <div className="w-8 h-8 rounded-full bg-gray-200 border-4 border-[#FCFCFB] shrink-0" />
              <div className="pt-1 opacity-50">
                <p className="font-bold text-gray-900 text-sm">Ordered</p>
                <p className="text-xs text-gray-500 font-medium mt-0.5">Mar 20</p>
              </div>
            </div>
          </div>
        </div>
        
      </main>
    </div>
  );
}
