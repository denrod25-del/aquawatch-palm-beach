/**
 * Vercel serverless entry point.
 * Handles all /api/* routes via Express.
 * better-sqlite3 is used with a writable /tmp DB that is seeded on cold start.
 */
import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createServer } from "node:http";
import { registerRoutes } from "../server/routes";

const app = express();
const httpServer = createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS for Vercel frontend calling the API
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// Register all /api/* routes
registerRoutes(httpServer, app);

export default app;
