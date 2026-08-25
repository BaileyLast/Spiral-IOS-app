import { useState, useEffect, useRef } from "react";
import { X, Loader2, Instagram, Copy, Check, ShieldCheck, ShoppingBag, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Instagram Story frame: full-screen 9:16.
const STORY_W = 1080;
const STORY_H = 1920;

interface StoryProduct {
  name: string;
  imageUrl: string;
  /**
   * Unit price, when Core includes it on the order's line items. Optional —
   * older orders (and Core today) may not send it. Used only to rank which
   * products make the capped collage; never displayed.
   */
  price?: number | null;
}

// The collage caps at 4 photos (a clean 2x2). More than that makes the image
// very tall, shrinks every photo, and Instagram crops the top/bottom.
const MAX_COLLAGE_IMAGES = 4;

// Template kit from Spiral Core (storyType === "default_template"). Every field
// can be null — the renderer degrades gracefully and the caller falls back to
// the legacy composition when the kit can't produce a Story at all.
export interface StoryTemplateKit {
  backgroundImageUrl: string | null;
  backgroundSource: "lifestyle" | "product" | null;
  productImages?: { productId: string; imageUrl: string | null; price?: number | string | null }[] | null;
  logoUrl: string | null;
  logoSource: "custom" | "default" | null;
  instagramHandle: string | null;
  /** Merchant-facing display name for the AD disclosure (additive Core field). */
  brandName?: string | null;
}

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  /** Merchant handle without a leading @. */
  merchantHandle: string;
  /** Merchant display/store name, used by the baked AD disclosure. */
  merchantBrandName?: string | null;
  /**
   * Core's storyType for this order. "brand_imagery" = finished creative,
   * "default_template" = compose from templateKit. Unknown/missing values fall
   * back to the legacy composition — never crash on new enum values.
   */
  storyType?: string | null;
  /** Template kit, present when storyType === "default_template". */
  templateKit?: StoryTemplateKit | null;
  /** Brand's public shop URL, used for the native link sticker when available. */
  shopUrl?: string | null;
  /**
   * Brand-supplied Story creative image(s) from Spiral Core. Preferred over the
   * purchased product photos. One image is used as-is; several become a collage.
   */
  creativeUrls?: (string | null | undefined)[];
  /** Purchased product images, used as the fallback when no brand creative exists. */
  products?: StoryProduct[];
  /**
   * True while the source images are still being fetched from Core. Keeps the
   * composer in its loading state instead of flashing the empty state.
   */
  sourcePending?: boolean;
  /** True when fetching the source images from Core failed. Shows the error state. */
  sourceError?: boolean;
  /** Re-runs the Core source fetch when the shopper taps "Try again". */
  onRetrySource?: () => void;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

const FONT_STACK = `-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

function cleanDisclosureBrandName(value: string | null | undefined): string | null {
  const clean = (value || "").replace(/^@+/, "").trim().replace(/\s+/g, " ");
  return clean || null;
}

function normalizeDisclosureBrandName(value: string | null | undefined): string {
  return (cleanDisclosureBrandName(value) || "BRAND").toLocaleUpperCase();
}

// Draws the permanent "AD · BRAND NAME" disclosure, bottom-centered. The AD is
// intentionally bolder than the merchant name, and long names shrink to fit.
function bakeDisclosure(
  ctx: CanvasRenderingContext2D,
  imageWidth: number,
  imageHeight: number,
  brandName: string,
) {
  const name = normalizeDisclosureBrandName(brandName);
  let detail = ` · ${name}`;
  const maxPillW = imageWidth * 0.84;
  const minFontSize = Math.max(14, Math.round(imageWidth * 0.017));
  let fontSize = Math.max(18, Math.round(imageWidth * 0.028));
  let adW = 0;
  let detailW = 0;
  let padX = 0;

  // Preserve the full merchant name where possible, shrinking only when it
  // would make the compact badge too wide for the Story.
  do {
    padX = Math.round(fontSize * 0.72);
    ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
    adW = ctx.measureText("AD").width;
    ctx.font = `500 ${fontSize}px ${FONT_STACK}`;
    detailW = ctx.measureText(detail).width;
    if (adW + detailW + padX * 2 <= maxPillW || fontSize <= minFontSize) break;
    fontSize -= 1;
  } while (fontSize >= minFontSize);

  // An unusually long store name may still exceed the cap at the minimum font
  // size. Ellipsize only in that final edge case so the text never leaves the
  // pill or Story frame.
  if (adW + detailW + padX * 2 > maxPillW) {
    const availableDetailW = Math.max(0, maxPillW - adW - padX * 2);
    let fittedName = name;
    ctx.font = `500 ${fontSize}px ${FONT_STACK}`;
    while (
      fittedName.length > 1 &&
      ctx.measureText(` · ${fittedName}…`).width > availableDetailW
    ) {
      fittedName = fittedName.slice(0, -1);
    }
    detail = ` · ${fittedName}${fittedName.length < name.length ? "…" : ""}`;
    detailW = ctx.measureText(detail).width;
  }

  const pillH = Math.round(fontSize * 1.9);
  const pillW = Math.min(maxPillW, Math.round(adW + detailW + padX * 2));
  const x = Math.round((imageWidth - pillW) / 2);
  const y = imageHeight - Math.round(imageWidth * 0.045) - pillH;

  ctx.save();
  ctx.fillStyle = "rgba(20,20,20,0.78)";
  roundRect(ctx, x, y, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const textX = x + Math.max(padX, Math.round((pillW - adW - detailW) / 2));
  ctx.font = `800 ${fontSize}px ${FONT_STACK}`;
  ctx.fillText("AD", textX, y + pillH / 2 + 1);
  ctx.font = `500 ${fontSize}px ${FONT_STACK}`;
  ctx.fillText(detail, textX + adW, y + pillH / 2 + 1);
  ctx.restore();
}

// Loads an image with CORS enabled so it can be drawn to a canvas and exported
// without tainting it. Remote product/creative images (Shopify CDN, S3) must
// serve CORS headers; if they don't the load rejects and the caller skips it.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!(img.naturalWidth || img.width)) {
        reject(new Error("image-empty"));
        return;
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
}

// Square cell size + gap for the collage grid.
const CELL = 540;
const GAP = 10;

// Cover-fits an image into the given cell rect (fill + center-crop, no
// distortion), clipped to the cell so it never bleeds into neighbours.
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// Contain-fits an image into the given rect (no cropping, no distortion),
// centered. Used for product shots inside their white cards and the brand logo.
function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.min(w / iw, h / ih);
  const dw = iw * s;
  const dh = ih * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// The finished Story image. The disclosure is always permanently baked in
// before the image reaches preview or the native Instagram bridge.
interface ComposedStory {
  image: string;
}

function exportStory(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  brandName: string,
): ComposedStory {
  bakeDisclosure(ctx, canvas.width, canvas.height, brandName);
  return { image: canvas.toDataURL("image/jpeg", 0.92) };
}

// Renders a single image as-is (brand-supplied finished creative — Core already
// sized it; our only job is the disclosure).
function bakeSingle(img: HTMLImageElement, brandName: string): ComposedStory {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("image-empty");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");
  ctx.drawImage(img, 0, 0);
  return exportStory(canvas, ctx, brandName);
}

// Composes several images into a tidy 2-column collage. An odd final image
// spans the full width so the grid never has a hole. (Legacy fallback path.)
function bakeCollage(imgs: HTMLImageElement[], brandName: string): ComposedStory {
  const n = imgs.length;
  const cols = 2;
  const rows = Math.ceil(n / cols);
  const W = cols * CELL;
  const H = rows * CELL;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const remaining = n - idx;
    if (r === rows - 1 && remaining === 1) {
      drawCover(ctx, imgs[idx], GAP / 2, r * CELL + GAP / 2, W - GAP, CELL - GAP);
      idx++;
    } else {
      for (let c = 0; c < cols && idx < n; c++) {
        drawCover(
          ctx,
          imgs[idx],
          c * CELL + GAP / 2,
          r * CELL + GAP / 2,
          CELL - GAP,
          CELL - GAP,
        );
        idx++;
      }
    }
  }

  return exportStory(canvas, ctx, brandName);
}

// ---------------------------------------------------------------------------
// Branded 1080×1920 Story template (storyType === "default_template").
// Full-bleed background, brand logo top, 1–4 rounded product cards, and the
// baked AD disclosure. Returns null when the kit can't produce a
// Story (no/broken background AND no product images), so the caller can fall
// back to the legacy composition.

// Draws a rounded white card with a subtly rounded inner image area. The inner
// panel keeps opaque product shots soft at the corners while transparent PNGs
// remain naturally centred over a clean backdrop.
function drawProductCard(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#F7F6F3";
  roundRect(ctx, x, y, w, h, 44);
  ctx.fill();
  ctx.restore();

  const pad = Math.round(Math.min(w, h) * 0.09);
  const imageX = x + pad;
  const imageY = y + pad;
  const imageW = w - pad * 2;
  const imageH = h - pad * 2;
  const imageRadius = Math.round(Math.min(imageW, imageH) * 0.065);

  // An almost-white inner panel makes the smaller rounded image boundary
  // visible without competing with the product or the outer card.
  ctx.save();
  ctx.fillStyle = "#FFFFFF";
  roundRect(ctx, imageX, imageY, imageW, imageH, imageRadius);
  ctx.fill();
  roundRect(ctx, imageX, imageY, imageW, imageH, imageRadius);
  ctx.clip();
  drawContain(ctx, img, imageX, imageY, imageW, imageH);
  ctx.restore();
}

// Lays out 1–4 product cards per the mockups within the central band.
function drawProductGrid(ctx: CanvasRenderingContext2D, imgs: HTMLImageElement[], centerY: number) {
  const AREA_W = 900;
  const left = (STORY_W - AREA_W) / 2;
  const G = 24;
  const half = (AREA_W - G) / 2; // 438
  const n = Math.min(imgs.length, 4);
  if (n === 1) {
    drawProductCard(ctx, imgs[0], left, centerY - AREA_W / 2, AREA_W, AREA_W);
  } else if (n === 2) {
    const y = centerY - half / 2;
    drawProductCard(ctx, imgs[0], left, y, half, half);
    drawProductCard(ctx, imgs[1], left + half + G, y, half, half);
  } else if (n === 3) {
    // One large card above two side-by-side.
    const bigH = 560;
    const totalH = bigH + G + half;
    const top = centerY - totalH / 2;
    drawProductCard(ctx, imgs[0], left + (AREA_W - 620) / 2, top, 620, bigH);
    drawProductCard(ctx, imgs[1], left, top + bigH + G, half, half);
    drawProductCard(ctx, imgs[2], left + half + G, top + bigH + G, half, half);
  } else {
    // 2×2 grid.
    const totalH = half * 2 + G;
    const top = centerY - totalH / 2;
    drawProductCard(ctx, imgs[0], left, top, half, half);
    drawProductCard(ctx, imgs[1], left + half + G, top, half, half);
    drawProductCard(ctx, imgs[2], left, top + half + G, half, half);
    drawProductCard(ctx, imgs[3], left + half + G, top + half + G, half, half);
  }
}

async function composeTemplate(
  kit: StoryTemplateKit,
  brandName: string,
  loadAll: (urls: string[]) => Promise<HTMLImageElement[]>,
): Promise<ComposedStory | null> {
  const isWeb = (u: unknown): u is string => typeof u === "string" && /^https?:\/\//i.test(u);
  const productUrls = (kit.productImages ?? [])
    .map((p) => p?.imageUrl)
    .filter(isWeb)
    .slice(0, 4);
  const [prodImgs, bgImg, logoImg] = await Promise.all([
    loadAll(productUrls),
    isWeb(kit.backgroundImageUrl) ? loadImage(kit.backgroundImageUrl).catch(() => null) : Promise.resolve(null),
    isWeb(kit.logoUrl) ? loadImage(kit.logoUrl).catch(() => null) : Promise.resolve(null),
  ]);
  // Nothing visual to work with → let the caller use the legacy fallback.
  if (!bgImg && !prodImgs.length) return null;

  const canvas = document.createElement("canvas");
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");

  // Background: lifestyle photos go full-bleed; a substituted product shot gets
  // blurred so it reads as a backdrop, not a squashed product photo.
  ctx.fillStyle = "#141414";
  ctx.fillRect(0, 0, STORY_W, STORY_H);
  if (bgImg) {
    const blur = kit.backgroundSource === "product";
    ctx.save();
    if (blur && "filter" in ctx) {
      ctx.filter = "blur(42px)";
      // Overscan so the blur doesn't reveal transparent edges.
      const iw = bgImg.naturalWidth || bgImg.width;
      const ih = bgImg.naturalHeight || bgImg.height;
      const s = Math.max(STORY_W / iw, STORY_H / ih) * 1.12;
      ctx.drawImage(bgImg, (STORY_W - iw * s) / 2, (STORY_H - ih * s) / 2, iw * s, ih * s);
    } else {
      drawCover(ctx, bgImg, 0, 0, STORY_W, STORY_H);
    }
    ctx.restore();
    // Soft darkening for legibility (a bit heavier over a blurred product shot).
    ctx.fillStyle = blur ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.30)";
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    const grad = ctx.createLinearGradient(0, STORY_H * 0.62, 0, STORY_H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
  }

  // Brand logo, centered near the top.
  if (logoImg) {
    drawContain(ctx, logoImg, (STORY_W - 460) / 2, 110, 460, 190);
  }

  // Product cards in the central band.
  if (prodImgs.length) {
    drawProductGrid(ctx, prodImgs, 985);
  }

  return exportStory(canvas, ctx, brandName);
}

// Native iOS Share-to-Stories bridge. The separate iPhone-app repo implements a
// `spiralStoryShare` WKWebView message handler that places the photo as the
// Story background and shopUrl as a link sticker. The disclosure is already
// baked into the background; stickerImage is explicitly null for compatibility
// with the existing native contract.
function tryNativeBridge(
  backgroundImage: string,
  contentURL?: string | null,
): boolean {
  const w = window as any;
  const handler = w?.webkit?.messageHandlers?.spiralStoryShare;
  if (handler && typeof handler.postMessage === "function") {
    try {
      handler.postMessage({ backgroundImage, stickerImage: null, contentURL: contentURL ?? null });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

type Status = "loading" | "ready" | "empty" | "error";

export default function StoryComposer({
  open,
  onClose,
  merchantHandle,
  merchantBrandName,
  shopUrl,
  creativeUrls,
  products,
  storyType,
  templateKit,
  sourcePending,
  sourceError,
  onRetrySource,
}: StoryComposerProps) {
  const { toast } = useToast();
  const [composed, setComposed] = useState<ComposedStory | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handle = `@${merchantHandle.replace(/^@/, "")}`;
  const disclosureBrandName =
    [
      templateKit?.brandName,
      merchantBrandName,
      templateKit?.instagramHandle,
      merchantHandle,
    ]
      .map(cleanDisclosureBrandName)
      .find((value): value is string => !!value) || "BRAND";

  // Source priority: brand-supplied creative image(s) first, then the purchased
  // product images as a fallback. Both are http(s)-guarded.
  const isWebUrl = (u: unknown): u is string =>
    typeof u === "string" && /^https?:\/\//i.test(u);
  const creatives = (creativeUrls ?? []).filter(isWebUrl);
  // Most expensive products first when prices are known; unpriced items keep
  // their original order after all priced ones (stable sort). The cap itself is
  // applied after images load, so a broken URL can't waste a collage slot.
  const productUrls = [...(products ?? [])]
    .sort((a, z) => (Number(z?.price) || 0) - (Number(a?.price) || 0))
    .map((p) => p.imageUrl)
    .filter(isWebUrl);
  // Template kit inputs participate in the rebuild key so a late-arriving or
  // changed kit re-composes the Story.
  const templateKey = templateKit
    ? [
        templateKit.backgroundImageUrl ?? "",
        templateKit.backgroundSource ?? "",
        templateKit.logoUrl ?? "",
        templateKit.brandName ?? "",
        templateKit.instagramHandle ?? "",
        ...(templateKit.productImages ?? []).map((p) => p?.imageUrl ?? ""),
      ].join("|")
    : "";
  const sourceKey = `${storyType ?? ""}##${merchantBrandName ?? ""}##${templateKey}##${creatives.join("|")}##${productUrls.join("|")}`;

  // Monotonic token so only the most recent build can mutate state.
  const buildVersion = useRef(0);

  // Loads a list of URLs, tolerating individual failures (e.g. a missing CORS
  // header) so one bad image doesn't sink the whole creative.
  const loadAll = async (urls: string[]) => {
    const loaded = await Promise.all(
      urls.map((u) => loadImage(u).then((img) => img).catch(() => null)),
    );
    return loaded.filter((x): x is HTMLImageElement => !!x);
  };

  const build = async () => {
    const version = ++buildVersion.current;
    setCopied(false);
    setComposed(null);
    // The source images come from Core: stay in loading while that request is
    // in flight, and surface the error state if it failed — only decide
    // "empty" once Core has answered with nothing usable.
    if (sourcePending) {
      setStatus("loading");
      return;
    }
    if (sourceError) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    // Branded template path (storyType === "default_template"): compose the
    // full-screen 1080×1920 Story from Core's kit. If the kit can't produce a
    // Story (missing/broken assets), fall through to the legacy composition —
    // and unknown future storyType values also fall through, never crash.
    if (storyType === "default_template" && templateKit) {
      try {
        const out = await composeTemplate(templateKit, disclosureBrandName, loadAll);
        if (version !== buildVersion.current) return;
        if (out) {
          setComposed(out);
          setStatus("ready");
          return;
        }
      } catch {
        if (version !== buildVersion.current) return;
        // Fall through to the legacy composition below.
      }
    }
    if (!creatives.length && !productUrls.length) {
      setStatus("empty");
      return;
    }
    try {
      // Try the brand creative first; if it's present but nothing loads, fall
      // back to the product images before giving up.
      let imgs: HTMLImageElement[] = [];
      if (creatives.length) imgs = await loadAll(creatives);
      if (!imgs.length && productUrls.length) imgs = await loadAll(productUrls);
      if (version !== buildVersion.current) return;
      if (!imgs.length) {
        setStatus("error");
        return;
      }
      imgs = imgs.slice(0, MAX_COLLAGE_IMAGES);
      const out =
        imgs.length === 1
          ? bakeSingle(imgs[0], disclosureBrandName)
          : bakeCollage(imgs, disclosureBrandName);
      if (version !== buildVersion.current) return;
      setComposed(out);
      setStatus("ready");
    } catch {
      if (version !== buildVersion.current) return;
      setStatus("error");
    }
  };

  useEffect(() => {
    if (open) void build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceKey, sourcePending, sourceError]);

  if (!open) return null;

  // "Try again" re-runs the Core fetch when that's what failed; otherwise it
  // just rebuilds from the images we already have (e.g. an image-load failure).
  const handleRetry = () => {
    if (sourceError) {
      setStatus("loading");
      onRetrySource?.();
      return;
    }
    void build();
  };

  const close = () => {
    setComposed(null);
    setCopied(false);
    onClose();
  };

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      toast({ title: "Tag copied", description: `${handle} is on your clipboard — paste it on your Story.` });
    } catch {
      // Clipboard can fail without a user gesture / permissions; non-fatal.
    }
  };

  const onShare = async () => {
    if (!composed) return;
    setSharing(true);
    await copyHandle();
    try {
      // The native Spiral iPhone bridge is the only supported sharing route.
      // It receives the final image with the disclosure permanently baked in.
      if (tryNativeBridge(composed.image, shopUrl)) {
        return;
      }
      toast({
        title: "Open this in the Spiral app",
        description: "Direct Instagram Story sharing is only available in the Spiral iPhone app.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col safe-top" data-testid="overlay-story-composer">
      <header className="flex items-center justify-between px-4 py-4">
        <button
          type="button"
          onClick={close}
          className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center"
          aria-label="Close"
          data-testid="button-composer-close"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white font-bold text-sm">Post your Story</span>
        <span className="w-10" />
      </header>

      {composed ? (
        <div className="flex-1 flex flex-col px-5 pb-6 overflow-y-auto">
          <div className="flex-1 flex items-center justify-center min-h-0">
            <img
              src={composed.image}
              alt="Your Story preview"
              className="max-h-[52vh] w-auto rounded-2xl object-contain"
              data-testid="img-story-preview"
            />
          </div>

          <ul className="mt-5 text-white/90 text-xs font-medium bg-white/10 px-4 py-3 rounded-2xl space-y-1.5 text-left">
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Your Story image is ready, with the disclosure added for you.</span>
            </li>
            <li className="flex items-start gap-2">
              <Instagram className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                Tag <span className="font-bold">{handle}</span> on your Story — we'll copy it for you to paste.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Keep it public and leave it up for 24 hours.</span>
            </li>
          </ul>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={onShare}
              disabled={sharing}
              className="tactile-btn bg-white text-black w-full py-4 text-lg flex items-center justify-center gap-2"
              data-testid="button-share-story"
            >
              {sharing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Instagram className="w-5 h-5" />}
              Share to Instagram
            </button>
            <button
              type="button"
              onClick={copyHandle}
              className="w-full py-3 font-bold text-white rounded-full bg-white/10 active:opacity-80 flex items-center justify-center gap-2"
              data-testid="button-copy-tag"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              Copy tag
            </button>
          </div>
        </div>
      ) : status === "loading" ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" data-testid="state-preparing">
          <Loader2 className="w-10 h-10 animate-spin text-white mb-5" />
          <p className="text-white/80 text-sm">Preparing your Story…</p>
        </div>
      ) : status === "error" ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" data-testid="state-error">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6">
            <RefreshCw className="w-9 h-9 text-white" />
          </div>
          <h2 className="text-white text-2xl font-black mb-2">Couldn't load the image</h2>
          <p className="text-white/70 text-sm mb-8 max-w-[280px]">
            Something went wrong preparing your Story. Please try again.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="tactile-btn bg-white text-black w-full max-w-[320px] py-4 text-lg flex items-center justify-center gap-2"
            data-testid="button-retry"
          >
            <RefreshCw className="w-5 h-5" />
            Try again
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" data-testid="state-empty">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6">
            <ShoppingBag className="w-9 h-9 text-white" />
          </div>
          <h2 className="text-white text-2xl font-black mb-2">Your Story is being prepared</h2>
          <p className="text-white/70 text-sm max-w-[280px]">
            We don't have a Story image for this order just yet. Please check back shortly.
          </p>
        </div>
      )}
    </div>
  );
}
