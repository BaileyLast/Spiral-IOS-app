# Spiral Customer App

## Overview

Shoppers earn an instant checkout discount for posting one Instagram Story after delivery. This repo is the iOS customer app **and** the single source of truth for Spiral identity, customer state, verifications, discount eligibility, soft-ban, tier config, and push. The merchant dashboard and future ecomm adapters call our `/api/internal/*` surface instead of duplicating state.

## User Preferences

Simple, everyday language. No emojis.

## Server & Deployment

- Listener: `Number(process.env.PORT) || 3000`. Dev workflow sets `PORT=5000`.
- Deployment: Reserved VM. Prod commands `npm run build` then `npm run start`.
- `/health` returns `ok` (200). Requests logged with `[INCOMING]` prefix.

## Stack

- **Frontend**: React 18 + TypeScript + Vite, shadcn/ui + Tailwind. Mobile-first single-column, HSL CSS variables, branded green/teal. Bottom nav: Home / Marketplace / Discounts / Profile. React Query for server state, localStorage for session.
- **Backend**: Express + Drizzle ORM + Neon serverless Postgres. TypeScript strict, ESNext.
- **Build**: Vite (client), esbuild (server prod), tsx (dev).

## Data Models (`shared/schema.ts`)

- `store_settings` — IG OAuth, store config, webhook health. Single row (single-tenant today). Shopify `shopDomain` + `accessToken` are owned by the merchant dashboard (see "Shopify Credentials"); these columns are legacy/fallback only and may be NULL.
- `discount_tiers` — Follower ranges → discount %. Written by dashboard, read here.
- `verifications` — Story verification records with webhook metadata.
- `spiral_customers` — Customer accounts + Instagram identity.
- `orders` — Order tracking with discount + verification status. Keeps IG identity columns so deletion-safe lookups still work.
- `merchant_scoped_user_map` — Scoped IG sender id → customer cache (positive AND negative; see Story Verification).
- `spiral_codes` — DM-based IG verification codes.
- `service_tokens` — Runtime-rotatable tokens. Key `joinspiral` holds the @joinspiral Instagram Login token + `expires_at`; seeded from `SPIRAL_INSTAGRAM_ACCESS_TOKEN`, then auto-refreshed (see "@joinspiral Token Auto-Refresh").

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
- `POST /api/checkout/authenticate` — login; response includes soft-ban payload (see Soft-Ban Model).
- `POST /api/checkout/calculate-discount` — pay-now eligibility + tier match; includes soft-ban safety net.
- `POST /api/checkout/confirm-discount` — record discount applied to a placed order.
- `POST /api/checkout/estimate-discount` — pre-login estimate by IG handle.

### Universal Core API (`/api/internal/*`, server-to-server)

All routes gated by `requireInternalKey` (header `x-spiral-internal-key`). Used by the dashboard and future Woo/BigCommerce adapters. **Callers MUST NOT cache negative identity results locally** — every call is a single indexed lookup on cache hits, and stale local caches shadow our self-healing path at signup/DM-verify.

