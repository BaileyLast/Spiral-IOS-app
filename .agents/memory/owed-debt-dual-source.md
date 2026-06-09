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
