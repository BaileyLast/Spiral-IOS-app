# Spiral Customer App

## Overview

Spiral is a customer-facing mobile application that allows shoppers to earn instant discounts at checkout by agreeing to post one Instagram Story after delivery. The app handles login & identity, Instagram connection, follower verification, order tracking, and automated story verification. Designed with minimal, calm, trust-led principles inspired by Klarna and Apple.

## User Preferences

Preferred communication style: Simple, everyday language.

## Server & Deployment Notes

- Server listener uses `Number(process.env.PORT) || 3000` — no hardcoded port 5000.
- In development, the workflow sets `PORT=5000` via the command (`PORT=5000 npm run dev`).
- Deployment target: Reserved VM (`deploymentTarget = "vm"`).
- Production commands: `npm run build` then `npm run start`.
- The `/health` endpoint returns "ok" at 200 for health checks.
- All incoming requests are logged with `[INCOMING]` prefix.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript, Vite for build and development.
- **UI/UX**: Mobile-first design with shadcn/ui components, Tailwind CSS. Minimal, calm aesthetic with trust-led interactions.
- **Layout**: Bottom navigation bar with Home, Marketplace, Discounts, Profile tabs. Single-column mobile layouts.
- **State Management**: React Query for server state, localStorage for customer session.
- **Theming**: HSL-based color system with CSS custom properties, branded purple primary color, soft status colors for order states.
- **Design**: Rounded cards (rounded-2xl), generous padding, soft shadows, mobile-safe areas.

### Pages
- **Onboarding** (`/`): Welcome screen explaining value proposition with Get Started CTA
- **Login** (`/login`): Email/password authentication with signup toggle
- **Instagram Connect** (`/connect-instagram`): Connect Instagram to verify follower count
- **Home** (`/home`): Dashboard with stats, pending actions, recent orders
- **Marketplace** (`/marketplace`): Browse participating brands
- **Discounts** (`/discounts`): List of all orders with status badges
- **Order Detail** (`/orders/:id`): Progress timeline, discount info, posting instructions
- **Profile** (`/profile`): Account info, Instagram status, settings, logout
- **Manage Account** (`/manage-account`): Instagram disconnect card with profile pic, editable account info (email, name, date of birth, address)

### Backend
- **Server**: Express.js with middleware for request handling, logging, and JSON body parsing.
- **Data Layer**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations.
- **Data Models**:
    - `store_settings`: Shopify and Instagram OAuth data, store configuration, webhook health monitoring.
    - `discount_tiers`: Follower ranges mapped to discount percentages.
    - `verifications`: Story post verification records with webhook metadata.
    - `spiral_customers`: Customer accounts with Instagram credentials.
    - `orders`: Order tracking with discount info and verification status.
    - `merchant_scoped_user_map`: Maps merchant-scoped Instagram sender IDs to Spiral customers.
    - `spiral_codes`: DM-based Instagram verification codes for account linking.

### Customer API Endpoints
- `POST /api/customer/signup`: Create new customer account
- `POST /api/customer/login`: Authenticate customer
- `POST /api/customer/logout`: End session
- `GET /api/customer/me`: Get current customer profile
- `POST /api/customer/spiral-code`: Generate or get existing verification code
- `GET /api/customer/spiral-code/status`: Poll for verification status
- `POST /api/customer/spiral-code/regenerate`: Generate a new code (invalidates old)
- `POST /api/customer/disconnect-instagram`: Unlink Instagram account
- `PATCH /api/customer/profile`: Update customer profile (name, dateOfBirth, address)
- `GET /api/customer/orders`: Get customer's orders
- `GET /api/customer/orders/:id`: Get single order details
- `GET /api/customer/stats`: Get total saved and orders completed

