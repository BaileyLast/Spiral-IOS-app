import type { StoreSettings } from "@shared/schema";

const DASHBOARD_URL =
  process.env.SPIRAL_MERCHANT_DASHBOARD_URL ||
  "https://spiral-merchant-dashboard.replit.app";
const TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

export interface ShopifyCredentials {
  shopDomain: string;
  accessToken: string;
  storeName: string | null;
  storeLogoUrl: string | null;
}

type CacheEntry = { value: ShopifyCredentials | null; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(opts: {
  shopDomain?: string | null;
  instagramBusinessAccountId?: string | null;
}): string {
  const d = (opts.shopDomain || "").toLowerCase();
  const ig = opts.instagramBusinessAccountId || "";
  return `d=${d}|ig=${ig}`;
}

export function invalidateShopifyCredentialsCache(): void {
  cache.clear();
}

export async function getShopifyCredentials(
  opts: {
    shopDomain?: string | null;
    instagramBusinessAccountId?: string | null;
  } = {},
): Promise<ShopifyCredentials | null> {
  const key = cacheKey(opts);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const internalKey = process.env.SPIRAL_INTERNAL_KEY;
  if (!internalKey) {
    console.warn(
      "[shopify-credentials] SPIRAL_INTERNAL_KEY missing — cannot fetch credentials from dashboard",
    );
    return null;
  }

  const params = new URLSearchParams();
  if (opts.shopDomain) params.set("shop", opts.shopDomain);
  if (opts.instagramBusinessAccountId)
    params.set("instagramBusinessAccountId", opts.instagramBusinessAccountId);
  const qs = params.toString();
  const url = `${DASHBOARD_URL}/api/internal/shopify/credentials${qs ? "?" + qs : ""}`;

  // `cacheMiss` is set to true ONLY for a confirmed-not-connected response
  // (HTTP 404) or a successful 2xx response. Transient failures (timeouts,
  // 5xx, 401, malformed JSON, missing fields) intentionally do NOT poison
  // the cache — otherwise a brief dashboard hiccup would shadow every
  // Shopify-dependent code path for the next 5 minutes.
  let value: ShopifyCredentials | null = null;
  let cacheable = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { "x-spiral-internal-key": internalKey },
      signal: controller.signal,
    });
    if (r.ok) {
      try {
        const data = (await r.json()) as Partial<ShopifyCredentials>;
        if (data?.shopDomain && data?.accessToken) {
          value = {
            shopDomain: data.shopDomain,
            accessToken: data.accessToken,
            storeName: data.storeName ?? null,
            storeLogoUrl: data.storeLogoUrl ?? null,
          };
          cacheable = true;
        } else {
          console.warn(
            `[shopify-credentials] dashboard 200 but payload missing shopDomain/accessToken (not caching)`,
          );
        }
      } catch (parseErr) {
        console.warn(
          "[shopify-credentials] dashboard returned non-JSON 2xx (not caching):",
          parseErr,
        );
      }
    } else if (r.status === 404) {
      // Confirmed-not-connected. Negative-cache so we don't hammer.
      cacheable = true;
    } else {
      console.warn(
        `[shopify-credentials] dashboard returned ${r.status} for ${url} (not caching)`,
      );
    }
  } catch (err) {
    console.warn("[shopify-credentials] fetch failed (not caching):", err);
  } finally {
    clearTimeout(timer);
  }

  if (cacheable) {
    cache.set(key, { value, expiresAt: now + TTL_MS });
  }
  return value;
}

// Convenience for routes that already have a settings row in hand.
export async function getShopifyCredentialsForSettings(
  settings:
    | Pick<StoreSettings, "shopDomain" | "instagramBusinessAccountId">
    | null
    | undefined,
): Promise<ShopifyCredentials | null> {
  if (!settings) return getShopifyCredentials({});
  return getShopifyCredentials({
    shopDomain: settings.shopDomain,
    instagramBusinessAccountId: settings.instagramBusinessAccountId,
  });
}

// Prewarm the cache at boot so the first Shopify-dependent webhook request
// doesn't pay the cold-fetch latency. We load the store_settings row first
// so the prewarm uses the SAME cache key the hot paths will use — calling
// the helper with no params produces a different key and warms nothing
// useful.
export async function prewarmShopifyCredentials(): Promise<void> {
  try {
    const { storage } = await import("./storage");
    const settings = await storage.getStoreSettings();
    const creds = await getShopifyCredentialsForSettings(settings);
    if (creds) {
      console.log(
        `[shopify-credentials] prewarmed for ${creds.shopDomain} (cached ${TTL_MS / 1000}s)`,
      );
    } else {
      console.log(
        "[shopify-credentials] prewarm: dashboard returned no credentials (yet)",
      );
    }
  } catch (err) {
    console.warn("[shopify-credentials] prewarm failed:", err);
  }
}
