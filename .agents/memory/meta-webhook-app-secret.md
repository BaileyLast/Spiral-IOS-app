---
name: Meta webhook app secret + app-liveness checks
description: Which secret validates incoming Instagram/Meta webhook signatures, and how to confirm a Meta app is actually alive before assuming it was deleted.
---

# Meta webhook signature secret

Incoming Instagram/Meta webhook signatures (`x-hub-signature-256`) must be HMAC-validated
with the App Secret of the **app that owns the webhook subscription** — for Spiral that is
the Spiral app, whose credentials live in `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`.

The webhook handlers prefer `FACEBOOK_APP_SECRET` and fall back to the legacy
`INSTAGRAM_APP_SECRET` only if the former is unset. A *wrong* secret rejects real
webhooks with 403, silently dropping story mentions.

**Why:** Story-mention capture was "broken" partly because verification used
`INSTAGRAM_APP_SECRET` (a stale/other app's secret) while Meta signs with the Spiral
app's secret. Swapping to `FACEBOOK_APP_SECRET` fixed it.

**How to apply:** When webhooks 403 on signature, confirm which Meta app delivers them
and validate against that app's secret. To smoke-test: sign a payload locally with the
secret and POST it — valid sig → 200, wrong sig → 403.

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
