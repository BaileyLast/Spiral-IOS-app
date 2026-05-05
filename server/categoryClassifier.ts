import { load as loadHtml } from "cheerio";
import OpenAI from "openai";
import { db } from "./db";
import { brandCategories } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  BRAND_CATEGORIES,
  isValidBrandCategory,
  type BrandCategory,
} from "@shared/categories";

const FETCH_TIMEOUT_MS = 8000;
const PRODUCT_LIMIT = 10;
const COLLECTION_LIMIT = 25;
const STALE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 24 * 60 * 60 * 1000;

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function normalizeStorefrontUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    u.search = "";
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    u.host = u.host.toLowerCase();
    return u.origin;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "SpiralBot/1.0 (+https://joinspiral.app)",
        Accept: "text/html,application/json",
        ...(init?.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

interface BrandSignals {
  homepageTitle: string;
  metaDescription: string;
  h1: string;
  collectionNames: string[];
  productTypes: string[];
  productNames: string[];
  tags: string[];
}

async function fetchProducts(origin: string): Promise<Pick<BrandSignals, "productNames" | "productTypes" | "tags">> {
  try {
    const res = await fetchWithTimeout(`${origin}/products.json?limit=${PRODUCT_LIMIT}`);
    if (!res.ok) return { productNames: [], productTypes: [], tags: [] };
    const json = (await res.json()) as { products?: Array<{ title?: string; product_type?: string; tags?: string[] | string }> };
    const products = Array.isArray(json.products) ? json.products : [];
    const names = products.map((p) => (p.title ?? "").trim()).filter(Boolean).slice(0, PRODUCT_LIMIT);
    const types = Array.from(
      new Set(products.map((p) => (p.product_type ?? "").trim()).filter(Boolean)),
    ).slice(0, 10);
    const tagSet = new Map<string, number>();
    for (const p of products) {
      const tagList = Array.isArray(p.tags)
        ? p.tags
        : typeof p.tags === "string"
          ? p.tags.split(",")
          : [];
      for (const tag of tagList) {
        const t = tag.trim();
        if (!t) continue;
        tagSet.set(t, (tagSet.get(t) ?? 0) + 1);
      }
    }
    const tags = Array.from(tagSet.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);
    return { productNames: names, productTypes: types, tags };
  } catch {
    return { productNames: [], productTypes: [], tags: [] };
  }
}

async function fetchCollections(origin: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${origin}/collections.json?limit=${COLLECTION_LIMIT}`);
    if (!res.ok) return [];
    const json = (await res.json()) as { collections?: Array<{ title?: string }> };
    const collections = Array.isArray(json.collections) ? json.collections : [];
    return collections
      .map((c) => (c.title ?? "").trim())
      .filter((title) => title && title.toLowerCase() !== "frontpage" && title.toLowerCase() !== "home page")
      .slice(0, COLLECTION_LIMIT);
  } catch {
    return [];
  }
}

async function fetchHomepage(origin: string): Promise<Pick<BrandSignals, "homepageTitle" | "metaDescription" | "h1">> {
  try {
    const res = await fetchWithTimeout(origin);
    if (!res.ok) return { homepageTitle: "", metaDescription: "", h1: "" };
    const html = await res.text();
    const $ = loadHtml(html);
    return {
      homepageTitle: ($("title").first().text() || "").trim().slice(0, 200),
      metaDescription: ($('meta[name="description"]').attr("content") || "").trim().slice(0, 300),
      h1: ($("h1").first().text() || "").trim().slice(0, 200),
    };
  } catch {
    return { homepageTitle: "", metaDescription: "", h1: "" };
  }
}

export async function gatherBrandSignals(storefrontUrl: string): Promise<BrandSignals | null> {
  const origin = normalizeStorefrontUrl(storefrontUrl);
  if (!origin) return null;
  const [products, collectionNames, homepage] = await Promise.all([
    fetchProducts(origin),
    fetchCollections(origin),
    fetchHomepage(origin),
  ]);
  const hasAnySignal =
    products.productNames.length > 0 ||
    collectionNames.length > 0 ||
    homepage.homepageTitle.length > 0 ||
    homepage.metaDescription.length > 0;
  if (!hasAnySignal) return null;
  return { ...homepage, ...products, collectionNames };
}

interface ClassificationResult {
  primary: BrandCategory;
  secondary: BrandCategory[];
}

function buildPrompt(signals: BrandSignals): string {
  const list = (arr: string[]) => (arr.length ? arr.join(", ") : "(none)");
  return [
    "You are classifying an e-commerce brand into Spiral marketplace categories.",
    "",
    "Allowed categories (you MUST pick from this list exactly — do not invent new ones):",
    BRAND_CATEGORIES.join(", "),
    "",
    "Brand signals:",
    `- Homepage title: "${signals.homepageTitle}"`,
    `- Homepage meta description: "${signals.metaDescription}"`,
    `- Homepage H1: "${signals.h1}"`,
    `- Collection names: ${list(signals.collectionNames)}`,
    `- Product types: ${list(signals.productTypes)}`,
    `- Top product names: ${list(signals.productNames)}`,
    `- Top tags: ${list(signals.tags)}`,
    "",
    "Rules:",
    "- Pick ONE primary category that covers the majority of the catalogue.",
    "- Pick up to 2 secondary categories ONLY if they each represent at least ~20% of the catalogue. If the brand is single-category, return an empty array for secondary.",
    '- Never return "Other". If the brand truly does not fit any category, pick the closest match.',
    "",
    'Return JSON in exactly this shape: { "primary": "Category Name", "secondary": ["Category Name", "Category Name"] }',
  ].join("\n");
}

export async function classifyBrandWithLLM(signals: BrandSignals): Promise<ClassificationResult | null> {
  const client = getOpenAI();
  if (!client) {
    throw new Error("OPENAI_API_KEY not configured");
  }
  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 150,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: buildPrompt(signals) }],
  });
  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const primaryRaw = (parsed as Record<string, unknown>).primary;
  const secondaryRaw = (parsed as Record<string, unknown>).secondary;
  if (!isValidBrandCategory(primaryRaw)) return null;
  const secondary: BrandCategory[] = [];
  if (Array.isArray(secondaryRaw)) {
    for (const s of secondaryRaw) {
      if (isValidBrandCategory(s) && s !== primaryRaw && !secondary.includes(s)) {
        secondary.push(s);
      }
      if (secondary.length >= 2) break;
    }
  }
  return { primary: primaryRaw, secondary };
}

export async function classifyAndStore(storefrontUrl: string): Promise<void> {
  const origin = normalizeStorefrontUrl(storefrontUrl);
  if (!origin) return;
  const now = new Date();
  try {
    const signals = await gatherBrandSignals(origin);
    if (!signals) {
      await upsertCategory(origin, null, [], "no_signals", now);
      return;
    }
    const result = await classifyBrandWithLLM(signals);
    if (!result) {
      await upsertCategory(origin, null, [], "llm_invalid_response", now);
      return;
    }
    await upsertCategory(origin, result.primary, result.secondary, null, now);
    console.log(`[classifier] ${origin} → ${result.primary}${result.secondary.length ? ` (+${result.secondary.join(", ")})` : ""}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[classifier] Failed to classify ${origin}:`, message);
    await upsertCategory(origin, null, [], message.slice(0, 500), now);
  }
}

async function upsertCategory(
  storefrontUrl: string,
  primary: BrandCategory | null,
  secondary: BrandCategory[],
  lastError: string | null,
  attemptedAt: Date,
): Promise<void> {
  await db
    .insert(brandCategories)
    .values({
      storefrontUrl,
      primaryCategory: primary,
      secondaryCategories: secondary,
      classifiedAt: primary ? attemptedAt : null,
      lastError,
      lastAttemptAt: attemptedAt,
    })
    .onConflictDoUpdate({
      target: brandCategories.storefrontUrl,
      set: {
        primaryCategory: primary,
        secondaryCategories: secondary,
        classifiedAt: primary ? attemptedAt : undefined,
        lastError,
        lastAttemptAt: attemptedAt,
      },
    });
}

export async function getCachedCategories(): Promise<Map<string, { primary: string | null; secondary: string[] }>> {
  const rows = await db.select().from(brandCategories);
  const map = new Map<string, { primary: string | null; secondary: string[] }>();
  for (const row of rows) {
    map.set(row.storefrontUrl, {
      primary: row.primaryCategory,
      secondary: row.secondaryCategories ?? [],
    });
  }
  return map;
}

function shouldClassify(row: typeof brandCategories.$inferSelect | undefined, now: number): boolean {
  if (!row) return true;
  if (row.classifiedAt) {
    return now - row.classifiedAt.getTime() > STALE_AFTER_MS;
  }
  if (row.lastAttemptAt) {
    return now - row.lastAttemptAt.getTime() > RETRY_AFTER_FAIL_MS;
  }
  return true;
}

export async function runClassificationCycle(storefrontUrls: string[]): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.log("[classifier] Skipping cycle — OPENAI_API_KEY not set");
    return;
  }
  const existing = await db.select().from(brandCategories);
  const byUrl = new Map(existing.map((r) => [r.storefrontUrl, r] as const));
  const now = Date.now();
  const todo: string[] = [];
  for (const raw of storefrontUrls) {
    const origin = normalizeStorefrontUrl(raw);
    if (!origin) continue;
    if (shouldClassify(byUrl.get(origin), now)) {
      todo.push(origin);
    }
  }
  if (todo.length === 0) return;
  console.log(`[classifier] Cycle starting — ${todo.length} brand(s) to classify`);
  for (const origin of todo) {
    await classifyAndStore(origin);
  }
  console.log(`[classifier] Cycle complete`);
}
