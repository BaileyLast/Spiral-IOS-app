import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Ticket,
} from "lucide-react";
import { apiRequest, isUnauthorizedError } from "@/lib/queryClient";
import { useAuthGuard } from "@/hooks/use-auth-guard";

// Shape of POST /api/customer/checkout-code from Spiral Core. The server owns
// all rotation logic: it returns the same code while it's valid (~15 min) and
// silently mints a fresh one once the old one expires or gets used at a
// checkout. We never generate, store, or expire codes client-side — the
// response is always the truth, and by design there is NO countdown timer.
interface CheckoutCodeResponse {
  code: string;
  expiresAt: string;
}

// How often we silently re-fetch while the page stays open, so a code that
// rotates server-side (expiry or use) is replaced without the shopper noticing.
const REFRESH_MS = 45_000;

export default function SpiralCode() {
  const [, setLocation] = useLocation();
  const [copied, setCopied] = useState(false);
  const [howToOpen, setHowToOpen] = useState(false);

  const codeQuery = useQuery<CheckoutCodeResponse>({
    queryKey: ["/api/customer/checkout-code"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/customer/checkout-code");
      return res.json();
    },
    // Always fetch fresh when the page opens, and keep it fresh while open.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: REFRESH_MS,
    // Auth failures shouldn't retry — the guard below redirects to login.
    retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 1,
  });

  // Session expired → same behavior as everywhere else: back to login.
  useAuthGuard(codeQuery.error);

  const code = codeQuery.data?.code;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (older WebViews) — the code is still selectable.
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/home");
    }
  };

  return (
    <div className="min-h-screen-safe bg-warm pb-12">
      <main className="px-6 pt-4">
        <button
          type="button"
          onClick={goBack}
          className="w-11 h-11 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.06)] flex items-center justify-center text-gray-900"
          aria-label="Back"
          data-testid="button-back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mt-6">
          <div className="w-16 h-16 rounded-full bg-[#E6F8F0] flex items-center justify-center text-[#2BAE88] mb-4">
            <Ticket className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-black text-gray-900">Your Spiral Code</h1>
          <p className="text-gray-500 font-medium mt-2 max-w-[280px]">This code will generate your discount at any of our partner stores.</p>
        </div>

        {/* Code card */}
        <div className="mt-8 bg-white rounded-3xl border-2 border-dashed border-[#A8E6CE] px-6 py-10 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-[#2BAE88] font-black mb-3">
            Your code
          </p>
          {code ? (
            <p
              className="text-5xl font-black tracking-[0.1em] text-[#4ECCA3] break-all select-all"
              aria-live="polite"
              data-testid="text-checkout-code"
            >
              {code}
            </p>
          ) : codeQuery.isError ? (
            <div className="space-y-3" data-testid="state-checkout-code-error">
              <p className="text-sm text-gray-500">
                Couldn't load your code. Try again.
              </p>
              <button
                type="button"
                onClick={() => codeQuery.refetch()}
                className="tactile-btn bg-[#4ECCA3] text-white px-6 py-3 text-sm rounded-full"
                data-testid="button-retry-checkout-code"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="flex justify-center py-2" data-testid="state-checkout-code-loading">
              <Loader2 className="w-8 h-8 animate-spin text-[#4ECCA3]" />
            </div>
          )}
        </div>

        {/* Copy button */}
        <button
          type="button"
          onClick={copyCode}
          disabled={!code}
          className="tactile-btn mt-5 w-full py-4 text-base bg-[#4ECCA3] text-white shadow-[0_4px_12px_rgba(78,204,163,0.35),inset_0_-4px_0_rgba(0,0,0,0.08)] flex items-center justify-center gap-2 disabled:opacity-50"
          data-testid="button-copy-code"
        >
          {copied ? (
            <>
              <Check className="w-5 h-5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              <span>Copy code</span>
            </>
          )}
        </button>

        {/* How to use */}
        <div className="mt-4 bg-white rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setHowToOpen((v) => !v)}
            className="w-full flex items-center gap-3 px-5 py-4"
            data-testid="button-how-to-use"
          >
            <Info className="w-5 h-5 text-[#2BAE88] flex-shrink-0" />
            <span className="font-bold text-gray-900 flex-1 text-left">
              How to use your code
            </span>
            {howToOpen ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>
          {howToOpen && (
            <ol className="px-5 pb-5 pt-1 space-y-2 text-sm text-gray-600 font-medium list-decimal list-inside" data-testid="text-how-to-use">
              <li>Shop at any Spiral partner store.</li>
              <li>At checkout, look for the Spiral sign-in.</li>
              <li>Type in this code — that's it, you're signed in.</li>
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}
