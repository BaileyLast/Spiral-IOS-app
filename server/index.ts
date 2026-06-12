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
