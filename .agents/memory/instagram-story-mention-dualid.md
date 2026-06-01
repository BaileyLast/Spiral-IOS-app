---
name: Instagram Login story-mention dual-id trap
description: Why story mentions silently fail to verify after a merchant migrates to Instagram Login — and the safe single-tenant fallback.
---

# Instagram Login story-mention dual-id trap

Instagram-Login (IGAA) accounts expose TWO ids: an app-scoped `id` and a global
`user_id`. A merchant can be registered in `store_settings` with the app-scoped
`id` in both `instagram_business_account_id` and `instagram_page_id`, while the
`story_mention` webhook delivers `entry.id` = the **global `user_id`**. They never
match, so the merchant-identity gate in the story handler bails before resolving
the sender — `merchant_scoped_user_map` stays empty and **no order ever verifies**.

**Symptom:** webhook is received (last_webhook_received_at gets stamped) but no
verification, no scoped-map row. Token can be perfectly healthy. Logs are an
unreliable confirmation source in prod (the platform samples out JSON bodies and
diag lines); confirm via prod DB instead.

**Why the gate can't just be deleted:** dropping the merchant check would let a
story tagging a DIFFERENT account we're subscribed to (e.g. @joinspiral, which has
its own `store_settings` row) verify this merchant's owed orders — a verification
bypass.

**Safe fix (single-tenant):** on mismatch, accept ONLY when the webhook id matches
NO store row at all (the genuine dual-id case). If the id belongs to another store
row, reject. Use `getAllStoreSettings()` for the check. Internal-API lookups
(`getStoreSettingsByInstagramBusinessId`) may fall back to the single real store on
a miss, but webhook verification must keep the strict "not another account" guard.

**How to apply:** the real cure is the merchant dashboard registering merchants
with the webhook id (`user_id`), not the app-scoped `id`. The fallback is a
read-path safety net that survives dashboard re-registration; it does not fix the
dashboard's stored id.
