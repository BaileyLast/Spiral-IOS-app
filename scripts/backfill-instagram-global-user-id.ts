import { db } from "../server/db";
import { spiralCustomers } from "../shared/schema";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

const RAPIDAPI_HOST = "instagram-api-fast-reliable-data-scraper.p.rapidapi.com";
const SLEEP_MS = 250;

async function fetchGlobalId(username: string, key: string): Promise<string | null> {
  const clean = username.replace(/^@/, "").trim();
  if (!clean) return null;
  try {
    const res = await fetch(`https://${RAPIDAPI_HOST}/profile?username=${encodeURIComponent(clean)}`, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": RAPIDAPI_HOST },
    });
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for @${clean}`);
      return null;
    }
    const data = (await res.json()) as { pk?: number | string; pk_id?: string };
    return data.pk_id ?? (data.pk != null ? String(data.pk) : null);
  } catch (err) {
    console.error(`  fetch error for @${clean}:`, err);
    return null;
  }
}

async function main() {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    console.error("RAPIDAPI_KEY env var required");
    process.exit(1);
  }

  const targets = await db
    .select({ id: spiralCustomers.id, handle: spiralCustomers.instagramHandle })
    .from(spiralCustomers)
    .where(and(isNotNull(spiralCustomers.instagramHandle), isNull(spiralCustomers.instagramGlobalUserId)));

  console.log(`Backfilling ${targets.length} customer(s) with no instagram_global_user_id`);

  let ok = 0;
  let fail = 0;
  for (const c of targets) {
    if (!c.handle) continue;
    process.stdout.write(`@${c.handle} ... `);
    const pk = await fetchGlobalId(c.handle, key);
    if (pk) {
      await db.update(spiralCustomers).set({ instagramGlobalUserId: pk }).where(eq(spiralCustomers.id, c.id));
      console.log(`pk=${pk}`);
      ok++;
    } else {
      console.log(`SKIP`);
      fail++;
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS));
  }

  console.log(`Done. ${ok} backfilled, ${fail} skipped.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
