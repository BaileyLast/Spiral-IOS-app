import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from "./db";

const app = express();

app.use((req, _res, next) => {
  console.log(`[INCOMING] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';
const isReplit = !!process.env.REPL_SLUG;

const PgStore = connectPgSimple(session);

app.use(session({
  secret: process.env.SESSION_SECRET || 'spiral-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  store: new PgStore({
    pool: pool as any,
    createTableIfMissing: true,
  }),
  cookie: {
    secure: isProduction || isReplit,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isReplit ? 'none' : 'lax',
  }
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Prewarm the Shopify credentials cache from the merchant dashboard so the
  // first inbound webhook doesn't pay the cold-fetch latency. Fire-and-forget;
  // failures are logged inside the helper.
  void import("./shopifyCredentials").then((m) =>
    m.prewarmShopifyCredentials(),
  );

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log("Listening on", PORT);
    console.log("ENV PORT:", process.env.PORT);
    console.log("[BOOT] build-marker=welcome-dm-fix-v2 (sendInstagramDM moved before side-effects, graph.facebook.com endpoint, structured Meta error logging)");
  });
})();
