import { sqliteTable, text, real, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const waterSystems = sqliteTable("water_systems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pwsid: text("pwsid").notNull().unique(),
  name: text("name").notNull(),
  zipCodes: text("zip_codes").notNull(), // JSON array
  city: text("city").notNull(),
  county: text("county").notNull().default("Palm Beach"),
  populationServed: integer("population_served").notNull(),
  sourceType: text("source_type").notNull(), // GW, SW, GWP
  status: text("status").notNull().default("Active"),
});

export const contaminantReadings = sqliteTable("contaminant_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pwsid: text("pwsid").notNull(),
  contaminant: text("contaminant").notNull(),
  value: real("value").notNull(), // in ppt (parts per trillion) or ppb
  unit: text("unit").notNull().default("ppt"),
  sampleDate: text("sample_date").notNull(), // ISO date string
  samplePoint: text("sample_point"),
  method: text("method"),
  epaLimit: real("epa_limit"), // MCL
  ewgLimit: real("ewg_limit"), // EWG health guideline
  nationalAvg: real("national_avg"),
});

export const violations = sqliteTable("violations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pwsid: text("pwsid").notNull(),
  violationId: text("violation_id").notNull(),
  contaminant: text("contaminant").notNull(),
  violationType: text("violation_type").notNull(), // MCL, MR, TT
  category: text("category").notNull(), // Health-Based, Monitoring/Reporting
  isHealthBased: integer("is_health_based").notNull().default(0), // 0/1 boolean
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  status: text("status").notNull(), // Resolved, Ongoing, Archived
  description: text("description"),
});

export const alerts = sqliteTable("alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contaminant: text("contaminant").notNull(),
  threshold: real("threshold").notNull(),
  unit: text("unit").notNull().default("ppt"),
  zipCode: text("zip_code"),
  email: text("email"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
});

// Leads table — stores every consultation request
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  zipCode: text("zip_code").notNull(),
  contaminantConcern: text("contaminant_concern"), // e.g. "PFOS, PFOA"
  message: text("message"), // optional homeowner notes
  source: text("source").notNull().default("water-alert"), // where they came from
  createdAt: text("created_at").notNull(),
  notified: integer("notified").notNull().default(0), // 0/1 — email sent?
});

export const ccrReports = sqliteTable("ccr_reports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  utilityName: text("utility_name").notNull(),
  pwsid: text("pwsid"),
  city: text("city").notNull(),
  year: integer("year").notNull(),
  reportUrl: text("report_url").notNull(), // PDF or page URL
  reportType: text("report_type").notNull().default("PDF"), // PDF or PAGE
  zipCodes: text("zip_codes").notNull(), // JSON array of ZIP codes served
  notes: text("notes"),
  pfosLevel: real("pfos_level"),
  pfoaLevel: real("pfoa_level"),
  violationCount: integer("violation_count").notNull().default(0),
});

// ZIP → CCR mapping: one definitive row per ZIP code in Palm Beach County
export const zipCcrMap = sqliteTable("zip_ccr_map", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  zipCode: text("zip_code").notNull().unique(),
  city: text("city").notNull(),
  utilityName: text("utility_name").notNull(),
  pwsid: text("pwsid"),
  // Latest CCR report for this ZIP
  latestYear: integer("latest_year").notNull(),
  latestReportUrl: text("latest_report_url").notNull(),
  latestReportType: text("latest_report_type").notNull().default("PDF"), // PDF or PAGE
  // Prior year report (optional)
  priorYear: integer("prior_year"),
  priorReportUrl: text("prior_report_url"),
  // Water quality snapshot
  pfosLevel: real("pfos_level"),
  pfoaLevel: real("pfoa_level"),
  violationCount: integer("violation_count").notNull().default(0),
  notes: text("notes"),
});

export type ZipCcrMap = typeof zipCcrMap.$inferSelect;

// Insert schemas
export const insertAlertSchema = createInsertSchema(alerts).omit({ id: true });
export const insertLeadSchema = createInsertSchema(leads).omit({ id: true, notified: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Alert = typeof alerts.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type WaterSystem = typeof waterSystems.$inferSelect;
export type ContaminantReading = typeof contaminantReadings.$inferSelect;
export type Violation = typeof violations.$inferSelect;
export type CcrReport = typeof ccrReports.$inferSelect;
