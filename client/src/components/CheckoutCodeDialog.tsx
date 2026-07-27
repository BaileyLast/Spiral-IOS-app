import { useQuery } from "@tanstack/react-query";
import { Loader2, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

// How often we silently re-fetch while the popup stays open, so a code that
// rotates server-side (expiry or use) is replaced without the shopper noticing.
const REFRESH_MS = 45_000;

interface CheckoutCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CheckoutCodeDialog({ open, onOpenChange }: CheckoutCodeDialogProps) {
  const codeQuery = useQuery<CheckoutCodeResponse>({
    queryKey: ["/api/customer/checkout-code"],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/customer/checkout-code");
      return res.json();
    },
    enabled: open,
    // Always fetch fresh when the popup opens, and keep it fresh while open.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: open ? REFRESH_MS : false,
    // Auth failures shouldn't retry — the guard below redirects to login.
    retry: (failureCount, error) => !isUnauthorizedError(error) && failureCount < 1,
  });

  // Session expired → same behavior as everywhere else: back to login.
  useAuthGuard(codeQuery.error);

  const code = codeQuery.data?.code;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px] rounded-3xl p-6 text-center">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#E6F8F0] flex items-center justify-center mb-1">
            <KeyRound className="w-6 h-6 text-[#2BAE88]" />
          </div>
          <DialogTitle className="text-gray-900">Your Spiral Code</DialogTitle>
          <DialogDescription className="text-gray-500">
            Type this code into a partner store's checkout to sign in — no email
            or password needed.
          </DialogDescription>
        </DialogHeader>

        {code ? (
          <p
            className="text-5xl font-black tracking-[0.25em] text-gray-900 py-4 select-all"
            aria-live="polite"
            data-testid="text-checkout-code"
          >
            {code}
          </p>
        ) : codeQuery.isError ? (
          <div className="py-4 space-y-3" data-testid="state-checkout-code-error">
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
          <div className="py-6 flex justify-center" data-testid="state-checkout-code-loading">
            <Loader2 className="w-7 h-7 animate-spin text-[#4ECCA3]" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
