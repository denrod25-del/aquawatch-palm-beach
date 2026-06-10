/**
 * Vercel serverless entry point.
 * Pure-JS only — no native modules (no better-sqlite3).
 * Alerts stored in /tmp JSON. Leads stored in /tmp JSON + emailed.
 */
import express from "express";
import type { Request, Response, NextFunction } from "express";
import fs from "node:fs";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── CORS ────────────────────────────────────────────────────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") return res.status(200).end();
  next();
});

// ── /tmp JSON helpers ────────────────────────────────────────────
const ALERTS_FILE = "/tmp/aq-alerts.json";
const LEADS_FILE  = "/tmp/aq-leads.json";

function readJson<T>(file: string): T[] {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return []; }
}
function writeJson<T>(file: string, data: T[]) {
  fs.writeFileSync(file, JSON.stringify(data), "utf8");
}
function nextId<T extends { id: number }>(items: T[]): number {
  return items.reduce((m, x) => Math.max(m, x.id), 0) + 1;
}

// ── Email helper ─────────────────────────────────────────────────
async function notifyLead(lead: any) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.log("[lead]", JSON.stringify(lead));
    return;
  }
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transport.sendMail({
    from: user,
    to: "iplumbtoo@gmail.com",
    subject: `New AquaWatch Lead — ${lead.name} (ZIP ${lead.zipCode})`,
    text: [
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Phone: ${lead.phone}`,
      `ZIP: ${lead.zipCode}`,
      `Concern: ${lead.contaminantConcern || "General"}`,
      `Message: ${lead.message || "—"}`,
      `Source: ${lead.source}`,
      `Time: ${lead.createdAt}`,
    ].join("\n"),
  });
}

// ── Alerts ────────────────────────────────────────────────────────
app.get("/api/alerts", (_req, res) => {
  res.json(readJson(ALERTS_FILE));
});

app.post("/api/alerts", (req, res) => {
  const { contaminant, threshold, unit, zipCode, email, active } = req.body;
  if (!contaminant || threshold == null) {
    return res.status(400).json({ error: "contaminant and threshold required" });
  }
  const alerts = readJson<any>(ALERTS_FILE);
  const alert = {
    id: nextId(alerts),
    contaminant,
    threshold: Number(threshold),
    unit: unit ?? "ppt",
    zipCode: zipCode ?? null,
    email: email ?? null,
    active: active ?? 1,
    createdAt: new Date().toISOString(),
  };
  writeJson(ALERTS_FILE, [...alerts, alert]);
  res.status(201).json(alert);
});

app.delete("/api/alerts/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const alerts = readJson<any>(ALERTS_FILE);
  const next = alerts.filter((a: any) => a.id !== id);
  if (next.length === alerts.length) return res.status(404).json({ error: "Not found" });
  writeJson(ALERTS_FILE, next);
  res.json({ success: true });
});

// ── Leads ─────────────────────────────────────────────────────────
app.post("/api/leads", async (req, res) => {
  const { name, email, phone, zipCode, contaminantConcern, message, source } = req.body;
  if (!name || !email || !phone || !zipCode) {
    return res.status(400).json({ error: "name, email, phone, zipCode required" });
  }
  const leads = readJson<any>(LEADS_FILE);
  const lead = {
    id: nextId(leads),
    name, email, phone, zipCode,
    contaminantConcern: contaminantConcern ?? null,
    message: message ?? null,
    source: source ?? "water-alert",
    createdAt: new Date().toISOString(),
    notified: 0,
  };
  writeJson(LEADS_FILE, [...leads, lead]);
  notifyLead(lead).catch(console.error);
  res.status(201).json(lead);
});

app.get("/api/leads", (_req, res) => {
  res.json(readJson(LEADS_FILE));
});

// ── Health ────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

export default app;