| Endpoint | Purpose |
|---|---|
| `POST /identity/resolve` | `{merchantInstagramBusinessId, senderScopedId}` → Spiral identity (or confirmed non-Spiral). Same logic as the story-mention webhook (`resolveScopedSender`). |
| `GET /customers/by-instagram?handle=&userId=&globalUserId=` | Find Spiral customers by IG identity. Returns array (siblings can share a handle). |
| `POST /customers/lookup-by-handle` | `{instagramHandle}` → `{isSpiral:true, customerId}` if a Spiral shopper owns that handle, else `{isSpiral:false}`. Case-insensitive, tolerates leading `@`. Miss = 200 (never 404). Hot path for the dashboard product-page teaser (Login vs Join). |
| `GET /identity/:globalUserId/verifications?fallbackUserId=` | Story history for an IG identity. Survives customer deletion. Pass `_` for the path param if only the fallback id is known. |
| `POST /discount/calculate` | `{customerId}` → eligibility + tier match (mirrors `/api/checkout/calculate-discount`, sans soft-ban gate). Backed by `calculateDiscountForCustomer`. |
| `GET /customers/:customerId/soft-ban-status` | Read-through soft-ban evaluator (`evaluateSoftBanForCheckout`). Self-heals stale state. |
| `GET /merchants/:merchantInstagramBusinessId/discount-tiers` | Tier config + `spiralEnabled` + `minFollowers`. |
| `POST /push/send` | `{customerId, kind, brandName?}`; `kind ∈ {delivery-reminder, quick-fail, final-fail}`. Copy fixed per kind. Reminders/failures only — successes are in-app. |
| `POST /orders/:id/mark-delivered` | Transition order → delivered, fire reminder push. |
| `POST /stories/invalidate` | `{orderId?, instagramGlobalUserId?, instagramUserId?, instagramHandle?, verificationId?, shopDomain?}` (≥1 of orderId/globalId/userId/handle required) — admin rejected a flagged Story. Resets the shopper's targeted posted order to pre-post (verification → `pending`, Story artifacts cleared, in-flight publicity check cancelled), stamps `orders.storyRejectedAt`, re-runs `evaluateSoftBanForCheckout` so the now-owed order re-bans via the derived model (no manual ban), and fires a `story-outcome` (`status:'rejected'`) signal to the merchant dashboard. **Lookup precedence:** `orderId` (exact) → `instagramGlobalUserId`/`instagramUserId` (immutable, picks the most-recently-posted order across IG siblings) → `instagramHandle` (mutable fallback). `verificationId` opaque/log-only, `shopDomain` advisory. Idempotent (already-reset / unknown id = logged no-op, returns `{success:true, invalidated:false, reason}`). An order whose shopper was deleted (anonymized) still resets but has no soft-ban to apply. **Known limitation:** a handle-only caller can miss if the shopper renamed between post and reject (logged warning) — send `orderId` or `instagramGlobalUserId` to avoid this. |
| `POST /shopify/backfill-webhooks` | Re-register Shopify webhook topics for an already-connected store. Reads credentials via `getShopifyCredentialsForSettings`. |
| `POST /merchants/register` · `PATCH /customers/:id` | Existing merchant/customer admin hooks. |

#### CRM Admin (`/api/internal/crm/*`)

Server-to-server surface for the separate **Spiral CRM** project to browse/search/view/edit/soft-ban/delete shoppers and view orders. The CRM keeps **no** duplicate datastore — it calls these endpoints; this app stays the single source of truth. Same `requireInternalKey` gate. Every customer payload is whitelisted through `crmCustomerView` (server/routes.ts) and never includes credentials/secrets (`passwordHash`, `instagramAccessToken`, `iosPushToken`, `unsubscribeToken`, email-verification codes, welcome-DM diagnostics).

| Endpoint | Purpose |
|---|---|
| `GET /crm/customers?page=&limit=&q=` | Paginated shopper directory. `q` = case-insensitive match over name/email/IG handle. → `{items, total, page, limit}`. `limit` capped at 100. |
| `GET /crm/customers/:id` | Full shopper profile + order history (`crmOrderView`) + Story/verification history (keyed off IG identity, survives deletion). 404 if unknown. |
| `PATCH /crm/customers/:id` | Edit editable profile fields only (`firstName`, `lastName`, `dateOfBirth`, `address`, `country`); identity/credentials/IG linkage not editable. Zod-validated. |
| `DELETE /crm/customers/:id` | Hard-delete shopper (same path as in-app account deletion): removes account + locally-owned rows, anonymizes their orders. Irreversible. |
| `POST /crm/customers/:id/soft-ban` | `{reason?}` (default `manual_admin`) → place on hold. The derived model self-heals at checkout, so a manual ban on a shopper who owes nothing auto-clears next time they shop. |
| `POST /crm/customers/:id/clear-soft-ban` | Force-clear the hold. May be re-applied at next checkout if the shopper still owes a Story (own or IG-sibling debt). |
| `GET /crm/orders?page=&limit=&q=` | Paginated order list. `q` = case-insensitive match over shopper email / IG handle / Shopify order id / store name. → `{items, total, page, limit}`. |
| `GET /crm/orders/:id` | Full order (`crmOrderView`) + owning shopper (sanitized) when still linked. 404 if unknown. |

