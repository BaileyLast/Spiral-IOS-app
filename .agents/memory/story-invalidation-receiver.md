---
name: Story invalidation receiver
description: How admin Story rejections flow into this app and re-ban shoppers (derived, handle-keyed)
---

# Story invalidation receiver (`POST /api/internal/stories/invalidate`)

When a merchant-dashboard (later CRM) admin rejects a flagged Story, the dashboard fires
`{ verificationId, instagramHandle, shopDomain }` to this app. This app resets the shopper's
most-recent posted order to pre-post and lets the EXISTING soft-ban evaluator re-ban.

**Why derived, not a forced ban:** the user explicitly chose to NOT add an external "ban this
customer" command. Resetting the order to `pending` makes it owed again, so
`evaluateSoftBanForCheckout` re-applies the soft-ban on its own. Keeps one source of truth for
ban state.

**Why handle is the lookup key (and its gap):** the dashboard runs a SEPARATE database, so its
`verificationId` is opaque here (log-only) and it does NOT send our immutable global IG id. We
look up by `instagramHandle`. Handles are mutable, so a rename between post and reject can miss —
logged as a warning, returns success (best-effort caller). Future fix: have the caller send the
global IG id.

**How to apply / gotchas:**
- Idempotent + non-fatal: no-match and already-reset both return `{success:true}` no-op.
- Must cancel ALL incomplete publicity checks for the verification (bulk), not just one row, or a
  scheduled quick/final check re-mutates the order after reset.
- The publicity worker (`processPublicityChecks`) does a slow scrape, creating a race window: it
  re-reads each check fresh right after the scrape and skips status writes if it was
  completed/cancelled mid-flight. Any new terminal write path in that worker needs the same guard.
- Pick the target order by Story-post time (`verification.storyDetectedAt`), not `order.createdAt`.
