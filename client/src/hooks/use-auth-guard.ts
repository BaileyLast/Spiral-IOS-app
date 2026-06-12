import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { isUnauthorizedError, setAuthToken } from "@/lib/queryClient";

// Redirects to /login whenever a signed-in query reports an unauthenticated
// session (HTTP 401). Without this, a dead session leaves the app rendering its
// signed-in shell with empty/cached data — e.g. the "on hold" banner showing
// from login-time state while orders silently fail to load ("No orders yet").
// Pass the error(s) from the page's protected queries (me, orders, stats).
export function useAuthGuard(...errors: unknown[]) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const unauthorized = errors.some(isUnauthorizedError);

  useEffect(() => {
    if (!unauthorized) return;
    setAuthToken(null);
    localStorage.removeItem("spiral_customer");
    queryClient.clear();
    setLocation("/login");
  }, [unauthorized, queryClient, setLocation]);

  return unauthorized;
}
