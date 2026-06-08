# Spiral Customer App

## Overview

Spiral lets shoppers earn an instant checkout discount in exchange for posting one Instagram Story after delivery. This repo is the iOS customer app + the **single source of truth** for Spiral identity, customer state, verifications, discount eligibility, soft-ban, tier config, and push. The merchant dashboard and any future ecomm adapters call our `/api/internal/*` surface instead of duplicating state.

## User Preferences

Simple, everyday language. No emojis.

## Server & Deployment

- Listener: `Number(process.env.PORT) || 3000`. Dev workflow sets `PORT=5000`.
- Deployment target: Reserved VM. Prod commands: `npm run build` then `npm run start`.
- `/health` returns `ok` (200). Requests logged with `[INCOMING]` prefix.

## Stack

- **Frontend**: React 18 + TypeScript + Vite, shadcn/ui + Tailwind. Mobile-first, single-column. HSL CSS variables, branded green/teal. Bottom nav: Home / Marketplace / Discounts / Profile. React Query for server state, localStorage for session.
- **Backend**: Express + Drizzle ORM + Neon serverless Postgres. TypeScript strict, ESNext.
- **Build**: Vite (client), esbuild (server prod), tsx (dev).

## Data Models (`shared/schema.ts`)

- `store_settings` — Instagram OAuth, store config, webhook health (single row; single-tenant today). **Shopify `shopDomain` + `accessToken` are owned by the merchant dashboard** and fetched live via `server/shopifyCredentials.ts` (see "Shopify Credentials" below). The columns exist in the schema as legacy/fallback only and may be NULL here.
- `discount_tiers` — Follower ranges → discount %. Written by merchant dashboard, read by this repo.
- `verifications` — Story post verification records with webhook metadata.
- `spiral_customers` — Customer accounts + Instagram identity.
- `orders` — Order tracking with discount + verification status. Keeps IG identity columns so deletion-safe lookups still work.
- `merchant_scoped_user_map` — Caches scoped IG sender id → customer (positive AND negative cache; see Story Verification).
- `spiral_codes` — DM-based IG verification codes.
- `service_tokens` — Runtime-rotatable service tokens (key `joinspiral` holds the @joinspiral Instagram Login token + `expires_at`). Seeded from `SPIRAL_INSTAGRAM_ACCESS_TOKEN`, then auto-refreshed (see "@joinspiral Token Auto-Refresh").

## Pages

| Path | Purpose |
|---|---|
| `/` | Welcome / value prop |
| `/login` | Email/password (signup toggle) |
| `/connect-instagram` | IG connect to verify follower count |
| `/home` | Stats, pending actions, recent orders |
| `/marketplace` | Browse participating brands |
| `/discounts` | All orders with status badges |
| `/orders/:id` | Progress timeline, discount, posting instructions |
| `/profile` | Account info, IG status, settings, logout |
| `/manage-account` | IG disconnect + editable account info |

## API

### Customer (session-gated)
- `POST /api/customer/signup` · `POST /api/customer/login` · `POST /api/customer/logout` · `GET /api/customer/me`
- `POST /api/customer/spiral-code` · `GET /api/customer/spiral-code/status` · `POST /api/customer/spiral-code/regenerate`
- `POST /api/customer/disconnect-instagram` · `PATCH /api/customer/profile`
- `GET /api/customer/orders` · `GET /api/customer/orders/:id` · `GET /api/customer/stats`
- `POST /api/customer/orders/:id/mark-received` (alias `/mark-collected`)
- `POST /api/customer/push-token` — `{ token: string | null }`, call on launch + on logout (null)

### Checkout (public, used by Shopify widget)
- `POST /api/checkout/authenticate` — login; response includes soft-ban payload (see below).
- `POST /api/checkout/calculate-discount` — pay-now eligibility + tier match. Also includes soft-ban safety net.
- `POST /api/checkout/confirm-discount` — record discount applied to a placed order.
- `POST /api/checkout/estimate-discount` — pre-login estimate by IG handle.

### Universal Core API (`/api/internal/*`, server-to-server)