### Webhook Endpoints
- `GET /webhooks/instagram-dm`: Webhook verification (Meta challenge)
- `POST /webhooks/instagram-dm`: Receive DMs to @joinspiral for code verification AND story_mention events
- `GET /webhooks/instagram`: Instagram webhook verification for merchant's connected account
- `POST /webhooks/instagram`: Receive story_mention events on merchant's connected Instagram

### Instagram Integration

#### Account Verification (DM-based)
- **Flow**: Customers verify Instagram ownership by DMing a unique code to @joinspiral
- **How It Works**:
  1. Customer gets a 6-character verification code (24-hour expiry)
  2. Customer opens Instagram and DMs the code to @joinspiral
  3. Webhook receives DM, extracts Instagram user ID from sender metadata
  4. Code is matched and customer's Instagram is verified automatically
- **Follower Lookup**: RapidAPI (Instagram API - Fast & Reliable Data Scraper) fetches follower count
- **Code Table**: `spiral_codes` tracks verification sessions with status (pending/verified/expired)

#### Story Verification (Automated via Story Mention Webhook)
- **Architecture**: Fully automated using Instagram Messaging webhooks on the merchant's connected Instagram account
- **How It Works**:
  1. Customer posts Instagram Story and tags the merchant using @ mention sticker
  2. Instagram sends a `story_mention` event to our webhook via the Messaging platform
  3. Webhook extracts sender's scoped ID and story URL from the event payload
  4. System resolves sender identity: checks `merchant_scoped_user_map` first, then falls back to Instagram Profile API to resolve username
  5. Matches resolved customer to their pending order(s)
  6. Creates scoped ID mapping for future lookups and marks order as verified
  7. Sends confirmation DM to customer via Instagram API
- **Scoped ID Mapping (with negative cache)**: Instagram sends merchant-scoped sender IDs (not global user IDs). The `merchant_scoped_user_map` table caches scoped ID → Spiral customer mappings (`isSpiral=true`, with cached `instagramUserId` as canonical identity) AND confirmed non-Spiral senders (`isSpiral=false`, `spiralCustomerId=null`) so subsequent story_mentions from random shoppers exit in a single indexed lookup with no Profile API call. Backend matching always uses the immutable `instagramUserId`; `instagramHandle` is display-only and refreshed on the customer record whenever the Profile API returns a new username for the same scoped ID.
- **OAuth Scopes Required**: `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`
- **Webhook Subscription**: Automatically subscribed to `messages` and `messaging_postbacks` fields on the Facebook Page after merchant connects Instagram

### Meta App Configuration
- **Spiral app** (ID: 1348945556722394): Business type app with "Facebook Login for Business". Used for Instagram OAuth, DM webhooks, and token generation. Has "Manage messaging & content on Instagram" use case configured.
  - Webhook configured at `/webhooks/instagram-dm` with verify token `spiral_verify_token`
  - Token generated via Meta Dashboard "Generate access tokens" for @joinspiral
- **SPIRAL APP** (ID: 1261954155779121): Consumer type app. Originally used for webhooks but limited by app type restrictions.

### Required Secrets
- `RAPIDAPI_KEY`: For fetching Instagram follower counts
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`: Spiral app (1348945556722394) credentials
- `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`: Spiral app's Instagram Basic Display credentials
- `INSTAGRAM_REDIRECT_URI`: OAuth callback URL (`https://spiral-app-1.replit.app/instagram/callback`)
- `SPIRAL_INSTAGRAM_ACCESS_TOKEN`: Access token for @joinspiral (generated via Meta Dashboard, non-expiring)
- `SPIRAL_INSTAGRAM_BUSINESS_ID`: Facebook Page ID for @joinspiral (797294296809569) — used for sending DMs and subscribing webhooks
- `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`: Webhook verification token (`spiral_verify_token`)

