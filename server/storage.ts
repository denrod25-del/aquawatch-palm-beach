import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import type { InsertAlert, Alert, InsertLead, Lead, WaterSystem, ContaminantReading, Violation, CcrReport, ZipCcrMap } from "@shared/schema";
import path from "node:path";
import fs from "node:fs";

// On Vercel, only /tmp is writable. Use /tmp/data.db and seed on cold start.
function getDbPath(): string {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return "/tmp/data.db";
  }
  return path.resolve(process.cwd(), "data.db");
}

const DB_PATH = getDbPath();
const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });

// Auto-create tables on cold start (needed on Vercel /tmp where DB is always empty)
export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contaminant TEXT NOT NULL,
      threshold REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'ppt',
      zip_code TEXT,
      email TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      zip_code TEXT NOT NULL,
      contaminant_concern TEXT,
      message TEXT,
      source TEXT NOT NULL DEFAULT 'water-alert',
      created_at TEXT NOT NULL,
      notified INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export interface IStorage {
  // Water systems
  getWaterSystems(zipCode?: string): WaterSystem[];
  getWaterSystemByPwsid(pwsid: string): WaterSystem | undefined;

  // Contaminant readings
  getReadings(pwsid?: string, contaminant?: string, fromDate?: string, toDate?: string): ContaminantReading[];
  getReadingsByZip(zipCode: string, contaminant?: string): ContaminantReading[];
  getTrends(pwsid: string, contaminant: string): ContaminantReading[];
  getNationalComparison(contaminant: string): { nationalAvg: number; epaLimit: number; ewgLimit: number };

  // Violations
  getViolations(pwsid?: string, zipCode?: string): Violation[];

  // Alerts
  getAlerts(): Alert[];
  createAlert(alert: InsertAlert): Alert;
  deleteAlert(id: number): void;

  // Leads
  createLead(lead: InsertLead): Lead;
  getLeads(): Lead[];
  markLeadNotified(id: number): void;

  // CCR Reports
  getCcrReports(zipCode?: string, city?: string): CcrReport[];

  // ZIP CCR Map
  getZipCcrMap(zipCode?: string): ZipCcrMap[];
  getZipCcrEntry(zipCode: string): ZipCcrMap | undefined;
}

export class SqliteStorage implements IStorage {
  getWaterSystems(zipCode?: string): WaterSystem[] {
    const all = db.select().from(schema.waterSystems).all();
    if (!zipCode) return all;
    return all.filter(s => {
      const zips: string[] = JSON.parse(s.zipCodes);
      return zips.includes(zipCode);
    });
  }

  getWaterSystemByPwsid(pwsid: string): WaterSystem | undefined {
    return db.select().from(schema.waterSystems).where(eq(schema.waterSystems.pwsid, pwsid)).get();
  }

  getReadings(pwsid?: string, contaminant?: string, fromDate?: string, toDate?: string): ContaminantReading[] {
    const conditions = [];
    if (pwsid) conditions.push(eq(schema.contaminantReadings.pwsid, pwsid));
    if (contaminant && contaminant !== "all") conditions.push(eq(schema.contaminantReadings.contaminant, contaminant));
    if (fromDate) conditions.push(gte(schema.contaminantReadings.sampleDate, fromDate));
    if (toDate) conditions.push(lte(schema.contaminantReadings.sampleDate, toDate));
    if (conditions.length > 0) {
      return db.select().from(schema.contaminantReadings).where(and(...conditions)).all();
    }
    return db.select().from(schema.contaminantReadings).all();
  }

  getReadingsByZip(zipCode: string, contaminant?: string): ContaminantReading[] {
    const systems = this.getWaterSystems(zipCode);
    const pwsids = systems.map(s => s.pwsid);
    if (pwsids.length === 0) return [];
    const all = db.select().from(schema.contaminantReadings).all();
    return all.filter(r => {
      const matchPws = pwsids.includes(r.pwsid);
      const matchContaminant = !contaminant || contaminant === "all" || r.contaminant === contaminant;
      return matchPws && matchContaminant;
    });
  }

  getTrends(pwsid: string, contaminant: string): ContaminantReading[] {
    return db.select().from(schema.contaminantReadings)
      .where(and(
        eq(schema.contaminantReadings.pwsid, pwsid),
        eq(schema.contaminantReadings.contaminant, contaminant)
      )).all()
      .sort((a, b) => a.sampleDate.localeCompare(b.sampleDate));
  }

  getNationalComparison(contaminant: string): { nationalAvg: number; epaLimit: number; ewgLimit: number } {
    const reading = db.select().from(schema.contaminantReadings)
      .where(eq(schema.contaminantReadings.contaminant, contaminant))
      .get();
    return {
      nationalAvg: reading?.nationalAvg ?? 0,
      epaLimit: reading?.epaLimit ?? 0,
      ewgLimit: reading?.ewgLimit ?? 0,
    };
  }

  getViolations(pwsid?: string, zipCode?: string): Violation[] {
    if (zipCode) {
      const systems = this.getWaterSystems(zipCode);
      const pwsids = systems.map(s => s.pwsid);
      const all = db.select().from(schema.violations).all();
      return all.filter(v => pwsids.includes(v.pwsid));
    }
    if (pwsid) {
      return db.select().from(schema.violations).where(eq(schema.violations.pwsid, pwsid)).all();
    }
    return db.select().from(schema.violations).all();
  }

  getAlerts(): Alert[] {
    return db.select().from(schema.alerts).where(eq(schema.alerts.active, 1)).all();
  }

  createAlert(alert: InsertAlert): Alert {
    return db.insert(schema.alerts).values(alert).returning().get();
  }

  deleteAlert(id: number): void {
    db.delete(schema.alerts).where(eq(schema.alerts.id, id)).run();
  }

  createLead(lead: InsertLead): Lead {
    return db.insert(schema.leads).values({ ...lead, notified: 0 }).returning().get();
  }

  getLeads(): Lead[] {
    return db.select().from(schema.leads).all();
  }

  markLeadNotified(id: number): void {
    db.update(schema.leads).set({ notified: 1 }).where(eq(schema.leads.id, id)).run();
  }

  getCcrReports(zipCode?: string, city?: string): CcrReport[] {
    const all = db.select().from(schema.ccrReports).all();
    if (!zipCode && !city) return all;
    return all.filter(r => {
      if (zipCode) {
        const zips: string[] = JSON.parse(r.zipCodes);
        return zips.includes(zipCode);
      }
      if (city) {
        return r.city.toLowerCase().includes(city.toLowerCase());
      }
      return true;
    });
  }

  getZipCcrMap(zipCode?: string): ZipCcrMap[] {
    if (zipCode) {
      const row = db.select().from(schema.zipCcrMap)
        .where(eq(schema.zipCcrMap.zipCode, zipCode)).get();
      return row ? [row] : [];
    }
    return db.select().from(schema.zipCcrMap)
      .orderBy(schema.zipCcrMap.zipCode).all();
  }

  getZipCcrEntry(zipCode: string): ZipCcrMap | undefined {
    return db.select().from(schema.zipCcrMap)
      .where(eq(schema.zipCcrMap.zipCode, zipCode)).get();
  }
}

export const storage = new SqliteStorage();
