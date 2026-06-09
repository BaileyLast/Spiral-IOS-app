---
name: Owed-debt accounting has two sources that must stay in sync
description: isOrderOwed (schema) and the inherited-debt SQL query (storage) both encode owed-state rules; change both together.
---

Owed-state ("does this order still owe a Story?") is encoded in TWO places that
must mirror each other:

1. `isOrderOwed(o)` in `shared/schema.ts` — the canonical, in-memory predicate.
2. `getOwedOrdersByInstagramIdentity` in `server/storage.ts` — a raw Drizzle SQL
   `where` clause that re-implements the same rules for the IG-sibling
   inherited-debt sweep (it can't call isOrderOwed because it runs in SQL).

**Why:** They drifted once — terminal statuses (`cancelled`/`refunded`) were
added to `isOrderOwed` but the SQL query still counted a `taken_down_early`
order as owed regardless of status, so a refunded/cancelled order could keep a
shopper soft-banned via the inherited-debt path even though their own-owed count
was zero. `maybeAutoUnbanCustomer` only clears when BOTH own-owed and
sibling-IG-owed are zero, so the stale SQL path silently blocked auto-unban.

**How to apply:** Any change to owed-state semantics (new terminal status, new
verification state, delivery-gating tweak) must update BOTH the predicate and the
SQL query in lockstep. The shared constants (`OWED_VERIFICATION_ANYDELIVERY`,
`OWED_VERIFICATION_DELIVERED_ONLY`, `TERMINAL_ORDER_STATUSES`) live in schema and
are imported by the SQL query to reduce drift, but the query's boolean structure
is hand-written — verify it still matches isOrderOwed's logic.

## Refund release is per-item discount-aware (deliberate conservative HOLD)

The `refunds/create` webhook releases a shopper only when they keep NO
Spiral-discounted line item. "Discounted item" is detected via Shopify line-item
`discount_allocations` (sum > 0) — the SAME signal the orders/create handler uses
to record per-item `discountedAmount`. Kept qty = ordered qty − total refunded qty
summed across all `refunds[].refund_line_items`.

**Why:** If `discount_allocations` is absent/empty we cannot tell which items were
discounted, so we HOLD (keep owing) — never release. HOLD is the safe direction
(a wrong HOLD is recoverable; a wrong RELEASE hands out a free pass). Do NOT try to
"fix" a missing-allocations HOLD by correlating the stored `lineItems` JSON: those
rows carry `discountedAmount` but NO Shopify `line_item_id`, so they can't be
matched to refund quantities. An architect review flagged this as a gap; it is an
intentional, scoped decision, not an oversight.

**How to apply:** Keep refund release detection on `discount_allocations`. Any
future change must preserve the conservative HOLD on undeterminable discount data.
