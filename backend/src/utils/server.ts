import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import docRoutes from "../routes/docRoutes";
import notificationRoutes from "../routes/notificationRoutes";
import { metricsHandler, metricsMiddleware } from "./monitoring";

export const createServer = () => {
  const app = express();
  const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
  const clientUrls = (process.env.CLIENT_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(new Set([clientUrl, ...clientUrls]));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(metricsMiddleware);
  // Kubernetes / PaaS style health endpoint
  app.get("/healthz", (_req, res) => res.sendStatus(200));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/metrics", metricsHandler);

  app.use("/api/docs", docRoutes);
  app.use("/api/notifications", notificationRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  return { app, httpServer, io };
};
