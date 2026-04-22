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

  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(metricsMiddleware);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/metrics", metricsHandler);

  app.use("/api/docs", docRoutes);
  app.use("/api/notifications", notificationRoutes);

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: clientUrl,
      credentials: true,
    },
  });

  return { app, httpServer, io };
};
