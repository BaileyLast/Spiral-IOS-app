import { useState, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import HomeInstagramConnect from "@/components/HomeInstagramConnect";

// DEV-ONLY preview so the pending-code Home card can be viewed in the Replit web
// preview, where the real Spiral Core backend is unreachable (CORS). It seeds the
// React Query cache with a fake pending code so no network calls are needed. This
// route is gated behind import.meta.env.DEV in App.tsx and never ships to prod.
export default function PreviewCodeCard() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    queryClient.setQueryData(["/api/customer/spiral-code"], {
      code: "SPRL-4827",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      status: "pending",
    });
    queryClient.setQueryData(["/api/customer/spiral-code/status"], {
      status: "pending",
    });
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="min-h-screen-safe bg-warm pb-12">
      <main className="px-6 pt-10 space-y-6">
        <HomeInstagramConnect />
      </main>
    </div>
  );
}
