import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import docRoutes from "../routes/docRoutes";
import notificationRoutes from "../routes/notificationRoutes";
import authRoutes from "../routes/authRoutes";

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, "");
const startedAt = Date.now();

type RateBucket = {
  count: number;
  resetAt: number;
};

const authRateBuckets = new Map<string, RateBucket>();

const getClientIp = (req: express.Request) =>
  String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();

const authRateLimit = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.path.startsWith("/api/auth")) {
    return next();
  }

  const windowMs = 60 * 1000;
  const maxRequests = 40;
  const key = `${getClientIp(req)}:${req.path}`;
  const now = Date.now();
  const bucket = authRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    authRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > maxRequests) {
    res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ message: "Too many auth attempts. Try again shortly." });
  }

  return next();
};

const parseOrigins = (value: string | undefined) =>
  String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

export const createServer = () => {
  const app = express();
  const configuredClientUrl = normalizeOrigin(process.env.CLIENT_URL || "");
  const primaryClientUrl = configuredClientUrl || "http://localhost:5173";
  const allowedOrigins = Array.from(new Set([primaryClientUrl, ...parseOrigins(process.env.CLIENT_URLS)]));
  const allowAllOrigins = allowedOrigins.includes("*");

  const isAllowedOrigin = (origin?: string) => {
    if (!origin) return true;
    if (allowAllOrigins) return true;
    return allowedOrigins.includes(normalizeOrigin(origin));
  };

  const corsOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  };

  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
    }),
  );

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    next();
  });
  app.use(authRateLimit);
  app.use(express.json({ limit: "2mb" }));
  // Cloud health checks may hit "/"; return 200 to avoid deploy failures.
  app.get("/", (_req, res) => res.status(200).send("ok"));
  // Kubernetes / PaaS style health endpoint
  app.get("/healthz", (_req, res) => res.sendStatus(200));
  app.get("/metrics", (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    res
      .type("text/plain; version=0.0.4")
      .send(
        [
          "# HELP realtime_collab_uptime_seconds Backend process uptime in seconds.",
          "# TYPE realtime_collab_uptime_seconds counter",
          `realtime_collab_uptime_seconds ${uptimeSeconds}`,
          "# HELP realtime_collab_auth_rate_buckets Active auth rate-limit buckets.",
          "# TYPE realtime_collab_auth_rate_buckets gauge",
          `realtime_collab_auth_rate_buckets ${authRateBuckets.size}`,
        ].join("\n"),
      );
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/docs", docRoutes);
  app.use("/api/notifications", notificationRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
    },
  });

  return { app, httpServer, io };
};
