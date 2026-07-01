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

**CRITICAL follow-up — the guard alone is NOT enough if the item is an `<a>`.**
The movement/duration guard silently fails when the scrollable items are anchor
(`<a href>`) elements: iOS WKWebView hijacks a drag that *starts on a link* as a
native link-drag/callout and cancels the touch sequence, so `onTouchMove` never
fires, `moved` stays false, the swipe doesn't scroll, and the release still fires
as a click → the product opens on every swipe. Fix that surfaced this:
- Render the item as a NON-anchor tappable element (`<div role="button" tabIndex={0}>`
  with `onClick` + `onKeyDown` calling `openExternalUrl`), not an `<a href>`.
- Kill the native drag/callout on it: `draggable={false}` plus inline
  `WebkitTouchCallout: "none"`, `WebkitUserSelect: "none"`, `userSelect: "none"`.
- On the scroll container set `touchAction: "pan-x pan-y"` (both axes, not `pan-x`
  alone — `pan-x` would stop vertical page scroll when swiping over the tall lane).
- Keep the movement + duration guard as the tap detector.
**Rule of thumb:** for a draggable/scrollable lane in the iOS webview, never use
`<a>` for the cards; use a div/button so the browser can't steal the gesture.
