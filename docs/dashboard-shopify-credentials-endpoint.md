# Dashboard endpoint required: `GET /api/internal/shopify/credentials`

The Spiral customer app (this repo: `spiral-app-1`) used to run its own Shopify OAuth and store its own access token. That meant connecting Shopify in the merchant dashboard installed one Shopify app, and clicking through the customer app installed a *second* one — which silently wiped the dashboard's token, broke product images, and broke delivery tracking.

The fix is permanent: the customer app no longer stores a Shopify token. It now asks the merchant dashboard for the live credentials every time it needs them (with a 5-minute cache).

You (the dashboard) need to expose **one** new endpoint.

---

## Endpoint

```
GET /api/internal/shopify/credentials?shop=<domain>&instagramBusinessAccountId=<id>
```

- **Auth**: header `x-spiral-internal-key: <SPIRAL_INTERNAL_KEY>` (same shared secret you already use for `/api/instagram/story-mention` forwards). Reject with 401 if missing or wrong.
- **Query**: at least one of `shop` (e.g. `finleys-test.myshopify.com`) or `instagramBusinessAccountId` (the merchant's IG business account id) will be supplied. Look the merchant up by whichever is present; prefer `shop` when both are present.
- **200 response** (JSON):
  ```json
  {
    "shopDomain": "finleys-test.myshopify.com",
    "accessToken": "shpat_xxx",
    "storeName": "Finley's",
    "storeLogoUrl": "https://cdn.shopify.com/.../logo.png"
  }
  ```
  `storeName` and `storeLogoUrl` may be `null` if you don't have them. `shopDomain` and `accessToken` must both be non-empty.
- **404 response**: return 404 (no body needed) if no merchant matches. The customer app treats 404 as "not connected yet" and caches that for 5 minutes.

## Example (Node/Express)

```ts
import type { Request, Response } from "express";

app.get("/api/internal/shopify/credentials", requireInternalKey, async (req: Request, res: Response) => {
  const shop = typeof req.query.shop === "string" ? req.query.shop : null;
  const igId = typeof req.query.instagramBusinessAccountId === "string"
    ? req.query.instagramBusinessAccountId
    : null;

  if (!shop && !igId) {
    return res.status(400).json({ error: "shop or instagramBusinessAccountId required" });
  }

  // Replace this lookup with however you find a merchant on the dashboard.
  const merchant = shop
    ? await db.merchants.findByShopDomain(shop)
    : await db.merchants.findByInstagramBusinessAccountId(igId!);

  if (!merchant || !merchant.shopDomain || !merchant.accessToken) {
    return res.status(404).end();
  }

  res.json({
    shopDomain: merchant.shopDomain,
    accessToken: merchant.accessToken,
    storeName: merchant.storeName ?? null,
    storeLogoUrl: merchant.storeLogoUrl ?? null,
  });
});
```

## Verifying the wire

From any shell with the shared key:

```bash
curl -i "https://spiral-merchant-dashboard.replit.app/api/internal/shopify/credentials?shop=finleys-test.myshopify.com" \
  -H "x-spiral-internal-key: $SPIRAL_INTERNAL_KEY"
```

Expect either a 200 with the JSON above or a 404. Anything else (HTML, 401, 500) means the customer app will keep treating the merchant as "not connected".

## What the customer app does with this

`server/shopifyCredentials.ts` — 5-minute in-memory cache, 5-second timeout, negative-cached on 404. Called from:

- `POST /api/shopify/sync` — pulls Shopify products + collections.
- `POST /webhooks/shopify/orders-create` — fetches product images, derives store logo, fills in `shopDomain` for downstream order rows.
- `POST /api/internal/shopify/backfill-webhooks` — re-registers Shopify webhook topics against the dashboard's token.

If your `SPIRAL_MERCHANT_DASHBOARD_URL` is different from the prod URL, set that env var on the customer app to override.
