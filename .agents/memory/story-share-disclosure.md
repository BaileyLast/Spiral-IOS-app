---
name: In-app Story share & disclosure
description: Why the web Story-share fallback bakes the disclosure into the photo and how the native iOS handoff differs (cross-repo contract).
---

# In-app Story composer: disclosure handling

The in-app Story composer hands a shopper's photo off to Instagram via three tiers:
native iOS bridge → Web Share (`navigator.share` with files) → download + open Instagram.

## Rule
- **Web/fallback tiers MUST bake the disclosure pill into the image** (canvas), because
  the web has no way to place a *movable* Instagram sticker, and a baked pixel can't be
  removed by the shopper.
- **The native iOS tier passes a CLEAN photo + a transparent disclosure sticker PNG +
  the brand shop URL**, so the iPhone app can place the disclosure as a movable
  Instagram sticker and the shop link as a link sticker.

**Why:** UK CMA influencer-disclosure rules require the paid-partnership disclosure to be
present and not trivially removable. A movable sticker is removable, so relying on it for
compliance is a legal risk — acceptable only on the native path where product/legal chose
the Instagram-native sticker UX. The web fallback can't guarantee a sticker survives, so it
burns the disclosure in.

## Cross-repo contract
- The native bridge is `window.webkit.messageHandlers.spiralStoryShare.postMessage({ backgroundImage, stickerImage, contentURL })`.
- **It is implemented in a SEPARATE iPhone-app repo, not this web repo.** This repo only
  defines the contract + the web fallbacks. If the handler is absent OR `postMessage`
  throws, we fall through to the web tiers (never strand the user on a broken native path).
- The disclosure label is a code-rendered default ("PAID PARTNERSHIP"); a branded Spiral
  PNG is meant to be swapped in later.

**How to apply:** Any change to the share flow must keep the baked-disclosure guarantee on
the web tiers, and must keep native failures falling through to web tiers.

## Native Story share needs a real Facebook App ID
`instagram-stories://share?source_application=<id>` REQUIRES a valid Facebook App ID as the
source. It lives in `ios/App/App/Info.plist` under `IGSourceApplicationID`. If blank,
`StoryShareViewController` falls back to the bundle id (`app.joinspiral.customer`), which is
NOT a valid FB App ID — Instagram then opens the Story composer but silently DROPS the
background image (empty Story). Symptom of a blank/invalid id is "Story opens but my photo
isn't there," which is easy to mistake for the bridge not firing.

**Why:** Instagram only accepts a shared-sticker payload from an app that identifies itself
with a recognized Meta app id; no Graph API scopes / app review / business verification are
needed for this pasteboard handoff — just the id + Instagram installed + the
`instagram-stories`/`instagram` schemes whitelisted in LSApplicationQueriesSchemes.