### Order Status Flow
1. **Ordered** - Order placed, waiting for fulfillment
2. **Fulfilled/Shipped** - Fulfillment created. App displays the raw Shopify `shipment_status` (e.g. "On the way", "Out for delivery", "Ready for pickup") via `orders.shopifyTrackingStatus`, which is mirrored from every `fulfillment_events/create` and `fulfillments/update` webhook.
3. **Delivered** - Triggers "Post Your Story" prompt. Reached via, in order of preference:
   - `fulfillment_events/create` with `status=delivered` (carrier-tracked)
   - `fulfillments/update` with `shipment_status=delivered` (backup path some accounts use)
   - Customer taps "I've collected it" in the app while `shopifyTrackingStatus=ready_for_pickup` → `POST /api/customer/orders/:id/mark-collected`
   - Background fallback (`runDeliveryFallbackJob`, every 30 min):
     - 24h after first `ready_for_pickup` → auto-marked as collected (click-and-collect safety net)
     - 7d after `fulfilled` with no tracking event ever received → auto-marked delivered (manual/no-carrier-integration safety net)
4. **Verified** - Story mention detected via webhook, discount confirmed

All delivery paths funnel into the same idempotent `transitionOrderToDelivered` helper, so duplicate signals from different sources are safe.

### Shopify Webhook Topics Registered
Registered during the Shopify OAuth callback. Re-register for already-connected stores by calling `POST /api/internal/shopify/backfill-webhooks` with header `x-spiral-internal-key`.
- `orders/create` → `/webhooks/shopify/orders-create`
- `fulfillments/create` → `/webhooks/shopify/fulfillments-create`
- `fulfillments/update` → `/webhooks/shopify/fulfillments-update`
- `fulfillment_events/create` → `/webhooks/shopify/fulfillment-events-create`

### Verification Lifecycle
1. **pending**: Order placed/delivered, awaiting customer to post Story tagging merchant. Locks future discount.
2. **awaiting_review**: Story mention webhook received, quick publicity check pending (~3 min). Locks future discount.
3. **quick_verified**: Quick check passed (Story is public). UNLOCKS future discount; awaiting 10h final check.
4. **verified**: Final check passed, discount confirmed. UNLOCKS future discount.
5. **not_public**: Quick check failed (Close Friends or already deleted). Locks future discount until shopper reposts.
6. **taken_down_early**: Final check failed (Story disappeared <24h). Locks future discount until shopper reposts.

