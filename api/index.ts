/**
 * Vercel serverless entry point.
 * Exported as default handler for all /api/* routes.
 * DB lives in /tmp/data.db — tables auto-created on cold start via initDb().
 */
process.env.VERCEL = "1"; // must be set before storage.ts is imported

import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.status(200).end();
  next();
});

// Register routes (calls initDb() + registers /api/* handlers)
registerRoutes(httpServer, app);

export default app;
