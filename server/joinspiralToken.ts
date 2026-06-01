import { eq } from "drizzle-orm";
import { db } from "./db";
import { serviceTokens, type ServiceToken } from "@shared/schema";

// The @joinspiral Instagram Login token (IGAA…) is long-lived but expires after
// ~60 days. We persist it in the `service_tokens` table so a background job can
// refresh it and write the renewed value back (an env secret can't be rewritten
// at runtime). All token reads go through getJoinspiralToken().

const TOKEN_NAME = "joinspiral";

// Refresh check cadence and how close to expiry we refresh.
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000; // every 12h
const REFRESH_WHEN_WITHIN_MS = 10 * 24 * 60 * 60 * 1000; // within 10 days of expiry

// Short in-memory cache so hot paths don't hit the DB on every call.
const CACHE_TTL_MS = 60 * 1000;
let cachedToken: string | null = null;
let cacheLoadedAt = 0;

async function loadRow(): Promise<ServiceToken | null> {
  const rows = await db
    .select()
    .from(serviceTokens)
    .where(eq(serviceTokens.name, TOKEN_NAME))
    .limit(1);
  return rows[0] ?? null;
}

// Seed (or re-seed) the stored token from the SPIRAL_INSTAGRAM_ACCESS_TOKEN env
// var. We seed when there's no row yet, or when the stored token is
// expired/unknown AND the env var holds a different (presumably freshly issued)
// value — this lets an operator recover from a fully-lapsed token by updating
// the secret. Once a refresh sets a real expiry, the DB value wins over env.
async function seedFromEnvIfNeeded(
  row: ServiceToken | null,
): Promise<ServiceToken | null> {
  const envToken = process.env.SPIRAL_INSTAGRAM_ACCESS_TOKEN;
  if (!envToken) return row;

  const now = Date.now();
  const storedExpired =
    !row || row.expiresAt == null || new Date(row.expiresAt).getTime() <= now;
  const needsSeed =
    !row || (row.accessToken !== envToken && storedExpired);
  if (!needsSeed) return row;

  const [seeded] = await db
    .insert(serviceTokens)
    .values({ name: TOKEN_NAME, accessToken: envToken, expiresAt: null })
    .onConflictDoUpdate({
      target: serviceTokens.name,
      set: { accessToken: envToken, expiresAt: null, updatedAt: new Date() },
    })
    .returning();
  cachedToken = null;
  console.log(
    "[JOINSPIRAL-TOKEN] Seeded token from SPIRAL_INSTAGRAM_ACCESS_TOKEN env var",
  );
  return seeded ?? row;
}

export async function getJoinspiralToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now - cacheLoadedAt < CACHE_TTL_MS) return cachedToken;

  let row: ServiceToken | null = null;
  try {
    row = await loadRow();
    row = await seedFromEnvIfNeeded(row);
  } catch (err) {
    console.error(
      "[JOINSPIRAL-TOKEN] DB read failed, falling back to env var:",
      err instanceof Error ? err.message : err,
    );
    return process.env.SPIRAL_INSTAGRAM_ACCESS_TOKEN ?? null;
  }

  if (!row) return process.env.SPIRAL_INSTAGRAM_ACCESS_TOKEN ?? null;
  cachedToken = row.accessToken;
  cacheLoadedAt = now;
  return row.accessToken;
}

async function refreshOnce(): Promise<void> {
  let row: ServiceToken | null;
  try {
    row = await loadRow();
    row = await seedFromEnvIfNeeded(row);
  } catch (err) {
    console.error(
      "[JOINSPIRAL-TOKEN] Refresh skipped — DB read failed:",
      err instanceof Error ? err.message : err,
    );
    return;
  }

  if (!row) {
    console.warn(
      "[JOINSPIRAL-TOKEN] No token to refresh — set SPIRAL_INSTAGRAM_ACCESS_TOKEN",
    );
    return;
  }

  const now = Date.now();
  const expiresAt = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
  // If we know the expiry and there's still plenty of life, do nothing.
  if (expiresAt !== null && expiresAt - now > REFRESH_WHEN_WITHIN_MS) return;

  try {
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(row.accessToken)}`,
    );
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };

    if (!res.ok || !data.access_token) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      // Instagram refuses to refresh a token younger than 24h — that's benign
      // and resolves itself on a later run. An expired/invalid token is the
      // critical case that needs an operator to supply a fresh value.
      console.warn(`[JOINSPIRAL-TOKEN] Refresh not applied: ${msg}`);
      return;
    }

    const newExpiresAt = new Date(now + (Number(data.expires_in) || 0) * 1000);
    await db
      .update(serviceTokens)
      .set({
        accessToken: data.access_token,
        expiresAt: newExpiresAt,
        updatedAt: new Date(),
      })
      .where(eq(serviceTokens.name, TOKEN_NAME));
    cachedToken = null;
    console.log(
      `[JOINSPIRAL-TOKEN] Refreshed; valid until ${newExpiresAt.toISOString()}`,
    );
  } catch (err) {
    console.error(
      "[JOINSPIRAL-TOKEN] Refresh error:",
      err instanceof Error ? err.message : err,
    );
  }
}

// Start the background refresh loop. Runs once at boot, then every 12h.
export function startJoinspiralTokenRefresh(): void {
  void refreshOnce();
  setInterval(() => void refreshOnce(), REFRESH_INTERVAL_MS).unref?.();
}
