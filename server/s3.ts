import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

// Media pipeline ownership lives here (this app is the hub for every ecommerce
// integration). We download a shopper's Story media from Instagram's short-lived
// CDN link while it's still live and upload a permanent copy to the shared S3
// bucket. The resulting URL never expires, so the merchant dashboard (and any
// future integration) can just store it — no download/upload on their side.
//
// Credentials are upload-only (s3:PutObject) scoped to the `stories/` prefix.
// If any of the four AWS_* secrets are missing we degrade gracefully: uploads
// return null and the caller forwards the Story without a permanent link (the
// dashboard then falls back to its existing behaviour). This mirrors the
// log-only fallback used for push (APNS).

interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

function getS3Config(): S3Config | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!accessKeyId || !secretAccessKey || !region || !bucket) return null;
  return { accessKeyId, secretAccessKey, region, bucket };
}

export function isS3Configured(): boolean {
  return getS3Config() !== null;
}

let cachedClient: S3Client | null = null;
let warnedMissing = false;

function getClient(config: S3Config): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return cachedClient;
}

export interface UploadedMedia {
  url: string;
  mediaType: "image" | "video";
}

// Sniff a content type from the file's magic bytes. Instagram CDN sometimes
// serves media as a generic `application/octet-stream`, in which case the HTTP
// header can't tell a video from a photo. Reading the leading bytes does.
// Returns null when nothing recognizable matches.
export function sniffContentType(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  // ISO-BMFF / MP4: bytes 4..7 are the "ftyp" box type.
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "video/mp4";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  // GIF: "GIF8"
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return "image/gif";
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// A header content type that tells us nothing about image-vs-video. When we see
// one of these we fall back to magic-byte sniffing and then the resolved hint.
export function isGenericContentType(contentType: string | null | undefined): boolean {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  if (!ct) return true;
  return ct === "application/octet-stream" || ct === "binary/octet-stream" || ct === "application/binary";
}

// Map a content type to a (mediaType, extension) pair. Defaults to image/jpg
// when the type is unknown so we always produce a usable object key.
export function classifyMedia(contentType: string | null | undefined): {
  mediaType: "image" | "video";
  ext: string;
  contentType: string;
} {
  const ct = (contentType || "").toLowerCase().split(";")[0].trim();
  if (ct === "video/mp4") return { mediaType: "video", ext: "mp4", contentType: "video/mp4" };
  if (ct.startsWith("video/")) {
    const ext = ct.split("/")[1] || "mp4";
    return { mediaType: "video", ext, contentType: ct };
  }
  if (ct === "image/png") return { mediaType: "image", ext: "png", contentType: "image/png" };
  if (ct === "image/webp") return { mediaType: "image", ext: "webp", contentType: "image/webp" };
  if (ct.startsWith("image/")) {
    const ext = ct.split("/")[1] || "jpg";
    return { mediaType: "image", ext: ext === "jpeg" ? "jpg" : ext, contentType: ct };
  }
  return { mediaType: "image", ext: "jpg", contentType: "image/jpeg" };
}

// Upload a Story media buffer under the `stories/` prefix and return its
// permanent public URL. Returns null when S3 isn't configured.
export async function uploadStoryMedia(
  buffer: Buffer,
  contentType: string,
  ext: string,
): Promise<string | null> {
  const config = getS3Config();
  if (!config) {
    if (!warnedMissing) {
      console.warn("[S3] AWS_* secrets not set — skipping Story media upload (forwarding without permanent link)");
      warnedMissing = true;
    }
    return null;
  }

  const key = `stories/${randomUUID()}.${ext}`;
  await getClient(config).send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  // Virtual-hosted–style URL (matches the dashboard's existing links).
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}
