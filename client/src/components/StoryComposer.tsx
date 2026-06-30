import { useState, useEffect, useRef } from "react";
import { X, Loader2, Instagram, Copy, Check, ShieldCheck, ShoppingBag, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { openInstagram } from "@/lib/native";

// Plain, CMA-friendly disclosure label. This is the working default rendered in
// the app; swap DISCLOSURE_LABEL for a Spiral-branded graphic later.
const DISCLOSURE_LABEL = "PAID PARTNERSHIP";

interface StoryProduct {
  name: string;
  imageUrl: string;
}

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  /** Merchant handle without a leading @. */
  merchantHandle: string;
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

// Draws the disclosure pill into the bottom-left corner of an image of the given
// width. The pill (and its font) scale with the image so it stays a small,
// legible badge regardless of the source image size.
function bakeDisclosure(ctx: CanvasRenderingContext2D, imageWidth: number, imageHeight: number) {
  const fontSize = Math.max(20, Math.round(imageWidth * 0.04));
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
  const metrics = ctx.measureText(DISCLOSURE_LABEL);
  const pillH = Math.round(fontSize * 2);
  const pillW = Math.round(metrics.width + fontSize * 1.8);
  const pad = Math.round(imageWidth * 0.035);
  const x = pad;
  const y = imageHeight - pad - pillH;
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  roundRect(ctx, x, y, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(DISCLOSURE_LABEL, x + fontSize * 0.9, y + pillH / 2 + 1);
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

// Renders a single image as-is (no reframe to a Story canvas) with the
// disclosure badge baked into the bottom-left corner.
function bakeSingle(img: HTMLImageElement): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error("image-empty");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");
  ctx.drawImage(img, 0, 0);
  bakeDisclosure(ctx, w, h);
  return canvas.toDataURL("image/jpeg", 0.92);
}

// Composes several images into a tidy 2-column collage with the disclosure badge
// baked in. An odd final image spans the full width so the grid never has a hole.
function bakeCollage(imgs: HTMLImageElement[]): string {
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

  bakeDisclosure(ctx, W, H);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function dataUrlToFile(dataUrl: string, filename: string): File | null {
  try {
    const [meta, b64] = dataUrl.split(",");
    const mime = /:(.*?);/.exec(meta)?.[1] || "image/jpeg";
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: mime });
  } catch {
    return null;
  }
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Native iOS Share-to-Stories bridge. The separate iPhone-app repo implements a
// `spiralStoryShare` WKWebView message handler that places the photo as the
// Story background and shopUrl as a link sticker. The disclosure is now baked
// into the photo, so no separate disclosure sticker is sent. Returns true if a
// native handler accepted the payload.
function tryNativeBridge(backgroundImage: string, contentURL?: string | null): boolean {
  const w = window as any;
  const handler = w?.webkit?.messageHandlers?.spiralStoryShare;
  if (handler && typeof handler.postMessage === "function") {
    try {
      handler.postMessage({ backgroundImage, stickerImage: null, contentURL: contentURL ?? null });
      // Native owns completion + error surfacing from here. We only treat a
      // throwing postMessage as "not handled" so we fall through to web tiers.
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
  shopUrl,
  creativeUrls,
  products,
  sourcePending,
  sourceError,
  onRetrySource,
}: StoryComposerProps) {
  const { toast } = useToast();
  const [composed, setComposed] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handle = `@${merchantHandle.replace(/^@/, "")}`;

  // Source priority: brand-supplied creative image(s) first, then the purchased
  // product images as a fallback. Both are http(s)-guarded.
  const isWebUrl = (u: unknown): u is string =>
    typeof u === "string" && /^https?:\/\//i.test(u);
  const creatives = (creativeUrls ?? []).filter(isWebUrl);
  const productUrls = (products ?? []).map((p) => p.imageUrl).filter(isWebUrl);
  const sourceKey = `${creatives.join("|")}##${productUrls.join("|")}`;

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
      const out = imgs.length === 1 ? bakeSingle(imgs[0]) : bakeCollage(imgs);
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
      // 1) Native iPhone app (link sticker), if present.
      if (tryNativeBridge(composed, shopUrl)) {
        return;
      }
      // 2) Web share sheet with the baked image.
      const file = dataUrlToFile(composed, "spiral-story.jpg");
      const canShareFile =
        !!file &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      if (canShareFile && file) {
        await navigator.share({ files: [file] });
        return;
      }
      // 3) Fallback: save the image and open Instagram for a manual post.
      downloadDataUrl(composed, "spiral-story.jpg");
      await openInstagram(`https://instagram.com/${merchantHandle.replace(/^@/, "")}`);
      toast({
        title: "Photo saved",
        description: "Open Instagram, add it to your Story, then paste the tag.",
      });
    } catch (err: any) {
      // AbortError = the user dismissed the share sheet; not an error.
      if (err?.name !== "AbortError") {
        toast({
          title: "Couldn't open sharing",
          description: "Your photo is ready — try sharing again.",
          variant: "destructive",
        });
      }
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
              src={composed}
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
