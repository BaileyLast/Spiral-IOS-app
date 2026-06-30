---
name: iOS safe-area model for the Capacitor thin client
description: How safe areas (notch / home indicator) are handled across screens, and the env()/viewport-fit dependency that makes it all work
---

THE #1 GOTCHA: `env(safe-area-inset-*)` is completely inert — resolves to 0 — unless the viewport meta in `client/index.html` includes `viewport-fit=cover`. Every safe-area CSS rule in the app silently does nothing without it. If insets "aren't working on device," check this first.

**Why:** With `capacitor.config.ts` `ios.contentInset: "never"` (native adds NO inset) AND no `viewport-fit=cover` (CSS env() = 0), the app had ZERO safe-area protection — content under the notch, bottom nav under the home indicator. Turning on `viewport-fit=cover` activates env() for the first time.

The app uses a **per-screen** safe-area model, NOT a global `html { padding: env(...) }`. **Why:** several routes are intentionally full-bleed colored (Splash gradient, Login, InstagramHelp gradient, StoryComposer black) — their background must extend under the notch/home bar. A global html padding white-bars those screens and double-insets every page that already pads itself.

The model (all in CSS / components, no native inset):
- **Bottom-nav "shell" pages** (Home, Marketplace, Orders, OrderDetail, MerchantProducts, Profile): the top inset is applied ONCE on the shell wrapper in `App.tsx` (`safe-top` added only when `!hideBottomNav`). So the conditionally-rendered Connect-Instagram banner and the page below it don't stack two top insets. **How to apply:** these shell pages must therefore NOT carry their own `safe-top`, and must use `min-h-screen-safe` (= `calc(100vh - top - bottom)`) instead of `min-h-screen`, or they overflow/slide inside the now-padded wrapper.
- **Full-bleed / hide-bottom-nav pages** own their own insets: Splash & Login use `min-h-screen` (fill viewport) + `safe-top` + bottom env; InstagramHelp puts `safe-top` on its scrolling content div; Privacy/DataDeletion put `safe-top` on the sticky header + `safe-bottom` on main; VerifyEmail uses inner `safe-top safe-bottom`; ManageAccount uses root `safe-top`.
- **Fixed elements carry their OWN env()** because fixed positioning escapes any ancestor padding: BottomNav (`bottom: max(1rem, env(safe-area-inset-bottom))`) and StoryComposer (`fixed inset-0` + `safe-top`).

Quirks:
- `.safe-top` / `.safe-bottom` set an ABSOLUTE padding value, so on the SAME element as a `py-*` they OVERRIDE that side (content lands at the safe-area boundary), they don't add. Put base spacing on a different (inner) element, or use `calc(env(...) + base)` if you need both.
- `min-h-screen-safe` is the right height for a screen sitting inside a padded ancestor; full-bleed screens with no padded ancestor should use plain `min-h-screen` so their background fills the viewport with no bottom gap.

**How to apply (deploy):** changes to `capacitor.config.ts` OR the viewport meta require `npx cap sync ios` + an Xcode rebuild to reach the device — a CSS-only change still needs `npm run build` + `npx cap sync ios` + rebuild.
