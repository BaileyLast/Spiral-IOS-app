---
name: Spiral Core CORS for thin client
description: Why the customer thin client can't reach Spiral Core from a browser, and what Core must send.
---

The customer app is a thin client served from its own origin; the browser calls Spiral Core (`https://api.joinspiral.app`) cross-origin. As of June 2026, Core sends **no CORS headers at all** — `OPTIONS` preflight even falls through to Core's own SPA HTML catch-all (200 text/html, no `Access-Control-*`). The endpoints work server-side (curl gets proper 401 JSON for `/api/customer/login` and `/api/customer/me`), but every browser fetch is blocked: "No 'Access-Control-Allow-Origin' header is present on the requested resource."

**Why:** without ACAO the browser blocks the response before any bearer token is used; and because client requests send an `Authorization` header + `credentials:"include"`, they trigger a credentialed preflight that Core never answers.

**How to apply:** the fix belongs in the **Core repl**, not the thin client. Core must, for the client's origin(s): echo the specific `Access-Control-Allow-Origin` (NOT `*`, because credentials are included), set `Access-Control-Allow-Credentials: true`, allow methods `GET,POST,PATCH,DELETE,OPTIONS`, allow headers `authorization,content-type`, and answer `OPTIONS` (204) before the SPA static catch-all. No client-side change can bypass browser CORS. The thin-client wiring (withApiBase, bearer header, token capture/clear) is verified correct.
