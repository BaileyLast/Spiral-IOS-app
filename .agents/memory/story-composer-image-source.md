---
name: Story composer image source
description: How the customer Story composer chooses/renders its ready-made image (merchant creative vs product template) and the CORS + fallback rules.
---

# Story composer image source

The customer Story composer no longer lets shoppers shoot or upload a photo. It
renders a ready-made 1080x1920 Story image from one of two sources, in order:

1. **Merchant creative** — `order.storyCreativeUrl` (optional; Spiral Core owns
   it and may leave it null). Cover-fit onto the frame.
2. **Product template** — branded green card built from a purchased product photo
   (`lineItems[].imageUrl`) with store name/logo. One product auto-features;
   multiple show a picker.

## Rules / gotchas
- All source images are remote and drawn to a canvas, so they MUST be loaded with
  `crossOrigin="anonymous"` or `toDataURL` throws a SecurityError (tainted
  canvas). Shopify CDN serves CORS; a creative on a non-CORS bucket fails to load.
- **Why:** a broken/CORS-blocked creative URL must DEGRADE to the product template
  (or picker) when product photos exist — not show a terminal error. "Creative
  present but unloadable" has to behave like "creative absent." (Caught in review.)
- The CMA disclosure pill is ALWAYS baked into the web/fallback image (`composed`);
  the native iOS `spiralStoryShare` bridge gets the clean image + a separate
  movable sticker. Never ship a web path without the baked pill.
