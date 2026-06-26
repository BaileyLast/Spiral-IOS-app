import { useState, useEffect, useRef } from "react";
import { X, Loader2, Instagram, Copy, Check, ShieldCheck, ShoppingBag, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Plain, CMA-friendly disclosure label. This is the working default rendered in
// the app; swap DISCLOSURE_LABEL (and/or supply a branded transparent PNG to
// renderDisclosureSticker) for a Spiral-branded graphic.
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
  /** Store display name, shown on the product-photo template. */
  storeName?: string | null;
  /** Store logo URL, shown on the product-photo template when it loads. */
  storeLogo?: string | null;
  /**
   * Optional merchant-supplied Story creative (from Spiral Core). When present
   * it is used as-is instead of building the product-photo template.
   */
  creativeUrl?: string | null;
  /** Purchased products that carry a usable image, for the product template. */
  products?: StoryProduct[];
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

// Draws the disclosure pill onto a context at the given width scale. Returns the
// pill's drawn width/height so callers can position it.
function drawDisclosurePill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scaleWidth: number,
) {
  const fontSize = Math.max(20, Math.round(scaleWidth * 0.045));
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
  const metrics = ctx.measureText(DISCLOSURE_LABEL);
  const pillH = Math.round(fontSize * 2);
  const pillW = Math.round(metrics.width + fontSize * 1.8);
  ctx.fillStyle = "rgba(0,0,0,0.62)";
  roundRect(ctx, x, y, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(DISCLOSURE_LABEL, x + fontSize * 0.9, y + pillH / 2 + 1);
  return { pillW, pillH };
}

// Instagram Story canvas. Every image is rendered onto this exact frame so the
// output always matches a full-screen Story (1080x1920), regardless of the
// source image's shape.
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Loads an image with CORS enabled so it can be drawn to a canvas and exported
// without tainting it. Remote product/creative images (Shopify CDN, S3) must
// serve CORS headers; if they don't the load rejects and the caller degrades.
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

// Truncates text with an ellipsis so it fits within maxWidth on the given ctx.
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t.trim()}…`;
}

// Cover-fits a full image (e.g. a merchant creative) onto the 1080x1920 Story
// frame and returns two data URLs:
// - `clean`: the cropped image as-is (native background, movable sticker).
// - `baked`: the same with the disclosure pill burned into the bottom corner
//   (web fallback, where a movable sticker isn't possible).
function composeCover(img: HTMLImageElement): { clean: string; baked: string } {
  const ow = img.naturalWidth || img.width;
  const oh = img.naturalHeight || img.height;
  if (!ow || !oh) throw new Error("image-empty");
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");
  const scale = Math.max(STORY_WIDTH / ow, STORY_HEIGHT / oh);
  const drawW = ow * scale;
  const drawH = oh * scale;
  const dx = (STORY_WIDTH - drawW) / 2;
  const dy = (STORY_HEIGHT - drawH) / 2;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  ctx.drawImage(img, dx, dy, drawW, drawH);
  const clean = canvas.toDataURL("image/jpeg", 0.92);
  const pad = Math.round(STORY_WIDTH * 0.04);
  const fontSize = Math.max(20, Math.round(STORY_WIDTH * 0.045));
  const pillH = Math.round(fontSize * 2);
  drawDisclosurePill(ctx, pad, STORY_HEIGHT - pad - pillH, STORY_WIDTH);
  const baked = canvas.toDataURL("image/jpeg", 0.92);
  return { clean, baked };
}

// Builds a clean, branded Story from a single product photo: the product is
// contained (never cropped) on a white card over a brand-green background, with
// the store name/logo above and the product name below. Returns clean + baked
// versions, matching composeCover's contract.
function renderProductTemplate(
  productImg: HTMLImageElement,
  opts: { storeName?: string | null; logoImg?: HTMLImageElement | null; productName?: string | null },
): { clean: string; baked: string } {
  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-2d-context");

  // Brand-green gradient background.
  const bg = ctx.createLinearGradient(0, 0, 0, STORY_HEIGHT);
  bg.addColorStop(0, "#4ECCA3");
  bg.addColorStop(1, "#2C9E81");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  const cx = STORY_WIDTH / 2;
  ctx.textAlign = "center";

  // Header: optional logo, then store name.
  let headerBottom = 250;
  const logo = opts.logoImg;
  if (logo && (logo.naturalWidth || logo.width)) {
    const lr = 78;
    const lcy = 250;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, lcy, lr, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.clip();
    const iw = logo.naturalWidth || logo.width;
    const ih = logo.naturalHeight || logo.height;
    const s = Math.max((lr * 2) / iw, (lr * 2) / ih);
    const dw = iw * s;
    const dh = ih * s;
    ctx.drawImage(logo, cx - dw / 2, lcy - dh / 2, dw, dh);
    ctx.restore();
    headerBottom = lcy + lr + 64;
  } else {
    headerBottom = 240;
  }

  const storeName = (opts.storeName || "").trim();
  ctx.textBaseline = "alphabetic";
  if (storeName) {
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = `700 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
    ctx.fillText("I SHOPPED AT", cx, headerBottom);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 58px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
    ctx.fillText(fitText(ctx, storeName, STORY_WIDTH - 180), cx, headerBottom + 70);
    headerBottom += 70;
  }

  // White product card.
  const cardX = 96;
  const cardW = STORY_WIDTH - cardX * 2;
  const cardTop = headerBottom + 80;
  const cardBottomLimit = STORY_HEIGHT - 320;
  const cardH = cardBottomLimit - cardTop;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, cardX, cardTop, cardW, cardH, 56);
  ctx.fill();

  // Product image, contained inside the card with padding (no crop).
  const ipad = 80;
  const innerX = cardX + ipad;
  const innerY = cardTop + ipad;
  const innerW = cardW - ipad * 2;
  const innerH = cardH - ipad * 2;
  const piw = productImg.naturalWidth || productImg.width;
  const pih = productImg.naturalHeight || productImg.height;
  if (piw && pih) {
    const s = Math.min(innerW / piw, innerH / pih);
    const dw = piw * s;
    const dh = pih * s;
    ctx.drawImage(productImg, innerX + (innerW - dw) / 2, innerY + (innerH - dh) / 2, dw, dh);
  }

  // Product name under the card.
  const pname = (opts.productName || "").trim();
  if (pname) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;
    ctx.fillText(fitText(ctx, pname, STORY_WIDTH - 180), cx, cardBottomLimit + 100);
  }

  const clean = canvas.toDataURL("image/jpeg", 0.92);
  const pad = Math.round(STORY_WIDTH * 0.04);
  const fontSize = Math.max(20, Math.round(STORY_WIDTH * 0.045));
  const pillH = Math.round(fontSize * 2);
  ctx.textAlign = "left";
  drawDisclosurePill(ctx, pad, STORY_HEIGHT - pad - pillH, STORY_WIDTH);
  const baked = canvas.toDataURL("image/jpeg", 0.92);
  return { clean, baked };
}

