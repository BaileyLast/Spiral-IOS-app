---
name: VITE_ env is build-time only; native build needs a hardcoded Core default
description: Why the thin client must default to the production Core URL in code, not rely on VITE_API_BASE_URL
---

`VITE_*` env vars are inlined at **build time**, not read at runtime. They live in the Replit environment, so Replit dev/deploy builds get `VITE_API_BASE_URL`. But the native iOS (Capacitor) build is produced on the user's Mac with `npm run build`, where that env var is NOT set, and the bundle ships with no env at all.

If the client falls back to "current origin" when `VITE_API_BASE_URL` is unset, the native app calls its own `capacitor://localhost` origin — which has no backend — so EVERY request (login, signup, everything) fails. The Replit preview hid this because the env var is set there.

**Fix:** `queryClient.ts` defaults `API_BASE_URL` to the production Core (`https://api.joinspiral.app`) when the env var is unset, instead of falling back to origin. The env var still overrides for staging.

**Why:** A Capacitor bundle has no environment; a build-time default is the only thing guaranteed to be present on-device. The old origin-fallback only made sense for a co-located server that no longer exists in this thin-client split.

**How to apply:** Any config the native app needs at runtime must be baked into the source (a code default), committed to git, or fetched from the Core after launch — never assumed to come from an env var on the build machine. Don't rely on a committed `.env` either unless you've confirmed it isn't gitignored (it usually is). Core CORS already allows `capacitor://localhost` with credentials, so no native HTTP/CapacitorHttp workaround is needed for cross-origin calls.