All routes gated by `requireInternalKey` (header `x-spiral-internal-key`). Used by the merchant dashboard and future Woo/BigCommerce adapters. **Callers MUST NOT cache negative identity results locally** — every call is a single indexed lookup on cache hits, and stale local caches will shadow our self-healing path at signup/DM-verify.

| Endpoint | Purpose |
|---|---|
| `POST /identity/resolve` | `{merchantInstagramBusinessId, senderScopedId}` → Spiral identity (or confirmed non-Spiral). Same logic as the story-mention webhook (`resolveScopedSender` helper). |
| `GET /customers/by-instagram?handle=&userId=&globalUserId=` | Find Spiral customers by IG identity. Returns array (siblings can share a handle). |
| `POST /customers/lookup-by-handle` | `{instagramHandle}` → `{isSpiral:true, customerId}` if a Spiral shopper owns that handle, else `{isSpiral:false}`. Case-insensitive, tolerates leading `@`. Miss = 200 (never 404). Hot path for the merchant dashboard product-page teaser (Login vs Join). |
| `GET /identity/:globalUserId/verifications?fallbackUserId=` | Story history for an IG identity. Survives customer deletion. Pass `_` for the path param if only fallback id is known. |
| `POST /discount/calculate` | `{customerId}` → eligibility + tier match (mirrors `/api/checkout/calculate-discount`, sans soft-ban gate). Backed by `calculateDiscountForCustomer`. |
| `GET /customers/:customerId/soft-ban-status` | Read-through soft-ban evaluator (`evaluateSoftBanForCheckout`). Self-heals stale state. |
| `GET /merchants/:merchantInstagramBusinessId/discount-tiers` | Tier config + `spiralEnabled` + `minFollowers`. |
| `POST /push/send` | `{customerId, kind, brandName?}`; `kind ∈ {delivery-reminder, quick-fail, final-fail}`. Copy is fixed per kind. Reminders/failures only — successes are in-app. |
| `POST /orders/:id/mark-delivered` | Transition order → delivered, fire reminder push. |
| `POST /stories/invalidate` | `{verificationId?, instagramHandle, shopDomain?}` — admin rejected a flagged Story. Resets the shopper's most-recent posted order to pre-post (verification → `pending`, Story artifacts cleared, in-flight publicity check cancelled), then re-runs `evaluateSoftBanForCheckout` so the now-owed order **re-bans via the derived model** (no manual ban). Lookup key = `instagramHandle` (caller's DB is separate; `verificationId` opaque/log-only, `shopDomain` advisory). Idempotent — already-reset = logged no-op, always returns `{success:true}`. **Known limitation:** handles are mutable, so a rename between post and reject can miss the lookup (logged warning); future fix is for the caller to send the global IG id. |
| `POST /shopify/backfill-webhooks` | Re-register Shopify webhook topics for an already-connected store. Reads credentials from the dashboard via `getShopifyCredentialsForSettings`. |
| `POST /merchants/register` · `PATCH /customers/:id` | Existing merchant/customer admin hooks. |

### Webhooks
- `GET/POST /webhooks/instagram-dm` — DMs to @joinspiral (spiral-code verification) + story_mention events.
- `GET/POST /webhooks/instagram` — Story mentions on merchant's connected IG.
- `/webhooks/shopify/orders-create` · `/fulfillments-create` · `/fulfillments-update` · `/fulfillment-events-create` — registered automatically during Shopify OAuth.

## Shopify Credentials

The customer app does **not** run its own Shopify OAuth and does **not** store a Shopify access token. The merchant connects Shopify once on the merchant dashboard; the customer app reads the live `shopDomain` + `accessToken` from the dashboard's internal API.

- Helper: `server/shopifyCredentials.ts` exposes `getShopifyCredentials({shopDomain?, instagramBusinessAccountId?})` and `getShopifyCredentialsForSettings(settings)`. 5-minute in-memory cache; 5-second fetch timeout; misses (404) are negative-cached. `prewarmShopifyCredentials()` runs once at boot from `server/index.ts` to warm the cache.
- Dashboard contract (must be implemented on `spiral-merchant-dashboard.replit.app`):
  - `GET /api/internal/shopify/credentials?shop=<domain>&instagramBusinessAccountId=<id>`
  - Auth: `x-spiral-internal-key` header (shared `SPIRAL_INTERNAL_KEY` secret).
  - 200 response: `{ shopDomain: string, accessToken: string, storeName: string | null, storeLogoUrl: string | null }`. Either query param may identify the merchant; pass through whichever the caller has.
  - 404 if no merchant matches. Caller treats 404 as "not connected (yet)".
