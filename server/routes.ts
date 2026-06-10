import type { Express } from "express";
import type { Server } from "http";
import { storage, initDb } from "./storage";
import { seedDatabase } from "./seed";
import { insertAlertSchema, insertLeadSchema } from "@shared/schema";
import { sendLeadNotification } from "./email";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // Always init DB schema first (creates tables if empty — required on Vercel /tmp)
  initDb();
  // Seed static data (no-ops if already seeded; skipped on Vercel since reads are static)
  if (!process.env.VERCEL) seedDatabase();

  // Get water systems (optionally filter by zip)
  app.get("/api/water-systems", (req, res) => {
    const { zip } = req.query;
    const systems = storage.getWaterSystems(zip as string | undefined);
    res.json(systems);
  });

  // Get contaminant readings
  app.get("/api/readings", (req, res) => {
    const { pwsid, contaminant, from, to, zip } = req.query;
    let readings;
    if (zip) {
      readings = storage.getReadingsByZip(zip as string, contaminant as string | undefined);
    } else {
      readings = storage.getReadings(
        pwsid as string | undefined,
        contaminant as string | undefined,
        from as string | undefined,
        to as string | undefined
      );
    }
    res.json(readings);
  });

  // Get PFAS trend data for a specific system and contaminant
  app.get("/api/trends/:pwsid/:contaminant", (req, res) => {
    const { pwsid, contaminant } = req.params;
    const trends = storage.getTrends(pwsid, contaminant);
    res.json(trends);
  });

  // Get violations
  app.get("/api/violations", (req, res) => {
    const { pwsid, zip } = req.query;
    const violations = storage.getViolations(
      pwsid as string | undefined,
      zip as string | undefined
    );
    res.json(violations);
  });

  // Get national comparison benchmarks
  app.get("/api/benchmarks/:contaminant", (req, res) => {
    const { contaminant } = req.params;
    const benchmarks = storage.getNationalComparison(contaminant);
    res.json(benchmarks);
  });

  // Summary stats for overview cards
  app.get("/api/summary", (req, res) => {
    const { zip } = req.query;
    const systems = storage.getWaterSystems(zip as string | undefined);
    const allViolations = zip
      ? storage.getViolations(undefined, zip as string)
      : storage.getViolations();
    const allReadings = zip
      ? storage.getReadingsByZip(zip as string)
      : storage.getReadings();

    const activeViolations = allViolations.filter(v => v.status === "Ongoing");
    const healthBasedViolations = allViolations.filter(v => v.isHealthBased === 1);

    const pfosReadings = allReadings.filter(r => r.contaminant === "PFOS").sort((a, b) => b.sampleDate.localeCompare(a.sampleDate));
    const pfoaReadings = allReadings.filter(r => r.contaminant === "PFOA").sort((a, b) => b.sampleDate.localeCompare(a.sampleDate));

    const latestPFOS = pfosReadings[0]?.value ?? 0;
    const latestPFOA = pfoaReadings[0]?.value ?? 0;

    const exceedances = allReadings.filter(r => r.epaLimit !== null && r.value > (r.epaLimit ?? 0));

    res.json({
      systemCount: systems.length,
      populationServed: systems.reduce((sum, s) => sum + s.populationServed, 0),
      activeViolations: activeViolations.length,
      totalViolations: allViolations.length,
      healthBasedViolations: healthBasedViolations.length,
      latestPFOS,
      latestPFOA,
      pfosEPALimit: 4,
      pfoaEPALimit: 4,
      exceedanceCount: exceedances.length,
      lastUpdated: new Date().toISOString(),
    });
  });

  // Alerts
  app.get("/api/alerts", (req, res) => {
    res.json(storage.getAlerts());
  });

  app.post("/api/alerts", (req, res) => {
    const parsed = insertAlertSchema.safeParse({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const alert = storage.createAlert(parsed.data);
    res.status(201).json(alert);
  });

  app.delete("/api/alerts/:id", (req, res) => {
    storage.deleteAlert(parseInt(req.params.id));
    res.status(204).send();
  });

  // ── Leads / Consultation Requests ─────────────────────────────
  app.post("/api/leads", async (req, res) => {
    const parsed = insertLeadSchema.safeParse({
      ...req.body,
      createdAt: new Date().toISOString(),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const lead = storage.createLead(parsed.data);

    // Fire-and-forget email — don't block the response
    sendLeadNotification({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      zipCode: lead.zipCode,
      contaminantConcern: lead.contaminantConcern,
      message: lead.message,
      pfosLevel: req.body.pfosLevel,
      pfoaLevel: req.body.pfoaLevel,
      createdAt: lead.createdAt,
    }).then(() => {
      storage.markLeadNotified(lead.id);
    }).catch(err => {
      console.error("Lead email failed:", err.message);
    });

    res.status(201).json(lead);
  });

  app.get("/api/leads", (req, res) => {
    // Basic auth check — only return leads with a secret header
    const secret = req.headers["x-admin-key"];
    if (secret !== process.env.ADMIN_KEY && process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(storage.getLeads());
  });

  // ZIP → CCR map (one authoritative entry per ZIP)
  app.get("/api/zip-ccr", (req, res) => {
    const { zip } = req.query;
    const results = storage.getZipCcrMap(zip as string | undefined);
    res.json(results);
  });

  // CCR Reports
  app.get("/api/ccr-reports", (req, res) => {
    const { zip, city } = req.query;
    const reports = storage.getCcrReports(zip as string | undefined, city as string | undefined);
    res.json(reports);
  });

  return httpServer;
}
