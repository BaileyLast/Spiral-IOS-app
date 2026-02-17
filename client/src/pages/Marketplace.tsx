import { Store, Sparkles } from "lucide-react";

export default function Marketplace() {
  return (
    <div className="min-h-screen safe-top">
      <header className="px-6 pt-8 pb-6">
        <h1 className="text-2xl font-semibold text-white">Marketplace</h1>
        <p className="text-white/60 mt-1">Discover brands with Spiral discounts</p>
      </header>

      <main className="px-6 pb-8">
        <div className="p-8 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-4">
            <Store className="w-8 h-8 text-white/70" />
          </div>
          <h3 className="font-semibold text-white mb-2">Coming soon</h3>
          <p className="text-sm text-white/50 mb-4">
            Browse partner brands and unlock exclusive discounts by sharing on Instagram
          </p>
          <div className="flex items-center justify-center gap-2 text-xs text-white/60 font-medium">
            <Sparkles className="w-4 h-4" />
            <span>New brands added weekly</span>
          </div>
        </div>
      </main>
    </div>
  );
}