### Webhooks
- `GET/POST /webhooks/instagram-dm` — DMs to @joinspiral (spiral-code verification) + story_mention events.
- `GET/POST /webhooks/instagram` — Story mentions on merchant's connected IG.
- Shopify (registered via the dashboard's OAuth and (re)registered by `POST /api/internal/shopify/backfill-webhooks`): `/webhooks/shopify/orders-create` · `/fulfillments-create` · `/fulfillments-update` · `/fulfillment-events-create` · `/orders-cancelled` · `/refunds-create`.
  - `orders/cancelled` → marks the order `cancelled` and releases Story debt (full cancellation = no goods kept = nothing owed).
  - `refunds/create` → re-fetches the order from the Admin API (`fields=id,financial_status,line_items,refunds`) and releases only when the shopper keeps **no** Spiral-discounted line item. Per discounted item (`discount_allocations` sum > 0), kept qty = ordered qty − total refunded qty across all `refunds[].refund_line_items`; `financial_status === 'refunded'` is the full-refund fast path. Keep any discounted item → obligation stands. If the order can't be fetched, has no line items, or shows no per-item discount data → debt is conservatively **held**.
  - Release = set the terminal order status + re-run `maybeAutoUnbanCustomer` (self-heals, cascades to IG-sibling accounts). Verification records are kept as-is — a refund never reverses an already-earned Story or discount.

## Shopify Credentials

This app does **not** run its own Shopify OAuth and does **not** store a Shopify access token. The merchant connects Shopify once on the dashboard; this app reads the live `shopDomain` + `accessToken` from the dashboard's internal API.

- Helper `server/shopifyCredentials.ts`: `getShopifyCredentials({shopDomain?, instagramBusinessAccountId?})` and `getShopifyCredentialsForSettings(settings)`. 5-min in-memory cache; 5s fetch timeout; 404 misses negative-cached. `prewarmShopifyCredentials()` runs once at boot (`server/index.ts`).
- Dashboard contract (on `spiral-merchant-dashboard.replit.app`): `GET /api/internal/shopify/credentials?shop=<domain>&instagramBusinessAccountId=<id>`, auth header `x-spiral-internal-key` (shared `SPIRAL_INTERNAL_KEY`). 200 → `{ shopDomain, accessToken, storeName: string|null, storeLogoUrl: string|null }`; either query param may identify the merchant, pass whichever the caller has. 404 = "not connected (yet)".
- Override base URL with `SPIRAL_MERCHANT_DASHBOARD_URL` (default `https://spiral-merchant-dashboard.replit.app`).
- Retired here: `GET /auth/shopify` and `GET /shopify/callback` return `410 Gone`. This app must never initiate its own Shopify install — a second installation wipes the dashboard's token and breaks product images + delivery tracking.
- All Shopify-credential readers use the helper: `/api/shopify/sync`, the `orders/create` webhook (product images + store logo + shop-domain backfill), `/api/internal/shopify/backfill-webhooks`. Legacy columns `store_settings.shopDomain` / `accessToken` may be NULL.

## Instagram Integration

### Account Verification (DM-based)
Shoppers link Instagram **only** through this DM spiral-code flow (no shopper Instagram OAuth — the old `/api/customer/instagram/auth` + `/callback` routes were dead code and removed):
1. Customer gets a 6-char code (24h expiry).
2. Customer DMs the code to @joinspiral.
3. Webhook extracts the IG user id from sender metadata, matches the code, links IG to the Spiral customer.

Follower count: **RapidAPI** (Instagram API - Fast & Reliable Data Scraper).

### Story Verification (Automated)
1. Customer posts an IG Story tagging the merchant; `story_mention` event hits our webhook.
2. `resolveScopedSender(settings, senderScopedId)` resolves the sender:
   - Positive cache hit → return customer, touch `lastSeenAt`.
   - Negative cache hit → exit early (no Profile API call).
   - Miss → IG Profile API (username) + RapidAPI (global numeric pk) → match Spiral customers by handle → write positive mapping OR negative-cache row.
   - Transient failure (no token / Profile API down) → return `unresolvable`, **do not** negative-cache.
3. Match the resolved customer to their pending order(s) and verify.
4. Matching uses immutable `instagramUserId`; `instagramHandle` is display-only and auto-refreshed when IG reports a new username for the same scoped id.
5. Self-healing: when a Spiral customer DM-verifies, stale negative-cache rows for their IG identity are cleared (`server/routes.ts`).

### Dashboard story-mention forward
Every story_mention at `/webhooks/instagram-dm` is forwarded fire-and-forget to `POST https://spiral-merchant-dashboard.replit.app/api/instagram/story-mention` (header `x-spiral-internal-key`, 3s timeout, `[STORY-FORWARD]` prefix). DM verification-code messages are not forwarded.
- Each entry resolved to a Spiral customer is annotated inline with the shopper's real global `instagramUserId` (Meta's `sender.id` is a per-app IGSID, not the global id), so the dashboard matches without re-hitting the Graph API. Unresolved entries ship un-annotated; the dashboard falls back to its own lookup.
- The payload also carries the matched merchant's `shopDomain` + `instagramBusinessAccountId` (top-level, alongside `messaging`) so the dashboard identifies the merchant without app-scoped↔global id conversion. Populated only after the merchant guard passes; blank values omitted. These fields persist on the retry-queue payload, so retried forwards include them too.

