---
name: Story media pipeline ownership
description: This app (not the merchant dashboard) captures IG Story media to S3 and forwards only the permanent link.
---

# Story media pipeline lives in THIS app

When a shopper posts an IG Story tagging the merchant, Instagram's media URL is
short-lived. This customer app owns capturing it: on the story_mention webhook it
downloads the media while live, uploads a permanent copy to the shared AWS S3
bucket, and forwards ONLY the permanent S3 link to the merchant dashboard
(top-level `storyImageUrl` on the existing story-mention forward payload).

**Why:** Centralizing media capture here means the dashboard (and any future
ecommerce adapter) never has to race Instagram's expiry — they just store the
permanent link. Avoids every integration re-implementing download/upload.

**How to apply:**
- Capture is fire-and-forget so Meta's 200 ack is never blocked.
- Graceful degradation is intentional: if the four AWS_* secrets are missing or
  capture fails, the Story is still forwarded WITHOUT `storyImageUrl` (the raw
  entry still carries IG's ephemeral URL). Never drop a handoff to add a link.
- Media type (image vs video) must be decided by: specific HTTP content-type →
  magic-byte sniff → resolved media hint. IG sometimes serves video as
  `application/octet-stream`; trusting the header alone misclassifies video as a
  photo. Don't "simplify" this back to header-only.
- Any URL fetched from webhook/RapidAPI data is untrusted — run it through the
  SSRF guard (`isSafeProbeUrl`) and re-validate every redirect hop. Don't add a
  raw `fetch()` on shopper-supplied media URLs.
- `storyImageUrl` is persisted on the dashboard-forward retry-queue payload, so
  retries keep the permanent link. Permanent links never expire, so this is safe.
- Schema note: `npm run db:push` wants to drop an unrelated `session` table +
  `posting_window_days` column (pre-existing drift) — apply additive verification
  columns with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` instead.
