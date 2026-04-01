import { Store, Sparkles } from "lucide-react";

export default function Marketplace() {
  return (
    <div className="min-h-screen safe-top bg-white">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Marketplace</h1>
        <p className="text-gray-400 mt-1">Discover brands with Spiral discounts</p>
      </header>

      <main className="px-6 pb-8">
        <div className="p-8 rounded-2xl bg-gray-50 border border-gray-100 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center mx-auto mb-4">
            <Store className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="font-bold text-gray-900 mb-2">Coming soon</h3>
          <p className="text-sm text-gray-400 mb-4">
            Browse partner brands and unlock exclusive discounts by sharing on Instagram
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-[#D62976] font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>New brands added weekly</span>
          </div>
        </div>
      </main>
    </div>
  );
}
