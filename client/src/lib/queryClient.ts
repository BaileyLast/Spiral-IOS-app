import { QueryClient, QueryFunction } from "@tanstack/react-query";

// All API calls target the Spiral Core backend (single source of truth).
// VITE_API_BASE_URL overrides the target (e.g. to point at a staging Core).
// When unset, we default to the production Core. This matters for the native
// iOS build: it is bundled without env vars, so without a baked-in default the
// app would call its own capacitor://localhost origin (which has no API) and
// every request — including login — would fail.
const DEFAULT_API_BASE_URL = "https://api.joinspiral.app";
// In the Replit web preview (Vite dev) we route API calls through this app's own
// same-origin dev proxy (see server/index.ts) instead of calling Spiral Core
// directly. Cross-origin calls from the preview are blocked by the browser because
// Core sends no CORS headers; a same-origin call sidesteps that. This branch is
// never taken in the native iOS / production build (import.meta.env.DEV is false),
// so that build keeps talking to Core directly via VITE_API_BASE_URL / the default.
const API_BASE_URL = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");

// Hard cap on how long a single request may hang before failing. On mobile a
// request can otherwise stay pending forever on a dropped connection; this
// turns that into a clean, retryable error instead.
const REQUEST_TIMEOUT_MS = 20000;

function requestSignal(): AbortSignal | undefined {
  // AbortSignal.timeout is available on iOS Safari 16+. Guard so older or
  // non-browser environments simply skip the timeout instead of throwing.
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }
  return undefined;
}

// Build a request path from a React Query key by joining its segments with "/".
// Only string/number segments are valid path parts. An object segment almost
// always means a query param or filter was added to the key; joining that would
// silently produce ".../[object Object]", so fail loudly instead.
export function buildPathFromKey(queryKey: readonly unknown[]): string {
  return queryKey
    .map((part) => {
      if (part === null || part === undefined) return "";
      if (typeof part === "object") {
        throw new Error(
          "Query key segments must be strings or numbers to build a URL. " +
            "An object/array segment is not supported — pass a custom queryFn " +
            "and build the URL (with params) explicitly instead.",
        );
      }
      return String(part);
    })
    .filter((part) => part.length > 0)
    .join("/");
}

// Prefix a relative API path with the configured Core base URL. Absolute URLs
// (http/https) are passed through untouched.
export function withApiBase(url: string): string {
  if (!API_BASE_URL) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

const AUTH_TOKEN_KEY = "spiral_auth_token";

let authToken: string | null = null;
try {
  authToken = localStorage.getItem(AUTH_TOKEN_KEY);
} catch {
  authToken = null;
}

// Persist (or clear) the bearer token used to authenticate against the Core.
// Pass null on logout / account deletion.
export function setAuthToken(token: string | null) {
  authToken = token && token.length > 0 ? token : null;
  try {
    if (authToken) {
      localStorage.setItem(AUTH_TOKEN_KEY, authToken);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode); the in-memory token
    // still authenticates this session.
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

function buildHeaders(base: Record<string, string> = {}): Record<string, string> {
  if (authToken) {
    return { ...base, Authorization: `Bearer ${authToken}` };
  }
  return base;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Errors thrown by the fetchers above are prefixed with the HTTP status, e.g.
// "401: Not authenticated". Use this to detect a dead/unauthenticated session.
export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && /^401:/.test(error.message);
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(withApiBase(url), {
    method,
    headers: buildHeaders(data ? { "Content-Type": "application/json" } : {}),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
    signal: requestSignal(),
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(withApiBase(buildPathFromKey(queryKey)), {
      headers: buildHeaders(),
      credentials: "include",
      signal: requestSignal(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Retry transient failures (network drop, timeout, 5xx) a couple of times, but
// never retry an authentication/authorization or other client (4xx) error — the
// "401: ..." / "4xx: ..." prefix comes from throwIfResNotOk above. This keeps a
// dead session surfacing immediately (so the auth guard can redirect) while a
// brief mobile blip recovers on its own.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof Error && /^4\d\d:/.test(error.message)) return false;
  return failureCount < 2;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      // Re-pull from Core when the shopper returns to the app or regains
      // connectivity. Core is the source of truth and statuses (delivery, story
      // verification, discount, soft-ban) change there, so cached screens must
      // refresh instead of showing stale state forever.
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Data is considered fresh for a short window, then re-fetched on the next
      // mount/focus. Previously Infinity, which meant screens never re-pulled.
      staleTime: 30_000,
      retry: shouldRetry,
    },
    mutations: {
      // Do NOT auto-retry writes — a retried POST could double-submit.
      retry: false,
    },
  },
});
