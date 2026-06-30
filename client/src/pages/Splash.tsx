import { Link, useLocation } from "wouter";
import spiralLogoUrl from "@assets/Spiral_logo_(1)_1779303755271.png";

export default function Splash() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-screen flex flex-col safe-top bg-gradient-to-b from-[#5FD9B0] via-[#4ECCA3] to-[#3FB893]"
      style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      data-testid="page-splash"
    >
      <div className="flex-1 flex items-center justify-center px-6">
        <img
          src={spiralLogoUrl}
          alt="Spiral"
          className="h-28 w-28 object-contain"
          data-testid="img-splash-logo"
        />
      </div>

      <div className="px-6 space-y-4">
        <button
          type="button"
          onClick={() => setLocation("/login")}
          className="w-full h-14 rounded-2xl bg-white text-[#1A996E] font-black text-base shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover-elevate active-elevate-2"
          data-testid="button-get-started"
        >
          Get Started
        </button>

        <p
          className="text-xs text-white/85 text-center font-medium leading-relaxed px-2"
          data-testid="text-terms"
        >
          By continuing, you agree to our{" "}
          <Link href="/privacy">
            <span className="font-bold underline" data-testid="link-terms">
              Terms of Service
            </span>
          </Link>{" "}
          and{" "}
          <Link href="/privacy">
            <span className="font-bold underline" data-testid="link-privacy">
              Privacy Policy
            </span>
          </Link>
        </p>
      </div>
    </div>
  );
}
