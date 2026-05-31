---
name: store_settings ghost rows
description: Why single-tenant store_settings lookups must order blank shop_domain rows last
---

# store_settings ghost rows

`store_settings` is treated as single-tenant (one connected merchant), but the
merchant dashboard's older Instagram-OAuth flow could write a **ghost row** with
a blank/empty `shop_domain` (IG data landed on a row that never got the shop
domain). That means more than one row can exist.

**Rule:** any lookup that does `LIMIT 1` on `store_settings` must order
non-blank-`shop_domain` rows first (then stable by `id`), or it can
non-deterministically return the ghost and shadow the real merchant.

**Why:** `getStoreSettings()` and `getStoreSettingsByInstagramBusinessId()` both
historically used `.limit(1)` with no ORDER BY. A ghost row could win and break
checkout gating / identity resolution intermittently.

**How to apply:** when adding any new `store_settings` read that expects "the"
settings row, mirror the ordering used in `getStoreSettings()`:
order by `case when shop_domain is null or shop_domain = '' then 1 else 0 end`,
then `asc(id)`. Ghost-row deletion is good cleanup but is a prod DB write and
should only happen after the real merchant row exists (e.g. after the dashboard
re-sync), so you never end up with zero connected store.

The dashboard upserts the customer app via `POST /api/merchants/register`
(`upsertStoreSettingsByDomain`, conflict target = `shop_domain`). `spiralEnabled`
is optional on that payload and only overwrites when explicitly sent, so older
dashboard builds leave the flag untouched.
