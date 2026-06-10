import express from "express";
import type { Request, Response, NextFunction } from "express";

const app = express();
app.use(express.json());

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (_req.method === "OPTIONS") return res.status(200).end();
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

app.get("/api/alerts", (_req, res) => {
  res.json([]);
});

app.post("/api/alerts", (req, res) => {
  res.status(201).json({ id: 1, ...req.body });
});

app.delete("/api/alerts/:id", (_req, res) => {
  res.json({ success: true });
});

app.post("/api/leads", (req, res) => {
  res.status(201).json({ id: 1, ...req.body });
});

export default app;
