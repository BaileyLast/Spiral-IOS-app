---
name: iOS carousel tap-vs-swipe
description: Clickable items inside a horizontal scroller fire their click on a swipe in iOS WKWebView; how to tell a tap from a scroll gesture
---

In the Capacitor iOS WebView, a clickable element (e.g. an `<a>`/card) placed
inside a horizontal `overflow-x-auto` scroll container fires its `onClick` even
when the user is swiping to scroll. Result: the item opens instead of the
carousel scrolling, and only a tiny area ever scrolls. Desktop/mouse hides this
because the browser suppresses click after a drag; iOS WKWebView does not.

**Fix pattern (no library):** track the gesture on the scroll container, not the
item.
- `onTouchStart`: record `{x, y, startedAt: Date.now(), moved: false}` (reset per touch).
- `onTouchMove`: set `moved = true` once the finger travels past a small
  threshold (~10px in X or Y). Do NOT `preventDefault` — native momentum scroll
  and CSS scroll-snap must keep working.
- item `onClick`: `preventDefault` + `stopPropagation`, then only navigate when
  `!moved` AND the press was short (`Date.now() - startedAt <= ~500ms`). The
  duration guard makes a press-and-hold not count as a tap.

**Why:** users reported the marketplace product slider barely scrolled — any touch
opened the product. Movement-only detection fixes swipe; the duration guard
covers the explicit "holding shouldn't act like a tap" complaint.
**How to apply:** any tappable item living inside a scrollable lane in this app
needs this guard; a shared ref at the lane component scope is fine because only
one touch happens at a time.
