---
name: iOS opening the native Instagram app (not web)
description: Why https/universal links open Safari instead of the app in the Capacitor iOS shell, and the instagram:// scheme fix
---

To open the **Instagram app** (not the mobile web) from the Capacitor iOS shell,
you must hand iOS Instagram's **custom URL scheme** (`instagram://...`), not an
`https://` universal link.

**Why:** `AppLauncher.openUrl` calls `UIApplication.open`. Given an `https://`
Instagram link (e.g. `https://ig.me/m/joinspiral` or `https://instagram.com/<h>`),
iOS does NOT reliably route a *programmatically*-opened universal link into the
installed app — it opens Safari. Worse, `open` then reports `completed: true`
(Safari did open), so any "fall back only when not completed" logic never fires
and the user silently lands on the web. This looked "fixed" once by switching
from the in-app browser to AppLauncher, but AppLauncher with an https URL still
went to web.

**How to apply:**
- Convert the link to a scheme first: `instagram.com/<handle>` and the DM link
  `ig.me/m/<handle>` both map to `instagram://user?username=<handle>` (opens the
  profile in-app; there is no reliable public scheme for a direct DM compose —
  profile is one tap from Message, and the app copies the code to clipboard first).
- Try the `instagram://` URL via `AppLauncher.openUrl`; treat only
  `completed === true` as success. On `false`/throw, fall back to
  `openExternalUrl(originalHttpsUrl)` so a device without Instagram still works.
- The scheme must be whitelisted in `ios/App/App/Info.plist`
  `LSApplicationQueriesSchemes` (`instagram` is already there).
- Story sharing uses a different scheme entirely: `instagram-stories://share`
  (see AppDelegate.swift) — separate from profile/DM opening.

Lives in `client/src/lib/native.ts` (`openInstagram` + `instagramAppSchemeUrl`).