### Dashboard story-outcome forward
After a flagged Story is **rejected** (and again when the resulting hold **lifts**), this app fire-and-forgets a `story-outcome` signal to `POST https://spiral-merchant-dashboard.replit.app/api/instagram/story-outcome` (header `x-spiral-internal-key`, `[STORY-OUTCOME]` prefix). Reuses the same `dashboard_forward_queue` + retry worker as the story-mention forward — the queue payload's `kind` field discriminates the two (`story-outcome` rows route to `/api/instagram/story-outcome`; legacy story-mention rows have no `kind` and route to `/api/instagram/story-mention`).
- Payload: `{kind:'story-outcome', status:'rejected'|'resolved', reason, orderId, shopifyOrderId?, storeName?, shopDomain?, instagramBusinessAccountId?, instagramGlobalUserId?, instagramHandle?, softBanned}`. Merchant routing identifiers come from `store_settings` (single-tenant) + the order; blank values omitted.
- `rejected` fires from `POST /api/internal/stories/invalidate` (admin rejected the Story). `resolved` fires when a previously-rejected order's repost passes its quick publicity check (`storyRejectedAt` is set → cleared, hold has lifted). `softBanned` reflects the shopper's derived state at that moment.
- Best-effort only — never blocks the rejection or verification flow. The `orders.storyRejectedAt` stamp is what links a rejection to its later repost-resolution.

### OAuth scopes
`instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`. After the merchant connects, we subscribe to `messages` + `messaging_postbacks` on the FB Page.

### Meta App
- **One Meta app with a nested Instagram ID** (NOT two apps). Top-level is the **Spiral app** (`1348945556722394`, name "Spiral", Business type, "Facebook Login for Business"). Adding the Instagram product generated a child "Instagram App ID" (`1150430890573369`, stored in `INSTAGRAM_APP_ID`) that lives inside it — a sub-identity, legacy/unused by current code.
- The Spiral app owns the Instagram webhook and @joinspiral token generation. Webhook: `/webhooks/instagram-dm` (verify token `spiral_verify_token`); `story_mention` events arrive here, we verify the matching order and forward each event to the dashboard.
- Incoming webhook signatures are validated with this app's secret `FACEBOOK_APP_SECRET`; handlers fall back to legacy `INSTAGRAM_APP_SECRET` only if it's unset. Neither set → checks skipped (dev only); a wrong secret rejects real webhooks with 403.

