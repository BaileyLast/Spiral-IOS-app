---
name: Native iOS external links & keyboard
description: WKWebView silently drops _blank links; iOS keyboard hides auth submit button. How the thin client handles both.
---

# Native iOS external links & keyboard

In the Capacitor iOS WebView (WKWebView), `window.open(url, "_blank")` and plain
`<a target="_blank">` clicks **silently do nothing** — there is no browser tab to
open into, so "open Instagram / open this product / open help" links appear dead.

**Rule:** every external (off-app) URL must go through `openExternalUrl()` in
`client/src/lib/native.ts`, which calls the `@capacitor/browser` `Browser.open()`
on native (an in-app Safari view that also hands off to the Instagram app for
ig.me / instagram.com), and falls back to `window.open` on the web. For anchors,
keep `href` + `target="_blank"` for web accessibility/long-press and add an
`onClick` that `preventDefault()`s and calls `openExternalUrl`.

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
`@capacitor/browser` / `@capacitor/keyboard` without a version pulls v8 and fails
the peer-dep resolve — pin `@^7.0.0`. After adding plugins, the Mac must run
`npm install` + `npx cap sync ios` before the next native build.
