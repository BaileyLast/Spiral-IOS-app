---
name: Quick publicity-check retries
description: Why the 3-min "is the Story public" quick check must retry before soft-banning, and how the retry budget is scoped.
---

# Quick publicity-check retries

The QUICK-stage publicity check (runs ~3 min after a Story webhook) must NOT treat the
first `not_public` from the RapidAPI scraper as final. A brand-new public Story is often
not yet indexed by the scraper at +3 min, which is indistinguishable from a Close
Friends / deleted Story → shoppers were wrongly soft-banned.

Fix: quick `not_public` reschedules on a short cadence and only finalizes (order →
`not_public`, soft-ban if delivered, failure push) after a grace window elapses. The
FINAL (10h) stage is unchanged — it still fails immediately to `taken_down_early`.

**Why time-based, not attempt-count based:** `publicity_checks.attempts` /
`recordPublicityCheckAttempt` increment a SINGLE shared counter for ALL outcomes
(scraper errors AND not_public). If the not_public terminal decision keys off that
counter, prior scraper-error retries silently consume the not_public budget and a real
Story can still be failed on its first not_public. So the quick not_public decision keys
off elapsed time since `webhook_received_at` (a notNull column on the row) instead —
fully independent of the error counter, no new schema column needed.

**How to apply:** keep retrying quick not_public while `now - webhookReceivedAt <
PUBLICITY_CHECK_QUICK_NOT_PUBLIC_WINDOW_MS`; finalize once past it. Scraper *errors*
(non-404 non-OK) stay on the attempts-count budget (PUBLICITY_CHECK_MAX_ATTEMPTS) and
never soft-ban. performPublicityScrape returns a discriminated `not_public` reason
(`http_404` | `empty_story_list` | `no_story_in_window`) + detail string for diagnosis,
logged on every quick not_public.
