import { Card } from "@/components/ui/card";
import { Store, ChevronRight, Sparkles } from "lucide-react";

export default function Marketplace() {
  return (
    <div className="min-h-screen bg-background safe-top">
      <header className="relative overflow-hidden px-6 pt-8 pb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/20 to-transparent rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <h1 className="text-2xl font-semibold text-foreground">Marketplace</h1>
          <p className="text-muted-foreground mt-1">Discover brands with Spiral discounts</p>
        </div>
      </header>

      <main className="px-6 pb-8">
        <Card className="p-8 rounded-2xl text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/20">
              <Store className="w-8 h-8 text-primary-foreground" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Coming soon</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Browse partner brands and unlock exclusive discounts by sharing on Instagram
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-primary font-medium">
              <Sparkles className="w-4 h-4" />
              <span>New brands added weekly</span>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