- Override base URL with `SPIRAL_MERCHANT_DASHBOARD_URL` (defaults to `https://spiral-merchant-dashboard.replit.app`).
- Retired in this repo: `GET /auth/shopify` and `GET /shopify/callback` now return `410 Gone`. The customer app must never initiate its own Shopify install — doing so creates a second app installation, wipes the dashboard's token, and breaks product images + delivery tracking.
- All sites that read Shopify credentials use the helper: `/api/shopify/sync`, the `orders/create` webhook (product images + store logo + shop-domain backfill), `/api/internal/shopify/backfill-webhooks`. The columns `store_settings.shopDomain` / `store_settings.accessToken` are kept in the schema as legacy/fallback only and may be NULL.

## Instagram Integration

### Account Verification (DM-based)
Shoppers link Instagram **only** through this DM spiral-code flow. There is no shopper Instagram OAuth (the old `/api/customer/instagram/auth` + `/callback` routes were dead code and have been removed).
1. Customer gets a 6-char code (24h expiry).
2. Customer DMs the code to @joinspiral.
3. Webhook extracts IG user id from sender metadata, matches the code, links IG to the Spiral customer.

Follower count: **RapidAPI** (Instagram API - Fast & Reliable Data Scraper).

### Story Verification (Automated)
1. Customer posts an IG Story tagging the merchant.
2. `story_mention` event hits our webhook.
3. `resolveScopedSender(settings, senderScopedId)` resolves the sender:
   - **Positive cache hit** → return customer, touch `lastSeenAt`.
   - **Negative cache hit** → exit early (no Profile API call).
   - **Miss** → IG Profile API (username) + RapidAPI (global numeric pk) → match against Spiral customers by handle → write positive mapping OR negative-cache row.
   - **Transient failure** (no token / Profile API down) → return `unresolvable`, **do not** negative-cache.
4. Matches resolved customer to their pending order(s) and verifies.
5. Backend matching uses immutable `instagramUserId`. `instagramHandle` is display-only and auto-refreshed when IG reports a new username for the same scoped id.
6. **Self-healing**: when a Spiral customer DM-verifies, any stale negative-cache rows for their IG identity are cleared (`server/routes.ts:3361`).

### Dashboard story-mention forward
Every story_mention at `/webhooks/instagram-dm` is forwarded fire-and-forget to `POST https://spiral-merchant-dashboard.replit.app/api/instagram/story-mention` (header `x-spiral-internal-key`, 3s timeout, `[STORY-FORWARD]` prefix). DM verification-code messages are not forwarded.
- Each messaging entry resolved to a Spiral customer is annotated inline with the shopper's real global `instagramUserId` (Meta's `sender.id` is a per-app IGSID, not the global id), so the dashboard matches without re-hitting the Graph API. Unresolved entries ship un-annotated; dashboard falls back to its own lookup.
- The payload also carries the matched merchant's `shopDomain` + `instagramBusinessAccountId` (top-level, alongside `messaging`) so the dashboard identifies the merchant without app-scoped↔global id conversion. Both are populated only after the merchant guard passes (a Story tagging a different known account never names this merchant); blank values omitted.
- These fields persist on the retry-queue payload, so retried forwards include them too.

### OAuth scopes
`instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`. After merchant connects, we subscribe to `messages` + `messaging_postbacks` on the FB Page.