### @joinspiral Token Auto-Refresh
- The @joinspiral Instagram Login token (`IGAA…`) is long-lived but **NOT permanent** — expires ~60 days after issue; if it lapses, DM code verification and story-sender lookups silently break.
- Stored in `service_tokens` (key `joinspiral`), not just the env secret, so the running app can rotate it (an env secret can't be rewritten at runtime).
- Helpers in `server/joinspiralToken.ts`:
  - `getJoinspiralToken()` — DB-first read, 60s in-memory cache; seeds from `SPIRAL_INSTAGRAM_ACCESS_TOKEN` on first boot; re-seeds from the env var if the stored token is expired/unknown and the env value differs (operator recovery). All reads go through this (`/api/admin/resubscribe-webhooks`, story-sender lookup, `sendInstagramDM`) — no code reads the env var directly.
  - `startJoinspiralTokenRefresh()` — runs at boot and every 12h; calls `graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token` when within 10 days of expiry (or expiry unknown) and writes the new token + `expires_at` back.
  - `markJoinspiralTokenInvalid()` — self-heal: a live IG call hitting an auth error (OAuthException / code 190 / "session has expired") flags the stored token expired and kicks an immediate reseed+refresh, closing the revoked-but-not-yet-expired gap. Fires only on genuine auth errors, so a healthy token is never clobbered by a stale env value.
- Full-lapse recovery (app offline > ~60 days): generate a fresh token in the Meta dashboard, update `SPIRAL_INSTAGRAM_ACCESS_TOKEN`, restart — the helper re-seeds. Instagram refuses to refresh a token younger than 24h (logged as benign, resolves on a later run).

## Order Lifecycle

1. **Ordered** — placed, awaiting fulfillment.
2. **Fulfilled/Shipped** — `orders.shopifyTrackingStatus` mirrors raw Shopify `shipment_status` from every `fulfillment_events/create` + `fulfillments/update` webhook.
3. **Delivered** — triggers the "Post Your Story" prompt. Reached via, in order of preference:
   - `fulfillment_events/create` with `status=delivered` (carrier-tracked).
   - `fulfillments/update` with `shipment_status=delivered` (backup).
   - Customer taps "I've received this order" → `POST /api/customer/orders/:id/mark-received` (gate: must be `fulfilled` and not yet `delivered`).
   - Background fallback (`runDeliveryFallbackJob`, every 30 min): 24h after first `ready_for_pickup` → auto-collected; 7d after `fulfilled` with no tracking event → auto-delivered.
4. **Verified** — Story mention webhook fired, discount confirmed.

All paths funnel into the idempotent `transitionOrderToDelivered` helper.

### Terminal states (cancel / refund)
- `cancelled` / `refunded` are terminal `orders.status` values set by the Shopify `orders/cancelled` and `refunds/create` webhooks. Such an order can never owe a Story — `isOrderOwed` (in `shared/schema.ts`, the single source of truth for owed accounting) returns `false` for these statuses regardless of verification state.
- Setting the terminal status re-runs `maybeAutoUnbanCustomer`, so a cancelled/refunded order auto-lifts the soft-ban (cascading to IG-sibling accounts). A refund releases only once the shopper keeps no Spiral-discounted item (full refund, or all discounted items refunded); a partial refund leaving a discounted item does not release (see refund webhook rule above). In-app these orders show a neutral "Cancelled"/"Refunded" badge and no Story prompt.

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
- **Owed** = (a) a delivered order in `pending`/`awaiting_review`/`not_public`, OR (b) any order in `taken_down_early` regardless of delivery (final-fail debt is delivery-independent; quick-fail debt only counts post-delivery).
- **Anchored to Instagram identity, not email** — debt follows the IG account (`instagramGlobalUserId` OR `instagramUserId`) across every Spiral customer linked to that profile. Evaluated at (1) DM-verify time (sibling sweep, reason `inherited_from_instagram`) and (2) checkout (union of own-owed + sibling-IG-owed).
- Reasons: `delivery_pending`, `not_public`, `taken_down_early`, `inherited_from_instagram`.
- `maybeAutoUnbanCustomer` clears when zero own-owed AND zero sibling-IG-owed; clearing one account re-evaluates all siblings.
- Shared evaluator `evaluateSoftBanForCheckout(customerId)` self-heals in both directions and returns `{softBanned, softBannedReason, pendingVerificationCount, brandName, owedOrderId, message}`. Used by:
  1. `POST /api/checkout/authenticate` — login succeeds; widget renders on-hold screen on first paint, CTA → `https://spiral-app-1.replit.app/orders/{owedOrderId}` (universal link → `spiral://` scheme or App Store fallback).
  2. `POST /api/checkout/calculate-discount` — pay-now safety net for debt incurred between login and pay-now. Returns `{eligible:false, code:"soft_banned", …}`.
  3. `GET /api/internal/customers/:id/soft-ban-status` — for the dashboard.
- Reposting an IG Story tagging the merchant re-triggers verification on `not_public`/`taken_down_early`; a quick pass auto-unbans.
- In-app surface: orange "Your next discount is on hold" banner on Home + Discounts when `accountStatus === 'soft_banned'`.

## iOS Push Notifications

- **Failures + reminders only** — never for successful verifications (those are in-app).
- Copy never threatens the discount on the order being notified about — only mentions impact on FUTURE discounts.
- Wired via `@parse/node-apn`. Lazy provider build; if `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_PRIVATE_KEY` / `APNS_BUNDLE_ID` is missing, falls back to log-only (`[PUSH] (log-only, …)`).
- Triggers: delivery reminder (order → `delivered`), quick fail (`not_public`), final fail (`taken_down_early`).
- Token endpoint: `POST /api/customer/push-token`.

## In-App Status (Replaces Order/Story DMs)

All order/Story progress is shown live in the app. The five outbound DMs that used to ack story-received, celebrate verification, or warn about Close Friends / early takedown have been removed. Spiral-code account-linking DMs are unchanged.

## Required Secrets

- `RAPIDAPI_KEY` — IG follower counts.
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` — Spiral Meta app (`1348945556722394`). `FACEBOOK_APP_SECRET` validates incoming webhook signatures at `/webhooks/instagram` + `/webhooks/instagram-dm` (a wrong/missing secret breaks Story capture). `FACEBOOK_APP_ID` is kept for Meta app identity; the former shopper Instagram OAuth that consumed it has been removed.
- `INSTAGRAM_APP_SECRET` — legacy fallback for webhook signature verification; used only if `FACEBOOK_APP_SECRET` is unset.
- `INSTAGRAM_APP_ID` (`1150430890573369`) / `INSTAGRAM_REDIRECT_URI` — legacy, not referenced in code (former IG Basic Display); the IG product ID nested inside the Spiral Meta app.
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` — webhook GET handshake token (defaults to `spiral_verify_token`).
- `SPIRAL_INSTAGRAM_ACCESS_TOKEN` — @joinspiral Instagram Login token (`IGAA…`), generated in the Meta Dashboard. Long-lived (~60 days), NOT permanent. Seeds the `service_tokens` store; once seeded, the app auto-refreshes it. Update only to recover from a fully-lapsed token.
- `SPIRAL_INSTAGRAM_BUSINESS_ID` — FB Page id for @joinspiral (`797294296809569`).
- `SPIRAL_INTERNAL_KEY` — shared key for `/api/internal/*` + dashboard story-forward.
- `APNS_*` (optional) — iOS push.

## Design Principles

Minimal · calm · trust-led · mobile-first · rewarding tone ("You saved $12", not "Discount applied").
