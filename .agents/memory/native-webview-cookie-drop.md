---
name: Native iOS WebView drops cross-site session cookies
description: Why cookie-based multi-step flows (e.g. signup -> verify) break only in the Capacitor app, and how to fix client-side
---

A multi-step flow that the web app threads together with a session cookie can break ONLY in the native iOS app while working fine in the browser and Replit preview.

Concrete case: signup -> email-code verification. The Core sets `connect.sid` (`HttpOnly; Secure; SameSite=None`) at signup and finds the "pending signup" on the verify/resend calls via that cookie. iOS WKWebView (page origin `capacitor://localhost`) treats `api.joinspiral.app` cookies as third-party and does NOT persist/send them, so the verify call arrives session-less and Core returns 401 "No pending signup found." A normal browser sends the SameSite=None cookie, so the web app never sees the bug.

**Fix (client-only; Core not editable):** the Core also returns a `signupToken` in the signup response body specifically so the client can carry the identity without a cookie. Store it (localStorage) at signup and replay it in the JSON body of the dependent calls (`verify-email` and `resend-code` both accept `signupToken` in the body), then clear it on success. Confirmed by probing live Core: token in the BODY links the pending signup; a `Authorization: Bearer` header or a `token` body field does NOT.

**Why:** WKWebView third-party cookie blocking is not something this repo can change, and the Core lives in a separate non-editable repl. The server already offered a cookie-free handle (`signupToken`); the client just wasn't using it.

**How to apply:** For ANY multi-request flow against the Core that depends on shared server state, do not rely on the session cookie surviving in the native app. Look for a server-issued token in the first response and replay it explicitly (body/header per the endpoint's contract). When debugging "works on web, fails in the app" auth/flow bugs, suspect the dropped cross-site cookie first and verify the real contract with curl using `Origin: capacitor://localhost`.