### Meta App
- **One Meta app, with a nested Instagram ID** (NOT two separate apps). Top-level is the **Spiral app** (`1348945556722394`); adding the Instagram product generated a child "Instagram App ID" (`1150430890573369`, stored in `INSTAGRAM_APP_ID`) that lives *inside* it — a sub-identity of the Spiral app, not an independent app, and legacy/unused by current code.
- **Spiral app** (ID `1348945556722394`, name "Spiral") — Business type, "Facebook Login for Business". Owns the Instagram webhook and @joinspiral token generation. Webhook lives at `/webhooks/instagram-dm` (verify token `spiral_verify_token`); `story_mention` events arrive here, we verify the matching order, and forward each event to the dashboard (see "Dashboard story-mention forward").
- Incoming webhook signatures are validated with **this app's secret, stored as `FACEBOOK_APP_SECRET`**. The handlers prefer `FACEBOOK_APP_SECRET` and fall back to the legacy `INSTAGRAM_APP_SECRET` only if it is unset. If neither is set, signature checks are skipped (dev only); a wrong secret rejects real webhooks with 403.

### @joinspiral Token Auto-Refresh
- The @joinspiral Instagram Login token (`IGAA…`) is **long-lived but NOT permanent** — it expires ~60 days after issue; if it lapses, DM code verification and story-sender lookups silently break.
- Stored in the `service_tokens` table (key `joinspiral`), not just the env secret, so the running app can rotate it (an env secret can't be rewritten at runtime).
- Helpers in `server/joinspiralToken.ts`:
  - `getJoinspiralToken()` — DB-first read with a 60s in-memory cache; seeds from `SPIRAL_INSTAGRAM_ACCESS_TOKEN` on first boot; re-seeds from the env var if the stored token is expired/unknown and the env value differs (operator recovery). All reads go through this (`/api/admin/resubscribe-webhooks`, story-sender lookup, `sendInstagramDM`) — no code reads the env var directly.
  - `startJoinspiralTokenRefresh()` — runs at boot (`server/index.ts`) and every 12h; calls `graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` when within 10 days of expiry (or expiry unknown) and writes the new token + `expires_at` back.
  - `markJoinspiralTokenInvalid()` — **self-heal on rejection:** a live IG call hitting an auth error (OAuthException / code 190 / "session has expired") flags the stored token expired and kicks an immediate reseed+refresh, closing the revoked-but-not-yet-expired gap. Fires only on genuine auth errors (not transient/network blips), so a healthy token is never clobbered by a stale env value.
- **Full-lapse recovery** (app offline > ~60 days): generate a fresh token in the Meta dashboard, update `SPIRAL_INSTAGRAM_ACCESS_TOKEN`, restart — the helper re-seeds. Instagram refuses to refresh a token younger than 24h; logged as benign, resolves on a later run.

## Order Lifecycle

1. **Ordered** — placed, awaiting fulfillment.
2. **Fulfilled/Shipped** — `orders.shopifyTrackingStatus` mirrors raw Shopify `shipment_status` from every `fulfillment_events/create` + `fulfillments/update` webhook.
3. **Delivered** — triggers "Post Your Story" prompt. Reached via, in order of preference:
   - `fulfillment_events/create` with `status=delivered` (carrier-tracked).
   - `fulfillments/update` with `shipment_status=delivered` (backup).
   - Customer taps "I've received this order" → `POST /api/customer/orders/:id/mark-received` (gate: must be `fulfilled` and not yet `delivered`).
   - Background fallback (`runDeliveryFallbackJob`, every 30 min): 24h after first `ready_for_pickup` → auto-collected; 7d after `fulfilled` with no tracking event → auto-delivered.
4. **Verified** — Story mention webhook fired, discount confirmed.

All paths funnel into the idempotent `transitionOrderToDelivered` helper.

## Verification Lifecycle

| State | Meaning | Future discount |
|---|---|---|
| `pending` | Order placed/delivered, awaiting Story | Locked |
| `awaiting_review` | Story mention received, quick check pending (~3 min) | Locked |
| `quick_verified` | Quick check passed (Story is public) | **Unlocked**; awaiting 10h final check |
| `verified` | Final check passed | **Unlocked** |
| `not_public` | Quick fail (Close Friends or deleted) | Locked until repost |
| `taken_down_early` | Final fail (Story disappeared <24h) | Locked until repost |

## Soft-Ban Model

- Persisted on `spiral_customers`: `accountStatus` (`active` | `soft_banned`), `softBannedReason`, `softBannedAt`.
- **Owed** = (a) delivered order in `pending`/`awaiting_review`/`not_public`, OR (b) any order in `taken_down_early` regardless of delivery (final-fail debt is delivery-independent; quick-fail debt only counts post-delivery).
- **Anchored to Instagram identity, not email** — debt follows the IG account (`instagramGlobalUserId` OR `instagramUserId`) across every Spiral customer linked to that profile. Evaluated at: (1) DM-verify time (sibling sweep, reason `inherited_from_instagram`); (2) checkout (union of own-owed + sibling-IG-owed).
- Reasons: `delivery_pending`, `not_public`, `taken_down_early`, `inherited_from_instagram`.
- `maybeAutoUnbanCustomer` clears when zero own-owed AND zero sibling-IG-owed. Cascades: clearing one account re-evaluates all siblings.
- Shared evaluator `evaluateSoftBanForCheckout(customerId)` self-heals in both directions and returns `{softBanned, softBannedReason, pendingVerificationCount, brandName, owedOrderId, message}`. Used by:
  1. `POST /api/checkout/authenticate` — login succeeds; widget renders on-hold screen on first paint, CTA → `https://spiral-app-1.replit.app/orders/{owedOrderId}` (universal link → `spiral://` scheme or App Store fallback).
  2. `POST /api/checkout/calculate-discount` — pay-now safety net for debt incurred between login and pay-now. Returns `{eligible: false, code: "soft_banned", …}`.
  3. `GET /api/internal/customers/:id/soft-ban-status` — for the merchant dashboard.
- Reposting an IG Story tagging the merchant re-triggers verification on `not_public`/`taken_down_early`; quick pass auto-unbans.
- In-app surface: orange "Your next discount is on hold" banner on Home + Discounts when `accountStatus === 'soft_banned'`.

## iOS Push Notifications

- **Failures + reminders only.** Never for successful verifications (those are in-app).
- Copy never threatens the discount on the order being notified about — only mentions impact on FUTURE discounts.
- Wired via `@parse/node-apn`. Lazy provider build; if `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_PRIVATE_KEY` / `APNS_BUNDLE_ID` is missing, falls back to log-only (`[PUSH] (log-only, …)`).
- Triggers: delivery reminder (order → `delivered`), quick fail (`not_public`), final fail (`taken_down_early`).
- Token endpoint: `POST /api/customer/push-token`.

## In-App Status (Replaces Order/Story DMs)

All order/Story progress is shown live in the app. The five outbound DMs that used to ack story-received, celebrate verification, or warn about Close Friends / early takedown have been removed. Spiral-code account-linking DMs are unchanged.

## Required Secrets

- `RAPIDAPI_KEY` — IG follower counts.
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` — Spiral Meta app (`1348945556722394`). `FACEBOOK_APP_SECRET` validates incoming webhook signatures at `/webhooks/instagram` + `/webhooks/instagram-dm` (a wrong/missing secret breaks Story capture). `FACEBOOK_APP_ID` is kept for the Meta app identity; the former shopper Instagram OAuth that consumed it has been removed (shoppers link IG via the DM spiral-code flow).
- `INSTAGRAM_APP_SECRET` — legacy fallback for webhook signature verification; used only if `FACEBOOK_APP_SECRET` is unset.
- `INSTAGRAM_APP_ID` (`1150430890573369`) / `INSTAGRAM_REDIRECT_URI` — legacy, not referenced in code (former IG Basic Display); the IG product ID nested *inside* the Spiral Meta app (see "Meta App").
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — webhook GET handshake token (defaults to `spiral_verify_token`).
- `SPIRAL_INSTAGRAM_ACCESS_TOKEN` — @joinspiral Instagram Login token (`IGAA…`), generated in the Meta Dashboard. **Long-lived (~60 days), NOT permanent.** Used as the seed for the `service_tokens` store; once seeded, the app auto-refreshes it (see "@joinspiral Token Auto-Refresh"). Update this secret only to recover from a fully-lapsed token.
- `SPIRAL_INSTAGRAM_BUSINESS_ID` — FB Page id for @joinspiral (`797294296809569`).
- `SPIRAL_INTERNAL_KEY` — shared key for `/api/internal/*` + dashboard story-forward.
- `APNS_*` (optional) — iOS push.

## Design Principles

Minimal · calm · trust-led · mobile-first · rewarding tone ("You saved $12", not "Discount applied").
