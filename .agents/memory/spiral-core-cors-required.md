---
name: Spiral Core CORS — browser-preview only, not a native blocker
description: The customer thin client is iOS-only; Core's missing CORS headers block the desktop browser preview but do NOT block the real native app.
---

The customer app is an **iOS-only** thin client (it will never ship as a web app). The Replit preview runs it in a desktop browser, where calls to Spiral Core (`https://api.joinspiral.app`) are cross-origin. As of June 2026, Core sends **no CORS headers at all** — `OPTIONS` preflight even falls through to Core's SPA HTML catch-all (200 text/html, no `Access-Control-*`). So in the browser preview every fetch is blocked: "No 'Access-Control-Allow-Origin' header is present."

**This is a preview-only symptom, not a real blocker.** Native iOS shells (Capacitor/Cordova-style) route web requests through a native HTTP layer that does not enforce browser CORS, so the live app's calls to Core succeed with the Bearer token. The only case where CORS would still bite is a plain WKWebView loading the bundle from a remote `https://` origin and letting page-level `fetch` hit Core directly.

**Why:** CORS is enforced by browsers, not by native HTTP clients. Core's endpoints work server-side (curl gets proper 401 JSON for `/api/customer/login` and `/api/customer/me`).

**How to apply:**
- Do NOT treat the preview's CORS error as a bug in this thin client — the client wiring (withApiBase, bearer header, token capture/clear) is verified correct and needs no change.
- Do NOT push a Core-side CORS fix purely for the app's sake; it's only needed if you actually want the desktop browser preview to make live calls.
- If you DO want browser-preview round-trips: the fix lives in the **Core repl** — echo the specific `Access-Control-Allow-Origin` (not `*`, since credentials are included), set `Access-Control-Allow-Credentials: true`, allow `GET,POST,PATCH,DELETE,OPTIONS`, allow headers `authorization,content-type`, and answer `OPTIONS` (204) before the SPA static catch-all.
