import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Gift, Instagram, Sparkles } from "lucide-react";
import spiralLogoUrl from "@assets/Spiral logo (2)_1763051288266.png";

export default function Onboarding() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm mx-auto flex flex-col items-center text-center">
          <img 
            src={spiralLogoUrl} 
            alt="Spiral" 
            className="h-10 mb-16 object-contain"
            data-testid="img-spiral-logo"
          />
          
          <div className="space-y-8 mb-12">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
                <Gift className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Earn instant discounts</h3>
                <p className="text-sm text-muted-foreground mt-1">Get money off your purchase at checkout</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
                <Instagram className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Share your purchase</h3>
                <p className="text-sm text-muted-foreground mt-1">Post one Instagram Story after delivery</p>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Keep your savings</h3>
                <p className="text-sm text-muted-foreground mt-1">Your discount is confirmed once verified</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-8 safe-bottom">
        <Link href="/login">
          <Button 
            className="w-full h-14 text-base font-medium rounded-xl"
            data-testid="button-get-started"
          >
            Get Started
          </Button>
        </Link>
        <p className="text-xs text-muted-foreground text-center mt-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
