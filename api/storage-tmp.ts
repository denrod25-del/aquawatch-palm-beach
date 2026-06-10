/**
 * Vercel-compatible storage for alerts and leads.
 * Uses JSON files in /tmp (no native modules).
 * Data resets on each cold start — acceptable for a lead-gen tool
 * where the real persistence is the email notification.
 */
import fs from "node:fs";
import path from "node:path";
import type { Alert, InsertAlert, Lead, InsertLead } from "@shared/schema";

const ALERTS_FILE = "/tmp/aquawatch-alerts.json";
const LEADS_FILE  = "/tmp/aquawatch-leads.json";

function read<T>(file: string, def: T[]): T[] {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return def; }
}

function write<T>(file: string, data: T[]) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

let _alertId = 1;
let _leadId  = 1;

export const tmpStorage = {
  getAlerts(): Alert[] {
    return read<Alert>(ALERTS_FILE, []);
  },
  createAlert(data: InsertAlert): Alert {
    const alerts = read<Alert>(ALERTS_FILE, []);
    const maxId = alerts.reduce((m, a) => Math.max(m, a.id), 0);
    const alert: Alert = { id: maxId + 1, ...data } as Alert;
    write(ALERTS_FILE, [...alerts, alert]);
    return alert;
  },
  deleteAlert(id: number): boolean {
    const alerts = read<Alert>(ALERTS_FILE, []);
    const next = alerts.filter(a => a.id !== id);
    if (next.length === alerts.length) return false;
    write(ALERTS_FILE, next);
    return true;
  },
  createLead(data: InsertLead): Lead {
    const leads = read<Lead>(LEADS_FILE, []);
    const maxId = leads.reduce((m, l) => Math.max(m, l.id), 0);
    const lead: Lead = { id: maxId + 1, notified: 0, ...data } as Lead;
    write(LEADS_FILE, [...leads, lead]);
    return lead;
  },
  getLeads(): Lead[] {
    return read<Lead>(LEADS_FILE, []);
  },
};
