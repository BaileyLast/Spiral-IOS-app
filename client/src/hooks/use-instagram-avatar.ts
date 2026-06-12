import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

// Fetches the customer's Instagram avatar from the Core through apiRequest so
// the bearer token + API base URL are applied (a plain <img src="/api/..."> can
// neither send the token nor reach the cross-origin Core). Returns an object URL
// while loaded; undefined otherwise so the AvatarFallback shows.
export function useInstagramAvatar(enabled: boolean): string | undefined {
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    if (!enabled) {
      setObjectUrl(undefined);
      return;
    }
    let cancelled = false;
    let created: string | undefined;
    (async () => {
      try {
        const res = await apiRequest("GET", "/api/customer/instagram-avatar");
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setObjectUrl(created);
      } catch {
        // Leave undefined so the fallback initial/icon renders.
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [enabled]);

  return objectUrl;
}
