---
name: Native iOS external links & keyboard
description: WKWebView silently drops _blank links; iOS keyboard hides auth submit button. How the thin client handles both.
---

# Native iOS external links & keyboard

In the Capacitor iOS WebView (WKWebView), `window.open(url, "_blank")` and plain
`<a target="_blank">` clicks **silently do nothing** — there is no browser tab to
open into, so "open Instagram / open this product / open help" links appear dead.

**Rule:** every external (off-app) URL must go through `client/src/lib/native.ts`.
Two helpers, two purposes:
- `openExternalUrl()` — for ordinary web pages you want to keep the user inside
  the app for (product pages, help articles). Uses `@capacitor/browser`
  `Browser.open()` (an in-app Safari view = SFSafariViewController) on native,
  `window.open` on web.
- `openInstagram()` — for links that must launch the **native Instagram app**.
  Uses `@capacitor/app-launcher` `AppLauncher.openUrl()` (= `UIApplication.open`),
  falling back to `openExternalUrl` if it reports `completed:false` or throws.

For anchors, keep `href` + `target="_blank"` for web accessibility/long-press and
add an `onClick` that `preventDefault()`s and calls the right helper.

**CRITICAL gotcha:** `Browser.open()` / SFSafariViewController **NEVER hands off
to another app** — Instagram universal links (`ig.me`, `instagram.com`) opened
through it always render the *web* version, even when the IG app is installed.
Only `UIApplication.open` (via `@capacitor/app-launcher`) triggers universal-link
app handoff. HTTPS universal links need NO `LSApplicationQueriesSchemes` /
Info.plist entry (those are only for custom-scheme `canOpenUrl` checks).

**Why:** native shoppers reported tapping external links and nothing happening.
**How to apply:** when adding ANY link that leaves the app, route it through
`openExternalUrl`. `mailto:` is fine to leave as a raw anchor. Grep for
`target="_blank"` / `window.open` after link work to catch misses. (Note:
`VerificationsTable.tsx` has a raw `_blank` anchor but is dead/unrendered in the
customer client — skip unless it gets wired up.)

## Keyboard hiding the auth submit button
On iOS the soft keyboard covered the Login / Sign Up submit button. Fix is
`plugins.Keyboard.resize = KeyboardResize.Native` in `capacitor.config.ts`
(needs `@capacitor/keyboard`), which shrinks the WebView so the page can scroll
the focused field into view. This only works because `body`/`html` are scrollable
(only `overscroll-behavior: none`, no `overflow: hidden`).

## Capacitor plugin versions
Plugins must match the installed `@capacitor/core` major (currently 7). Installing
`@capacitor/browser` / `@capacitor/keyboard` / `@capacitor/app-launcher` without a
version pulls v8 and fails the peer-dep resolve — pin `@^7`. After adding plugins,
the Mac must run `npm install` + `npx cap sync ios` before the next native build.
