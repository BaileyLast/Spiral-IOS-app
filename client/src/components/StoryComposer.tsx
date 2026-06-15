import { useState, useRef, useEffect } from "react";
import { Camera, ImageUp, X, Loader2, Instagram, Copy, Check, ShieldCheck, Link2 } from "lucide-react";
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

// Instagram Story canvas. Every photo is rendered onto this exact frame so the
// output always matches a full-screen Story (1080x1920), regardless of the
// source photo's shape.
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Decodes the photo once and returns two data URLs, both sized to a 1080x1920
// Story frame with the source center-cropped to fill (no letterbox bars):
// - `clean`: the cropped photo as-is (native background, where the sticker is movable).
// - `baked`: the cropped photo with the disclosure pill burned into the bottom
//   corner (web fallback, where a movable sticker isn't possible so disclosure
//   must be guaranteed).
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
      const canvas = document.createElement("canvas");
      canvas.width = STORY_WIDTH;
      canvas.height = STORY_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("no-2d-context"));
        return;
      }
      // Cover-fit: scale so the photo fills the whole 1080x1920 frame, then
      // center the overflow so the edges are cropped evenly.
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

// Custom in-app camera. Uses the live device camera so we can overlay framing
// guides (where the disclosure pill / link sticker land) on top of the preview.
// The preview box is locked to the 1080x1920 Story aspect with object-cover, so
// what the shopper sees is what prepareImages() center-crops on capture.
function CameraCapture({
  shopUrl,
  onCapture,
  onCancel,
  onUnavailable,
}: {
  shopUrl?: string | null;
  onCapture: (src: string) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const md = navigator.mediaDevices;
      if (!md || typeof md.getUserMedia !== "function") {
        onUnavailable();
        return;
      }
      try {
        const stream = await md.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1080 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            // Autoplay can reject; the stream still renders once decoded.
          }
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) onUnavailable();
      }
    };
    void start();
    return () => {
      cancelled = true;
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const canvas = document.createElement("canvas");
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, vw, vh);
    onCapture(canvas.toDataURL("image/jpeg", 0.95));
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-4">
        <button
          type="button"
          onClick={onCancel}
          className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center"
          aria-label="Back"
          data-testid="button-camera-back"
        >
          <X className="w-5 h-5 text-white" />
        </button>
        <span className="text-white font-bold text-sm">Frame your shot</span>
        <span className="w-10" />
      </header>

      <div
        className="flex-1 flex items-center justify-center px-4 min-h-0"
        style={{ containerType: "size" }}
      >
        {/* Locked to a true 9:16 Story frame that fits within the available area
            on every screen: height-led when vertical space is tight, width-led
            otherwise. Keeps preview === prepareImages() center-crop. */}
        <div
          className="relative overflow-hidden rounded-2xl bg-black"
          style={{
            height: "min(100cqh, calc(100cqw * 16 / 9))",
            width: "min(100cqw, calc(100cqh * 9 / 16))",
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="video-camera-preview"
          />

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="w-8 h-8 animate-spin text-white" />
            </div>
          )}

          {/* Top hint */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-sm">
            <span className="text-[11px] font-medium text-white/90 whitespace-nowrap">
              Keep your product clear of the dashed areas
            </span>
          </div>

          {/* Link sticker ghost (native app only) */}
          {shopUrl && (
            <div
              className="absolute left-1/2 -translate-x-1/2 bottom-[12%] flex items-center gap-1.5 rounded-lg border border-dashed border-white/70 bg-black/35 px-3 py-1.5 backdrop-blur-sm"
              data-testid="guide-link-sticker"
            >
              <Link2 className="w-3.5 h-3.5 text-white/90" />
              <span className="text-[10px] font-bold tracking-wide text-white/90">SHOP LINK</span>
            </div>
          )}

          {/* Disclosure pill ghost — matches the baked bottom-left position */}
          <div
            className="absolute left-[4%] bottom-[2.5%] flex items-center gap-1.5 rounded-full border border-dashed border-white/70 bg-black/45 px-3 py-1.5 backdrop-blur-sm"
            data-testid="guide-disclosure"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-white/90" />
            <span className="text-[10px] font-bold tracking-wide text-white/90">
              {DISCLOSURE_LABEL}
            </span>
          </div>
        </div>
      </div>

      <div className="py-6 flex items-center justify-center">
        <button
          type="button"
          onClick={capture}
          disabled={!ready}
          aria-label="Take photo"
          data-testid="button-shutter"
          className="w-[72px] h-[72px] rounded-full bg-white ring-4 ring-white/30 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
        >
          <span className="w-[58px] h-[58px] rounded-full border-2 border-black/10" />
        </button>
      </div>
    </>
  );
}

export default function StoryComposer({ open, onClose, merchantHandle, shopUrl }: StoryComposerProps) {
  const { toast } = useToast();
  const [composed, setComposed] = useState<string | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraFallback, setCameraFallback] = useState(false);

  if (!open) return null;

  const handle = `@${merchantHandle.replace(/^@/, "")}`;

  const reset = () => {
    setComposed(null);
    setOriginal(null);
    setCopied(false);
  };

  const close = () => {
    reset();
    setShowCamera(false);
    onClose();
  };

  const processSrc = async (src: string) => {
    setWorking(true);
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

  const onPick = (file?: File) => {
    if (!file) return;
    setWorking(true);
    const reader = new FileReader();
    reader.onload = () => {
      void processSrc(reader.result as string);
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
      {showCamera ? (
        <CameraCapture
          shopUrl={shopUrl}
          onCancel={() => setShowCamera(false)}
          onCapture={(src) => {
            setShowCamera(false);
            void processSrc(src);
          }}
          onUnavailable={() => {
            setShowCamera(false);
            setCameraFallback(true);
            toast({
              title: "Using your phone's camera",
              description:
                "We couldn't open the in-app camera, so we'll use your phone's camera instead.",
            });
          }}
        />
      ) : (
        <>
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
          {cameraFallback ? (
            <label
              className="tactile-btn bg-white text-black w-full max-w-[320px] py-4 text-lg mb-3 flex items-center justify-center gap-2 cursor-pointer"
              data-testid="button-take-photo"
            >
              {working ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={working}
                onChange={(e) => onPick(e.target.files?.[0])}
                data-testid="input-camera"
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              disabled={working}
              className="tactile-btn bg-white text-black w-full max-w-[320px] py-4 text-lg mb-3 flex items-center justify-center gap-2"
              data-testid="button-take-photo"
            >
              {working ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
              Take photo
            </button>
          )}
          <label
            className="w-full max-w-[320px] py-4 text-lg font-bold text-white rounded-full bg-white/10 flex items-center justify-center gap-2 active:opacity-80 cursor-pointer"
            data-testid="button-upload-photo"
          >
            <ImageUp className="w-5 h-5" />
            Upload from library
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={working}
              onChange={(e) => onPick(e.target.files?.[0])}
              data-testid="input-library"
            />
          </label>
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
        </>
      )}
    </div>
  );
}