// Transparent PNG of just the disclosure pill — passed to the native bridge so
// the iPhone app can place it as a movable Instagram sticker (not baked in).
function renderDisclosureSticker(scaleWidth = 1080): string {
  const probe = document.createElement("canvas").getContext("2d");
  const fontSize = Math.max(20, Math.round(scaleWidth * 0.045));
  if (probe) {
    probe.font = `700 ${fontSize}px -apple-system, Helvetica, Arial, sans-serif`;
  }
  const labelWidth = probe ? probe.measureText(DISCLOSURE_LABEL).width : scaleWidth * 0.4;
  const pillH = Math.round(fontSize * 2);
  const pillW = Math.round(labelWidth + fontSize * 1.8);
  const canvas = document.createElement("canvas");
  canvas.width = pillW;
  canvas.height = pillH;
  const ctx = canvas.getContext("2d");
  if (ctx) drawDisclosurePill(ctx, 0, 0, scaleWidth);
  return canvas.toDataURL("image/png");
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
// Story background, the disclosure as a movable sticker, and shopUrl as a link
// sticker. Returns true if a native handler accepted the payload.
function tryNativeBridge(
  backgroundImage: string,
  stickerImage: string,
  contentURL?: string | null,
): boolean {
  const w = window as any;
  const handler = w?.webkit?.messageHandlers?.spiralStoryShare;
  if (handler && typeof handler.postMessage === "function") {
    try {
      handler.postMessage({ backgroundImage, stickerImage, contentURL: contentURL ?? null });
      // Native owns completion + error surfacing from here. We only treat a
      // throwing postMessage as "not handled" so we fall through to web tiers.
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

type Status = "loading" | "picker" | "empty" | "error";

export default function StoryComposer({
  open,
  onClose,
  merchantHandle,
  shopUrl,
  storeName,
  storeLogo,
  creativeUrl,
  products,
}: StoryComposerProps) {
  const { toast } = useToast();
  const [composed, setComposed] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handle = `@${merchantHandle.replace(/^@/, "")}`;
  const productList = (products ?? []).filter(
    (p) => typeof p.imageUrl === "string" && /^https?:\/\//i.test(p.imageUrl),
  );
  const hasCreative = typeof creativeUrl === "string" && /^https?:\/\//i.test(creativeUrl);
  const canChooseAnother = !hasCreative && productList.length > 1;

  // Monotonic token so only the most recent build can mutate state — guards
  // against a slow earlier request overwriting a newer pick.
  const buildVersion = useRef(0);

  const buildFrom = async (
    src: string,
    mode: "cover" | "template",
    productName?: string,
  ) => {
    const version = ++buildVersion.current;
    setStatus("loading");
    setComposed(null);
    setOriginal(null);
    try {
      const img = await loadImage(src);
      let result: { clean: string; baked: string };
      if (mode === "template") {
        let logoImg: HTMLImageElement | null = null;
        if (storeLogo) {
          try {
            logoImg = await loadImage(storeLogo);
          } catch {
            logoImg = null;
          }
        }
        result = renderProductTemplate(img, { storeName, logoImg, productName });
      } else {
        result = composeCover(img);
      }
      if (version !== buildVersion.current) return;
      setOriginal(result.clean);
      setComposed(result.baked);
    } catch {
      if (version !== buildVersion.current) return;
      // Degrade gracefully. If a merchant creative fails to load but we have a
      // product photo, fall back to the template; if several products exist,
      // return to the picker so the shopper can choose a working one.
      if (mode === "cover" && productList.length === 1) {
        void buildFrom(productList[0].imageUrl, "template", productList[0].name);
        return;
      }
      if (productList.length > 1) {
        setStatus("picker");
        return;
      }
      setStatus("error");
    }
  };

  // Decide what to show whenever the composer opens: the merchant creative if
  // present, otherwise auto-build from a single product, otherwise a picker for
  // multiple products, otherwise an empty state.
  const startAuto = () => {
    setCopied(false);
    setComposed(null);
    setOriginal(null);
    if (hasCreative) {
      void buildFrom(creativeUrl as string, "cover");
    } else if (productList.length === 1) {
      void buildFrom(productList[0].imageUrl, "template", productList[0].name);
    } else if (productList.length > 1) {
      setStatus("picker");
    } else {
      setStatus("empty");
    }
  };

  useEffect(() => {
    if (open) startAuto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const close = () => {
    setComposed(null);
    setOriginal(null);
    setCopied(false);
    onClose();
  };

  const pickProduct = (p: StoryProduct) => {
    void buildFrom(p.imageUrl, "template", p.name);
  };

  const chooseAnother = () => {
    setComposed(null);
    setOriginal(null);
    setCopied(false);
    setStatus("picker");
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
    if (!composed || !original) return;
    setSharing(true);
    await copyHandle();
    try {
      // 1) Native iPhone app (movable sticker + link sticker), if present.
      const sticker = renderDisclosureSticker();
      if (tryNativeBridge(original, sticker, shopUrl)) {
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
      window.open(`https://instagram.com/${merchantHandle.replace(/^@/, "")}`, "_blank");
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
            <div className="flex gap-3">
              {canChooseAnother && (
                <button
                  type="button"
                  onClick={chooseAnother}
                  className="flex-1 py-3 font-bold text-white rounded-full bg-white/10 active:opacity-80"
                  data-testid="button-choose-another"
                >
                  Choose another
                </button>
              )}
              <button
                type="button"
                onClick={copyHandle}
                className="flex-1 py-3 font-bold text-white rounded-full bg-white/10 active:opacity-80 flex items-center justify-center gap-2"
                data-testid="button-copy-tag"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy tag
              </button>
            </div>
          </div>
        </div>
      ) : status === "loading" ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" data-testid="state-preparing">
          <Loader2 className="w-10 h-10 animate-spin text-white mb-5" />
          <p className="text-white/80 text-sm">Preparing your Story…</p>
        </div>
      ) : status === "picker" ? (
        <div className="flex-1 flex flex-col px-6 pt-1 pb-6 overflow-y-auto">
          <div className="text-center mb-6">
            <h2 className="text-white text-2xl font-black mb-2">Choose your photo</h2>
            <p className="text-white/70 text-sm max-w-[280px] mx-auto">
              Pick the product you want to feature in your Story.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {productList.map((p, i) => (
              <button
                key={`${p.name}-${i}`}
                type="button"
                onClick={() => pickProduct(p)}
                className="relative rounded-2xl overflow-hidden bg-white/10 aspect-[4/5] active:scale-95 transition-transform"
                data-testid={`button-pick-product-${i}`}
              >
                <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                  <p className="text-white text-xs font-bold line-clamp-2 text-left">{p.name}</p>
                </div>
              </button>
            ))}
          </div>
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
            onClick={startAuto}
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
          <h2 className="text-white text-2xl font-black mb-2">No image yet</h2>
          <p className="text-white/70 text-sm max-w-[280px]">
            We don't have a Story image for this order yet. Please check back shortly.
          </p>
        </div>
      )}
    </div>
  );
}
