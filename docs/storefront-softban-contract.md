# Storefront soft-ban surface — contract & visual spec

Handoff for the merchant Shopify theme app extension repo (separate from
this codebase). Task #63. Companion to Task #62 (checkout widget).

## Why this exists

A soft-banned shopper today only sees the lock state when they reach
checkout. We want the storefront itself to communicate the lock — but
in a *motivating* way: show the discount **locked**, never hidden.
Hiding the value removes the lever to get the Story posted.

## Server contract — already shipped, no changes needed

The storefront widget calls the same endpoint as checkout:

```
POST /api/checkout/authenticate
Content-Type: application/json
{ "email": "...", "password": "..." }
```

On success (200) the response now carries (since Task #62):

```jsonc
{
  "authenticated": true,
  "customerId": "...",
  "email": "...",
  "firstName": "...",
  "lastName": "...",
  "instagramHandle": "@...",
  "instagramUserId": "...",
  "instagramGlobalUserId": "...",
  "followerCount": 0,

  // Soft-ban surface — all six fields are present on every success.
  // When softBanned === false the brand/owedOrderId/message fields are null.
  "softBanned": true | false,
  "softBannedReason": "story_owed" | "inherited_from_instagram" | "not_public" | "taken_down_early" | "delivery_pending" | null,
  "pendingVerificationCount": 0,
  "brandName": "Acme" | null,
  "owedOrderId": "uuid" | null,
  "softBanMessage": "Post your Story for your Acme order to unlock your next discount." | null
}
```

The same evaluator runs at `POST /api/checkout/calculate-discount` as a
pay-now safety net, so the storefront and checkout always agree.

### Auto-heal
`evaluateSoftBanForCheckout` (server side) clears stale bans and re-bans
drifted accounts on every call, so the storefront widget never needs to
poll or refresh — the value it sees at login is correct for the session.

## Visual spec

### 1. Persistent on-login banner
Thin amber strip at the top of every page (above the merchant header):

```
Your Spiral is on hold. Post your Story for your {brandName} order
to unlock discounts. [Check your Spiral app]
```

- On login: also fire a one-time toast/sheet with the same copy for
  visibility, then collapse into the persistent banner for the rest of
  the session.
- Dismissible (X icon) but re-appears on the next page navigation —
  this is a status, not a notification.
- CTA → universal-link helper (see §3).

### 2. Discount badge — locked variant
Wherever a Spiral discount badge renders (PDP, collection grid, search
results, recommendations), apply the locked variant when
`softBanned === true`:

- Append a small lock glyph to the badge.
- Slightly muted treatment (lower opacity background, full-opacity
  text — still legible, not greyed-into-broken).
- Tap / hover → small tooltip or bottom sheet:

  ```
  Locked
  Post your Story for your {brandName} order to unlock.
  [Check your Spiral app]
  ```

### 3. CTA helper — one shared function

```ts
function spiralAppLink(owedOrderId: string | null): string {
  // Universal link. iOS opens the Spiral app via the universal-link
  // entitlement when installed; falls back to the App Store listing
  // when not. Android falls back to the marketplace listing.
  if (!owedOrderId) return "https://spiral-app-1.replit.app/";
  return `https://spiral-app-1.replit.app/orders/${owedOrderId}`;
}
```

Both the banner CTA and every locked-badge tooltip CTA call this
helper. Do NOT use the raw `spiral://orders/{id}` scheme directly —
the universal link handles the install/no-install branching for us.

### 4. Cart line items
**No change.** Prices stay at full price. No struck-through "fake
discount". The locked badge on the product cards has already
communicated "20% available, locked" — the cart just shows what
they'd actually pay.

### 5. Checkout entry
Already handled by Task #62 — the checkout widget consumes the same
authenticate payload and renders its own on-hold screen.

## Copy rules (mirror Task #62 exactly)

The `softBanMessage` field already encodes these rules — use it as-is
where possible. For surfaces that want a different sentence structure,
the rules are:

| Case                          | Copy                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Single own owed order         | Post your Story for your **{brandName}** order to unlock your next discount.                                  |
| Multiple own owed orders      | Post your Stories for your **{pendingVerificationCount}** previous Spiral orders to unlock your next discount. |
| Inherited (via IG identity)   | Post your Story for your **{brandName}** order to unlock your next discount. This debt is linked to your Instagram account. |

The `brandName` and `owedOrderId` come from the most recent owed order
across the shopper's own orders + any orders inherited via shared
Instagram identity.

## Clean account
When `softBanned === false`, the storefront behaves exactly as today —
no banner, no locked badges, no tooltips. The widget should branch on
`softBanned` and skip rendering any of the lock UI entirely.

## Out of scope (do NOT do)
- Hiding the badges entirely (locked > hidden — see "Why this exists").
- Showing struck-through fake-discounted prices in the cart.
- Building any storefront-side debt evaluation. The server is the
  single source of truth. Read the fields from authenticate, render.
- Persisting soft-ban state across logout. On logout, clear and re-read
  from the next authenticate response.

## Reference files (this repo)
- `server/routes.ts` — `evaluateSoftBanForCheckout`, `/api/checkout/authenticate`
- `shared/schema.ts` — soft-ban columns on `spiral_customers`
- `replit.md` — Soft-Ban Model section
