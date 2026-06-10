/**
 * Vercel serverless entry point — no native modules.
 * Alerts and leads stored in /tmp JSON files (reset on cold start).
 * All read-only data (water systems, readings, violations, CCR) is bundled
 * statically in the frontend — no DB reads needed here.
 */
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { insertAlertSchema, insertLeadSchema } from "../shared/schema";
import { tmpStorage } from "./storage-tmp";
import { sendLeadNotification } from "../server/email";

const app = express();
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

// ── Alerts ──────────────────────────────────────────────────────

app.get("/api/alerts", (_req, res) => {
  res.json(tmpStorage.getAlerts());
});

app.post("/api/alerts", (req, res) => {
  const parsed = insertAlertSchema.safeParse({
    ...req.body,
    createdAt: new Date().toISOString(),
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const alert = tmpStorage.createAlert(parsed.data);
  res.status(201).json(alert);
});

app.delete("/api/alerts/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const ok = tmpStorage.deleteAlert(id);
  if (!ok) return res.status(404).json({ error: "Alert not found" });
  res.json({ success: true });
});

// ── Leads ────────────────────────────────────────────────────────

app.post("/api/leads", async (req, res) => {
  const parsed = insertLeadSchema.safeParse({
    ...req.body,
    createdAt: req.body.createdAt ?? new Date().toISOString(),
  });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const lead = tmpStorage.createLead(parsed.data);
  // Fire-and-forget email notification
  sendLeadNotification(lead).catch(console.error);
  res.status(201).json(lead);
});

app.get("/api/leads", (_req, res) => {
  res.json(tmpStorage.getLeads());
});

// ── Health ───────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

export default app;
