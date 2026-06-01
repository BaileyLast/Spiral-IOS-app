---
name: Publicity scrape needs GLOBAL Instagram id
description: Which IG identifier the RapidAPI story scraper accepts, its response shape, and the dev/prod DB split — for the automated public-story (publicity) check.
---

# Publicity (public-story) check — identifier + response quirks

The automated public-story check (`performPublicityScrape` in `server/routes.ts`)
asks the RapidAPI scraper `instagram-api-fast-reliable-data-scraper.p.rapidapi.com`
whether a shopper's Story is publicly visible. Getting the identifier wrong silently
fails EVERY real story as `not_public`, which soft-bans the shopper.

**Rule:** query stories by the shopper's **global numeric IG id**
(`spiral_customers.instagramGlobalUserId`), NOT the app-scoped messaging-webhook id
and NOT the `asset_id` from the Story CDN URL.

**Why (verified live, shopper @baileylast global id 2028598998):**
- `/story?id=<asset_id>` → 404 always. The webhook URL's `asset_id` is NOT the story
  media pk; there's no way to correlate asset_id → pk, so this path is unusable.
- `/stories?user_id=<app-scoped id>` → 400 "invalid target user".
- `/stories?user_id=<GLOBAL id>` → 200 with the real story (matching `taken_at`).

**Response shape gotcha:** `/stories` returns a **bare top-level JSON array** of story
items, not a wrapped `{items:[...]}` object. `extractStoryItems` must handle arrays.

**How to apply:** confirm a public story exists via the `/stories` list filtered to the
original webhook's time window (`taken_at` within `PUBLICITY_CHECK_TIMESTAMP_TOLERANCE_MS`).
Treat 404 as `not_public`; treat any other non-OK (rate limit / transient / bad id) as a
retryable `error`, never an immediate `not_public` soft-ban. The worker looks up the
customer by `check.customerId` at scrape time to get the global id (no schema change).

**Env fact:** DEV and PROD use SEPARATE databases. A prod-only stuck order/customer
won't appear in the dev DB, and store_settings (IGAA token, biz id, spiral_enabled)
must be configured per-environment.
