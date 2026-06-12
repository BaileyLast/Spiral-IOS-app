import { QueryClient, QueryFunction } from "@tanstack/react-query";

// All API calls target the Spiral Core backend (single source of truth).
// Set VITE_API_BASE_URL to the Core origin (e.g. https://api.joinspiral.app).
// When unset (local dev against a co-located server), calls fall back to the
// current origin so relative URLs keep working.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

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
    const res = await fetch(withApiBase(queryKey.join("/") as string), {
      headers: buildHeaders(),
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
