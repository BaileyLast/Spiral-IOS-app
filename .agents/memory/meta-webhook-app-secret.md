---
name: Meta webhook app secret + app-liveness checks
description: Which secret validates incoming Instagram/Meta webhook signatures, and how to confirm a Meta app is actually alive before assuming it was deleted.
---

# Meta webhook signature secret

Incoming Instagram/Meta webhook signatures (`x-hub-signature-256`) are HMAC-validated with
the App Secret of the app that owns the webhook subscription. Both webhook POST handlers
(`/webhooks/instagram-dm` and `/webhooks/instagram`) now try **both** `FACEBOOK_APP_SECRET`
and `INSTAGRAM_APP_SECRET` and accept the request if **either** HMAC matches; they log the
matching label (never the value), and on failure log which labels were tried + "none
matched". This removes the guesswork about which app's secret Meta signs with.

**CONFIRMED signer:** in production, Meta signs Instagram webhook deliveries with
`INSTAGRAM_APP_SECRET` (the nested IG-product app secret), NOT `FACEBOOK_APP_SECRET`.
Verified live: prod logged `signature verified using INSTAGRAM_APP_SECRET`. This overturns
the earlier assumption that FACEBOOK_APP_SECRET is the signer — with the old single-secret
(prefer-FACEBOOK) check, real webhooks 403'd permanently. Do NOT "standardize on
FACEBOOK and rotate away INSTAGRAM_APP_SECRET" — INSTAGRAM_APP_SECRET is the one Meta
actually uses for these deliveries. Keep the dual-secret acceptance.

**Why:** Story-mention capture was completely dead because production 403'd *every*
incoming webhook at the signature step — proven by Meta's Webhooks "Test" button reaching
prod (`[INCOMING] POST /webhooks/instagram-dm`) and getting `Invalid signature`. A rejected
webhook never logs its body, so you can't tell a real story from a test until you stop
rejecting — fix the signature gate first, then diagnose delivery/shape. Single-secret
validation was the trap: the one preferred secret didn't match Meta's signer.

**Gotcha:** prod runs the built bundle and `tsx` (dev) does NOT hot-reload — a code fix
only takes effect after the workflow restart (dev) / redeploy (prod). If a local test still
shows old log text after editing, restart before concluding anything.

**How to apply:** When webhooks 403 on signature, deploy the dual-secret check and read the
log: a `verified using <LABEL>` line tells you the real signer; `none matched` means the
*production* secret value(s) are stale and must be re-copied from the Meta dashboard
(App → Settings → Basic → App Secret). Smoke-test by signing a payload locally with each
candidate secret and POSTing — valid sig → 200, wrong sig → 403. Once the real signer is
known, consider standardizing on it and rotating the unused legacy secret to re-tighten.

# Confirming a Meta app is alive (not deleted)

Do not trust a second-hand "the app was deleted" claim. Verify with a client_credentials
token exchange against Graph:
`GET /v21.0/oauth/access_token?client_id=<id>&client_secret=<secret>&grant_type=client_credentials`,
then `GET /v21.0/<id>?fields=id,name`. A successful exchange + app info means the app is
live and the secret matches it.

**Why:** A prior session concluded the Spiral app `1348945556722394` was deleted and
rewrote docs/plan around a "surviving dashboard app." The Graph check proved it was alive
("name":"Spiral"), so that whole premise was false.

**How to apply:** Run the exchange from the server runtime (env vars are not present in the
code-execution sandbox; use bash/node with `process.env`). Never print the secret value.
