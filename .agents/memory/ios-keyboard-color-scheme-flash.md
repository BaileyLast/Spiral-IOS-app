---
name: iOS keyboard light-then-dark flash
description: WKWebView keyboard opens in the wrong appearance then corrects unless color-scheme is declared
---

The iOS keyboard briefly appears light (or dark) then snaps to the other on every
focus when the web page declares no `color-scheme`. WKWebView guesses an appearance,
renders the keyboard, then re-renders once it settles — visible as a flash.

**Why:** iOS derives keyboard chrome from the page's declared color scheme. With none
declared it falls back to the system/device setting first, then reconciles with the
actual page, causing the visible switch.

**How to apply:** This is a light-only app. Pin the scheme so the keyboard is correct
on first paint — set `color-scheme: light` on `:root` in `index.css` AND
`<meta name="color-scheme" content="light">` in `index.html`. Do both; the meta tag
covers the first paint before CSS applies.
