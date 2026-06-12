# Spiral Customer App (Thin Client)

## Overview

The iOS customer-facing Spiral app. Shoppers earn an instant checkout discount for posting one Instagram Story after delivery.

This repl is a **thin shopper client**. It is the frontend only. All data, identity, verifications, discount eligibility, soft-ban, tier config, push, and Instagram/Shopify integrations live in a **separate backend, "Spiral Core"** (`https://api.joinspiral.app`), which is the single source of truth. This repl runs **no API routes, no database, and no background jobs** — it serves the built client and proxies nothing; the browser talks to Spiral Core directly.

## User Preferences

Simple, everyday language. No emojis.

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, shadcn/ui + Tailwind. Mobile-first single-column, HSL CSS variables, branded green/teal. Bottom nav: Home / Marketplace / Discounts / Profile. React Query for server state, localStorage for session.
- **Server (this repl)**: a minimal Express app (`server/index.ts`) that only:
  - logs requests with the `[INCOMING]` prefix,
  - serves `/health` → `ok` (200),
  - serves the Vite dev middleware in development and the built static client in production.
  - Listener: `Number(process.env.PORT) || 3000`. Dev workflow sets `PORT=5000`.
  - `server/vite.ts` is the only other server file (do not edit it).
- **Build**: Vite (client), esbuild (the thin `server/index.ts`).
- **Deployment**: Reserved VM. Prod commands `npm run build` then `npm run start`.

## Talking to Spiral Core

- `VITE_API_BASE_URL` points the client at Spiral Core (`https://api.joinspiral.app`). When unset (local dev against a co-located server) calls fall back to the current origin.
- `client/src/lib/queryClient.ts` is the single networking layer:
  - `withApiBase(url)` prefixes relative `/api/...` paths with `VITE_API_BASE_URL` (absolute URLs pass through). Applied to both `apiRequest` and the default React Query `getQueryFn`.
  - Auth is a **bearer token**. `setAuthToken(token)` / `getAuthToken()` persist it in localStorage (`spiral_auth_token`); every request sends `Authorization: Bearer <token>` when present. Requests also keep `credentials: "include"` so cookie-based sessions still work if Core uses them.
  - Login (`Login.tsx`) and email verification (`VerifyEmail.tsx`) call `setAuthToken(data.token)` when Core returns a token. Logout (`Profile.tsx`) and account deletion (`ManageAccount.tsx`) call `setAuthToken(null)`.
- The Instagram avatar is fetched through `apiRequest` (so the token + base URL apply) and shown via an object URL — see `client/src/hooks/use-instagram-avatar.ts`. A plain `<img src="/api/...">` cannot send the token or reach cross-origin Core.

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

## Shared code

- `shared/schema.ts` and `shared/categories.ts` are kept for the TypeScript types the client imports. The client does not run Drizzle or connect to a database.

## Environment

- `VITE_API_BASE_URL` — the only configuration this client needs. Set to the Spiral Core origin.
- Backend secrets (Instagram, Shopify, RapidAPI, AWS, Resend, OpenAI, session, internal key, database URLs, etc.) now live in the Spiral Core repl, not here. Any such secrets still present in this repl's Secrets are unused and can be removed from the Secrets tab.

## Native bits

- iOS share / Story composer integration (`StoryComposer.tsx`) and the native `spiralStoryShare` bridge are unchanged. Push token registration still posts to Core via `POST /api/customer/push-token`.

## Design Principles

Minimal · calm · trust-led · mobile-first · rewarding tone ("You saved $12", not "Discount applied").
