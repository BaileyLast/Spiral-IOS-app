---
name: "@joinspiral Instagram token expiry"
description: Why the @joinspiral IGAA token breaks DM verification, why an expired one can't be refreshed, and how the app now self-heals.
---

# @joinspiral token expiry (IGAA…)

The @joinspiral access token (`SPIRAL_INSTAGRAM_ACCESS_TOKEN`, prefix `IGAA`) is an
Instagram **Login** token, not a Facebook Page token. It is long-lived but **expires
~60 days** after issue. When it lapses, DM 6-char code verification and story-sender
username lookups silently fail (`graph.instagram.com` returns OAuthException code 190
"Session has expired").

**Key gotcha:** an *already-expired* token CANNOT be refreshed. `refresh_access_token`
(`grant_type=ig_refresh_token`) only works on a token that is still valid AND at least
24h old. Once expired you must regenerate a fresh token in the Meta dashboard for
@joinspiral and update the secret — the app can't self-recover from a fully-lapsed token
without a new seed.

**Why:** DM verification "breaking" was diagnosed (wrongly, in an earlier pass) as a
deleted Meta app. The real cause was token expiry. Distinguish the two: a deleted app
fails app-level calls regardless of token; an expired token fails with code 190
"Session has expired" while the app itself is alive.

**How to apply:** If IG DM/story lookups fail, first check the token with a read-only
`graph.instagram.com/v21.0/me?fields=id,username` call. Code 190 / "session has expired"
= regenerate the token (don't go hunting for a deleted app). The app now persists the
token in `service_tokens` and auto-refreshes + self-heals on auth rejection; see the
"@joinspiral Token Auto-Refresh" section of replit.md for the mechanism.
