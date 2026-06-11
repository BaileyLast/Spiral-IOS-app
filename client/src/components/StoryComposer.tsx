import { useRef, useState } from "react";
import { Camera, ImageUp, X, Loader2, Instagram, Copy, Check, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Plain, CMA-friendly disclosure label. This is the working default rendered in
// the app; swap DISCLOSURE_LABEL (and/or supply a branded transparent PNG to
// renderDisclosureSticker) for a Spiral-branded graphic.
const DISCLOSURE_LABEL = "PAID PARTNERSHIP";

interface StoryComposerProps {
  open: boolean;
  onClose: () => void;
  /** Merchant handle without a leading @. */
  merchantHandle: string;
  /** Brand's public shop URL, used for the native link sticker when available. */
  shopUrl?: string | null;
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

// Long-edge cap. Keeps the in-memory data URLs small enough for low-end devices
// while staying sharp for a full-screen Story.
const MAX_EDGE = 1440;

// Decodes the photo once and returns two downscaled data URLs:
// - `clean`: the photo as-is (native background, where the sticker is movable).
// - `baked`: the photo with the disclosure pill burned in (web fallback, where a
//   movable sticker isn't possible so disclosure must be guaranteed).
function prepareImages(src: string): Promise<{ clean: string; baked: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ow = img.naturalWidth || img.width;
      const oh = img.naturalHeight || img.height;
      if (!ow || !oh) {
        reject(new Error("image-empty"));
        return;
      }
      const scale = Math.min(1, MAX_EDGE / Math.max(ow, oh));
      const w = Math.round(ow * scale);
      const h = Math.round(oh * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no-2d-context"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const clean = canvas.toDataURL("image/jpeg", 0.92);
      const pad = Math.round(w * 0.04);
      const fontSize = Math.max(20, Math.round(w * 0.045));
      const pillH = Math.round(fontSize * 2);
      drawDisclosurePill(ctx, pad, h - pad - pillH, w);
      const baked = canvas.toDataURL("image/jpeg", 0.92);
      resolve({ clean, baked });
    };
    img.onerror = () => reject(new Error("image-load-failed"));
    img.src = src;
  });
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

export default function StoryComposer({ open, onClose, merchantHandle, shopUrl }: StoryComposerProps) {
  const { toast } = useToast();
  const [composed, setComposed] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handle = `@${merchantHandle.replace(/^@/, "")}`;

  const reset = () => {
    setComposed(null);
    setOriginal(null);
    setCopied(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const onPick = (file?: File) => {
    if (!file) return;
    setWorking(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const src = reader.result as string;
      try {
        const { clean, baked } = await prepareImages(src);
        setOriginal(clean);
        setComposed(baked);
      } catch {
        toast({
          title: "Couldn't load that photo",
          description: "Please try a different one.",
          variant: "destructive",
        });
      } finally {
        setWorking(false);
      }
    };
    reader.onerror = () => {
      setWorking(false);
      toast({
        title: "Couldn't read that photo",
        description: "Please try again.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
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
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
        data-testid="input-camera"
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
        data-testid="input-library"
      />

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

      {!composed ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6">
            <Camera className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-white text-2xl font-black mb-2">Add your photo</h2>
          <p className="text-white/70 text-sm mb-8 max-w-[280px]">
            Snap your purchase or pick one from your camera roll. We'll add the disclosure for you.
          </p>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={working}
            className="tactile-btn bg-white text-black w-full max-w-[320px] py-4 text-lg mb-3 flex items-center justify-center gap-2"
            data-testid="button-take-photo"
          >
            {working ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
            Take photo
          </button>
          <button
            type="button"
            onClick={() => libraryInputRef.current?.click()}
            disabled={working}
            className="w-full max-w-[320px] py-4 text-lg font-bold text-white rounded-full bg-white/10 flex items-center justify-center gap-2 active:opacity-80"
            data-testid="button-upload-photo"
          >
            <ImageUp className="w-5 h-5" />
            Upload from library
          </button>
        </div>
      ) : (
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
              <span>Disclosure added to your photo automatically.</span>
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
              {sharing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Instagram className="w-5 h-5" />
              )}
              Share to Instagram
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="flex-1 py-3 font-bold text-white rounded-full bg-white/10 active:opacity-80"
                data-testid="button-retake"
              >
                Retake
              </button>
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
      )}
    </div>
  );
}
