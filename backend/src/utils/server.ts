import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import docRoutes from "../routes/docRoutes";
import notificationRoutes from "../routes/notificationRoutes";
import authRoutes from "../routes/authRoutes";

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, "");

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

  app.use(express.json({ limit: "2mb" }));
  // Cloud health checks may hit "/"; return 200 to avoid deploy failures.
  app.get("/", (_req, res) => res.status(200).send("ok"));
  // Kubernetes / PaaS style health endpoint
  app.get("/healthz", (_req, res) => res.sendStatus(200));

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
