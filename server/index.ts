import express from "express";
import { createServer } from "http";
import { setupVite, serveStatic } from "./vite";

// This repl is a THIN shopper client. All API + data live in the separate
// "Spiral Core" backend (https://api.joinspiral.app); the frontend points at it
// via VITE_API_BASE_URL. This server only serves the built client (and the Vite
// dev middleware in development) plus a health check — it runs no API routes,
// no database, and no Instagram/Shopify jobs.
const app = express();

app.use((req, _res, next) => {
  console.log(`[INCOMING] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.set("trust proxy", 1);

(async () => {
  const server = createServer(app);

  if (app.get("env") === "development") {
    // DEV-ONLY same-origin proxy. The Replit web preview cannot call Spiral Core
    // directly: Core sends no CORS headers, so the browser blocks every cross-origin
    // request (login included). Forwarding /api through this server keeps the browser
    // same-origin. This code path only exists in development — the production/native
    // build takes the serveStatic branch below and never proxies. Target is the dev
    // Core set via VITE_API_BASE_URL.
    const proxyTarget = (process.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
    if (proxyTarget) {
      console.log("[DEV PROXY] forwarding /api ->", proxyTarget);
      app.use("/api", async (req, res) => {
        try {
          const targetUrl = proxyTarget + req.originalUrl;
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (value == null) continue;
            const lower = key.toLowerCase();
            if (["host", "connection", "content-length", "accept-encoding", "x-real-ip"].includes(lower)) {
              continue;
            }
            // Don't let a direct caller spoof client metadata to the dev backend.
            if (lower.startsWith("x-forwarded")) {
              continue;
            }
            headers[key] = Array.isArray(value) ? value.join(", ") : value;
          }

          const hasBody = req.method !== "GET" && req.method !== "HEAD";
          let body: Buffer | undefined;
          if (hasBody) {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk as Buffer);
            }
            body = Buffer.concat(chunks);
          }

          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
            redirect: "manual",
            // Fail fast instead of hanging a dev request if the backend stalls.
            signal: AbortSignal.timeout(20000),
          });

          res.status(upstream.status);
          const setCookie = (upstream.headers as unknown as {
            getSetCookie?: () => string[];
          }).getSetCookie?.();
          upstream.headers.forEach((val, key) => {
            const lower = key.toLowerCase();
            if (
              ["content-encoding", "transfer-encoding", "connection", "content-length", "set-cookie"].includes(lower)
            ) {
              return;
            }
            res.setHeader(key, val);
          });
          if (setCookie && setCookie.length > 0) {
            res.setHeader("Set-Cookie", setCookie);
          }

          const buf = Buffer.from(await upstream.arrayBuffer());
          res.send(buf);
        } catch (err) {
          console.error("[DEV PROXY] error", err);
          res.status(502).json({ message: "Dev proxy failed to reach the Spiral Core dev backend" });
        }
      });
    }
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log("Listening on", PORT);
    console.log("ENV PORT:", process.env.PORT);
    console.log("[BOOT] thin-client (static only; API served by Spiral Core)");
  });
})();