### Soft-Ban Model
- Persisted on `spiral_customers` via `accountStatus` (`'active'` | `'soft_banned'`), `softBannedReason`, `softBannedAt`.
- A shopper is soft-banned (blocked from new Spiral discounts at checkout) when they have any owed order. **Owed** = (a) delivered order in `pending`, `awaiting_review`, or `not_public`, OR (b) any order in `taken_down_early` regardless of delivery status (final-fail debt is independent of delivery; quick-fail debt only counts post-delivery since a shopper hasn't "owed" anything before delivery).
- Set on: delivery (`delivery_pending`), quick-check fail (`not_public`), final-check fail (`taken_down_early`), Instagram inheritance at DM verification (`inherited_from_instagram`).
- **Anchored to Instagram identity, not email.** Debt follows the Instagram account (matched by `instagramGlobalUserId` OR `instagramUserId`) across every Spiral customer that links the same IG profile. Inheritance is evaluated in two places: (1) at DM-verification time in the `/webhooks/instagram-dm` handler — if any sibling account sharing the just-resolved IG identity has owed orders, the new account is soft-banned with reason `inherited_from_instagram`; (2) at checkout in `/api/checkout/calculate-discount` — owed-orders count is the union of own-owed + sibling-IG-owed, so a shopper can't dodge debt by signing up with a new email but the same Instagram.
- Cleared automatically by `maybeAutoUnbanCustomer` whenever the customer has zero own-owed AND zero sibling-IG-owed orders. The clear cascades: when this customer's own debt clears, every sibling account with the same IG identity is re-evaluated and unbanned if their inherited debt is now also gone.
- `/api/checkout/calculate-discount` gates on `accountStatus === 'soft_banned'` and returns `{ code: "soft_banned", softBanned: true, softBannedReason }`. Self-heals if state ever drifts out of sync with order state (own + inherited).
- Reposting an Instagram Story tagging the merchant re-triggers verification on `not_public`/`taken_down_early` orders, which then auto-unbans on quick pass.
- Customer surfaces: orange "Your next discount is on hold" banner shown on Home and Discounts pages whenever `accountStatus === 'soft_banned'`.

### iOS Push Notifications
- Used **only** for failures and reminders — **never** for successful verifications. Successes are surfaced in-app.
- Push copy never threatens the discount on the order being notified about; only mentions impact on FUTURE discounts.
- Wired via `@parse/node-apn`. APNs provider is built lazily on first send; if `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, or `APNS_BUNDLE_ID` is missing, pushes fall back to log-only mode (`[PUSH] (log-only, …)`) without crashing.
- Push triggers: delivery reminder (when an order transitions to `delivered`), quick-check fail (`not_public`), final-check fail (`taken_down_early`).
- Endpoint: `POST /api/customer/push-token` with `{ token: string | null }` — call on app launch and on logout (with null).
- Internal endpoint: `POST /api/internal/orders/:id/mark-delivered` (header `x-spiral-internal-key`) transitions an order to `delivered`, soft-bans the customer (only if Story is still owed), and fires the reminder push.
- Production trigger: Shopify `fulfillment_events/create` webhook at `/webhooks/shopify/fulfillment-events-create` calls the same `transitionOrderToDelivered` helper when the event `status === 'delivered'`. Webhook is registered automatically during the Shopify OAuth callback alongside `orders/create` and `fulfillments/create`.

### In-App Status (Replaces Order/Story DMs)
All order/Story progress is shown live in the app. The five outbound DMs that used to ack story-received, celebrate verification, or warn about Close Friends / early takedown have been removed. Spiral-code account-linking DMs are unchanged.

### Webhook Health Monitoring
- `store_settings.webhookSubscriptionStatus`: Tracks whether messaging webhook is active/inactive/failed
- `store_settings.lastWebhookReceivedAt`: Timestamp of most recent story mention received
- Displayed on merchant Connections page with visual status indicators

### Development & Build
- **TypeScript**: Strict mode, ESNext modules, path aliases.
- **Build**: Vite for client, esbuild for server (production), tsx for development.
- **Tools**: Replit-specific plugins, runtime error modal, Vite middleware for HMR.

## External Dependencies

### UI & Forms
- **Radix UI**: Accessible component primitives
- **Lucide React**: Icon library
- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **date-fns**: Date manipulation

### Database & Backend
- **Neon Serverless PostgreSQL**: Cloud-native PostgreSQL
- **Drizzle ORM**: Type-safe database operations

## Design Principles

- **Minimal**: Clean layouts with generous white space
- **Calm**: Soft transitions, no aggressive animations
- **Trust-led**: Clear status indicators, honest language
- **Mobile-first**: Touch-friendly targets, thumb-zone navigation
- **Rewarding tone**: "You saved $12" not "Discount applied"

## Key User Flows

### First Launch / Onboarding
1. Welcome screen with value proposition
2. Continue to login/signup
3. Connect Instagram (optional, can skip)
4. Land on home dashboard

### Checkout Deep Link Flow
1. Customer taps "Check your Spiral discount" at checkout
2. App opens with checkout session token
3. Displays brand name and maximum discount
4. After confirmation, returns calculated discount to checkout

### Post-Delivery Verification (Automated)
1. Delivery notification triggers "Post Your Story" prompt in app
2. Customer posts Instagram Story tagging merchant's Instagram handle
3. Story mention webhook fires automatically to our server
4. System identifies customer via scoped ID mapping or profile API lookup
5. Order marked as verified, confirmation DM sent to customer
6. Customer sees "You saved $X!" celebration in app
