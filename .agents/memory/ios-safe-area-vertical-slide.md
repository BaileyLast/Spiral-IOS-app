---
name: iOS safe-area vertical slide on short screens
description: Why short non-scrolling Capacitor screens drag vertically a little, and the safe-area model that fixes it
---

Short, full-screen pages (Splash/Get Started, Login/Sign in) could be dragged vertically a few px on device even though native rubber-band bounce was already disabled via CSS `overscroll-behavior: none`. That's genuine overflow scroll, not bounce.

Root cause was two insets stacking:
1. `html` carries global `padding: env(safe-area-inset-*)` while pages used `min-h-screen` (= `100vh`). Document height = `100vh + topInset + bottomInset` > viewport, so it scrolls by the inset amount.
2. `capacitor.config.ts` `ios.contentInset: "always"` makes WKWebView add its OWN safe-area contentInset on top of the CSS env() handling — a redundant second inset whose scrollable range = the inset, so it scrolls regardless of CSS.

Fix applied:
- Added `.min-h-screen-safe` = `min-height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))` and used it instead of `min-h-screen` on the short non-scrolling roots.
- Set `ios.contentInset: "never"` so the web view stops double-insetting; safe areas are then owned solely by CSS.

**Why:** This app already covers safe areas in CSS in three places — global `html` env padding, per-page `safe-top`/`safe-bottom` utilities, and the bottom nav's own `bottom: max(1rem, env(safe-area-inset-bottom))`. So `contentInset:"never"` is safe globally: notch/home-indicator clearance survives without the native inset, and the redundant inset that caused the slide is gone.

**How to apply:** For any full-screen Capacitor page that should fill exactly without sliding, use `min-h-screen-safe` (or a fixed `calc()` height), keep safe-area handling in ONE layer, and prefer `contentInset:"never"` when CSS env() already handles insets. Native config changes (capacitor.config.ts) require `npx cap sync ios` + an Xcode rebuild to reach the device.
