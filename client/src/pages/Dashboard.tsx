import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTheme } from "@/components/ThemeProvider";
import {
  getWaterSystems, getReadings, getTrends, getViolations, getSummary,
  type WaterSystem, type Reading, type Violation,
} from "@/data/staticData";
import { ChemicalTag } from "@/components/ChemicalTag";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, BarChart, Bar, Cell, RadialBarChart,
  RadialBar, PolarAngleAxis
} from "recharts";
import {
  Droplets, AlertTriangle, ShieldAlert, Activity, Bell, BellOff,
  Sun, Moon, Filter, TrendingUp, TrendingDown, Minus, Globe,
  MapPin, ChevronRight, X, Info, Download, ExternalLink, FileText,
  Phone, User, Wrench, CheckCircle2, Sparkles
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
interface Alert {
  id: number; contaminant: string; threshold: number; unit: string;
  zipCode: string | null; email: string | null; active: number; createdAt: string;
}
interface Summary {
  systemCount: number; populationServed: number; activeViolations: number;
  totalViolations: number; healthBasedViolations: number; latestPFOS: number;
  latestPFOA: number; pfosEPALimit: number; pfoaEPALimit: number;
  exceedanceCount: number; lastUpdated: string;
}

// ── Constants ──────────────────────────────────────────────────
const PB_ZIPS = [
  "33401","33403","33404","33405","33406","33407","33408","33409","33410","33411",
  "33412","33413","33414","33415","33417","33418","33426","33428","33430","33431",
  "33432","33433","33434","33435","33436","33437","33438","33444","33445","33446",
  "33448","33449","33460","33461","33462","33463","33465","33467","33469","33470",
  "33471","33472","33473","33476","33477","33478","33480","33483","33484","33486",
  "33487","33496","33497","33498"
];

const CONTAMINANTS = [
  { value: "all", label: "All Contaminants" },
  { value: "PFOS", label: "PFOS (Forever Chemical)" },
  { value: "PFOA", label: "PFOA (Forever Chemical)" },
  { value: "PFNA", label: "PFNA" },
  { value: "PFHxS", label: "PFHxS" },
  { value: "Lead", label: "Lead" },
  { value: "Nitrate", label: "Nitrate" },
  { value: "Chloroform", label: "Chloroform (TTHMs)" },
  { value: "Arsenic", label: "Arsenic" },
];

const CONTAMINANT_COLORS: Record<string, string> = {
  PFOS: "#ef4444", PFOA: "#f97316", PFNA: "#a855f7",
  PFHxS: "#eab308", Lead: "#6b7280", Nitrate: "#22c55e",
  Chloroform: "#06b6d4", Arsenic: "#ec4899",
};

function fmt(v: number, decimals = 1) {
  return v.toFixed(decimals);
}

function getRiskLevel(value: number, epaLimit: number) {
  const ratio = value / epaLimit;
  if (ratio > 1) return "danger";
  if (ratio > 0.7) return "warning";
  return "safe";
}

function RiskBadge({ value, limit }: { value: number; limit: number }) {
  const level = getRiskLevel(value, limit);
  const labels = { danger: "Exceeds MCL", warning: "Approaching MCL", safe: "Within Limit" };
  const cls = { danger: "badge-danger", warning: "badge-warning", safe: "badge-safe" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls[level]}`}>{labels[level]}</span>;
}

// ── Custom Tooltip ─────────────────────────────────────────────
function CustomChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-mono font-semibold text-foreground">{fmt(entry.value)} {entry.payload?.unit || "ppt"}</span>
        </div>
      ))}
      {payload[0]?.payload?.epaLimit && (
        <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
          EPA MCL: {payload[0].payload.epaLimit} ppt
        </div>
      )}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────
function KPICard({
  label, value, unit, sub, icon: Icon, status, trend
}: {
  label: React.ReactNode; value: string | number; unit?: string; sub?: string;
  icon: any; status?: "danger" | "warning" | "safe" | "neutral"; trend?: "up" | "down" | "flat";
}) {
  const statusColors = {
    danger: "text-red-500", warning: "text-amber-500",
    safe: "text-green-500", neutral: "text-primary",
  };
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "down" ? "text-green-500" : trend === "up" ? "text-red-500" : "text-muted-foreground";

  return (
    <Card className="relative overflow-hidden" data-testid="kpi-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={`p-2 rounded-lg bg-muted ${statusColors[status ?? "neutral"]}`}>
            <Icon size={18} />
          </div>
          {trend && (
            <span className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon size={12} />
            </span>
          )}
        </div>
        <div className={`text-2xl font-bold tabular count-anim ${statusColors[status ?? "neutral"]}`}>
          {value}{unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
      {status === "danger" && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500" />
      )}
      {status === "warning" && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-amber-500 to-yellow-400" />
      )}
    </Card>
  );
}

// ── Consultation + Alert Dialog ────────────────────────────────
function AlertSetupDialog({ alerts, onDelete, prefilledZip, prefilledContaminant, pfosLevel, pfoaLevel }: {
  alerts: Alert[];
  onDelete: (id: number) => void;
  prefilledZip?: string;
  prefilledContaminant?: string;
  pfosLevel?: number;
  pfoaLevel?: number;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"consult" | "alert">("consult");
  const [submitted, setSubmitted] = useState(false);

  // Lead capture form
  const [lead, setLead] = useState({
    name: "", email: "", phone: "",
    zipCode: prefilledZip || "",
    contaminantConcern: prefilledContaminant || "PFOS, PFOA",
    message: "",
    source: "water-alert",
  });
  const [leadErrors, setLeadErrors] = useState<Record<string, string>>({});

  const validateLead = () => {
    const errs: Record<string, string> = {};
    if (!lead.name.trim()) errs.name = "Name is required";
    if (!lead.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) errs.email = "Valid email required";
    if (!lead.phone.trim() || lead.phone.replace(/\D/g, "").length < 10) errs.phone = "Valid phone required";
    if (!lead.zipCode.trim() || !/^\d{5}$/.test(lead.zipCode)) errs.zipCode = "5-digit ZIP required";
    return errs;
  };

  const leadMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/leads", data),
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Request sent!", description: "A water filtration specialist will contact you shortly." });
    },
    onError: () => {
      toast({ title: "Something went wrong", description: "Please try again or call us directly.", variant: "destructive" });
    },
  });

  const handleLeadSubmit = () => {
    const errs = validateLead();
    if (Object.keys(errs).length > 0) { setLeadErrors(errs); return; }
    setLeadErrors({});
    leadMutation.mutate({
      ...lead,
      pfosLevel: pfosLevel != null ? String(pfosLevel) : undefined,
      pfoaLevel: pfoaLevel != null ? String(pfoaLevel) : undefined,
      createdAt: new Date().toISOString(),
    });
  };

  // Alert form
  const [alertForm, setAlertForm] = useState({
    contaminant: prefilledContaminant || "PFOS",
    threshold: "4",
    zipCode: prefilledZip || "",
    email: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/alerts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "Alert created", description: `Monitoring ${alertForm.contaminant} above ${alertForm.threshold} ppt` });
      setAlertForm(f => ({ ...f, email: "" }));
    },
  });

  return (
    <DialogContent className="sm:max-w-[520px] p-0 overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${tab === "consult" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          onClick={() => setTab("consult")}
          data-testid="tab-consult"
        >
          <Wrench size={15} />
          Free Consultation
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${tab === "alert" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          onClick={() => setTab("alert")}
          data-testid="tab-alert"
        >
          <Bell size={15} />
          Set Alert
          {alerts.length > 0 && <Badge className="h-4 px-1 text-[10px]">{alerts.length}</Badge>}
        </button>
      </div>

      {/* ── CONSULTATION TAB ── */}
      {tab === "consult" && (
        <div className="p-5">
          {submitted ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-bold text-lg">You're all set!</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                A licensed South Florida water filtration specialist will reach out within 24 hours.
              </p>
              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground text-left space-y-1">
                <p><strong>What happens next:</strong></p>
                <p>✓ We'll review your local water quality data</p>
                <p>✓ Recommend the right filtration solution for your home</p>
                <p>✓ Provide a free no-obligation quote</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-4">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Wrench size={14} className="text-primary" />
                    </div>
                    Free Water Quality Consultation
                  </DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Palm Beach County PFOS levels reach <strong className="text-red-600 dark:text-red-400">18 ppt</strong> — 4.5× the EPA limit. Get a free assessment and filtration recommendation.
                </p>
              </div>

              {/* Context pills */}
              {(pfosLevel != null || pfoaLevel != null) && (
                <div className="flex gap-2 mb-4">
                  {pfosLevel != null && (
                    <div className={`flex-1 px-3 py-2 rounded-lg text-center text-xs ${pfosLevel > 4 ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"}`}>
                      <div className={`font-bold text-sm ${pfosLevel > 4 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{pfosLevel} ppt</div>
                      <div className="text-muted-foreground">PFOS in your area</div>
                    </div>
                  )}
                  {pfoaLevel != null && (
                    <div className={`flex-1 px-3 py-2 rounded-lg text-center text-xs ${pfoaLevel > 4 ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" : "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"}`}>
                      <div className={`font-bold text-sm ${pfoaLevel > 4 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{pfoaLevel} ppt</div>
                      <div className="text-muted-foreground">PFOA in your area</div>
                    </div>
                  )}
                  <div className="flex-1 px-3 py-2 rounded-lg text-center text-xs bg-muted border border-border">
                    <div className="font-bold text-sm text-muted-foreground">4 ppt</div>
                    <div className="text-muted-foreground">EPA Limit</div>
                  </div>
                </div>
              )}

              {/* Form fields */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Full Name *</Label>
                    <div className="relative">
                      <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        data-testid="input-lead-name"
                        className={`pl-8 text-sm h-9 ${leadErrors.name ? "border-red-400" : ""}`}
                        placeholder="Jane Smith"
                        value={lead.name}
                        onChange={e => setLead(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    {leadErrors.name && <p className="text-xs text-red-500">{leadErrors.name}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ZIP Code *</Label>
                    <div className="relative">
                      <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        data-testid="input-lead-zip"
                        className={`pl-8 text-sm h-9 ${leadErrors.zipCode ? "border-red-400" : ""}`}
                        placeholder="33401"
                        maxLength={5}
                        value={lead.zipCode}
                        onChange={e => setLead(f => ({ ...f, zipCode: e.target.value.replace(/\D/g, "") }))}
                      />
                    </div>
                    {leadErrors.zipCode && <p className="text-xs text-red-500">{leadErrors.zipCode}</p>}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Email Address *</Label>
                  <Input
                    data-testid="input-lead-email"
                    type="email"
                    className={`text-sm h-9 ${leadErrors.email ? "border-red-400" : ""}`}
                    placeholder="jane@example.com"
                    value={lead.email}
                    onChange={e => setLead(f => ({ ...f, email: e.target.value }))}
                  />
                  {leadErrors.email && <p className="text-xs text-red-500">{leadErrors.email}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Phone Number *</Label>
                  <div className="relative">
                    <Phone size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      data-testid="input-lead-phone"
                      type="tel"
                      className={`pl-8 text-sm h-9 ${leadErrors.phone ? "border-red-400" : ""}`}
                      placeholder="(561) 555-0100"
                      value={lead.phone}
                      onChange={e => setLead(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  {leadErrors.phone && <p className="text-xs text-red-500">{leadErrors.phone}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Primary Concern</Label>
                  <Select value={lead.contaminantConcern ?? ""} onValueChange={v => setLead(f => ({ ...f, contaminantConcern: v }))}>
                    <SelectTrigger className="text-sm h-9" data-testid="select-lead-concern">
                      <SelectValue placeholder="What are you most concerned about?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PFOS, PFOA">PFOS & PFOA (Forever Chemicals)</SelectItem>
                      <SelectItem value="Lead">Lead contamination</SelectItem>
                      <SelectItem value="General PFAS">General PFAS / Chemicals</SelectItem>
                      <SelectItem value="All contaminants">Overall water quality</SelectItem>
                      <SelectItem value="Taste and odor">Taste & odor issues</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Additional notes <span className="text-muted-foreground">(optional)</span></Label>
                  <textarea
                    data-testid="input-lead-message"
                    className="w-full text-sm rounded-md border border-input bg-background px-3 py-2 min-h-[60px] resize-none text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="e.g. Have well water, baby at home, interested in whole-house filtration…"
                    value={lead.message}
                    onChange={e => setLead(f => ({ ...f, message: e.target.value }))}
                  />
                </div>

                <Button
                  data-testid="button-submit-lead"
                  className="w-full h-10 font-semibold gap-2"
                  onClick={handleLeadSubmit}
                  disabled={leadMutation.isPending}
                >
                  {leadMutation.isPending ? (
                    "Sending…"
                  ) : (
                    <><Sparkles size={15} /> Get My Free Consultation</>
                  )}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  No obligation · Licensed South Florida plumber · Serving Palm Beach County
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ALERT TAB ── */}
      {tab === "alert" && (
        <div className="p-5">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell size={16} className="text-primary" /> Contaminant Threshold Alerts
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Contaminant</Label>
                <Select value={alertForm.contaminant} onValueChange={v => setAlertForm(f => ({ ...f, contaminant: v }))}>
                  <SelectTrigger data-testid="select-contaminant" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTAMINANTS.filter(c => c.value !== "all").map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Threshold (ppt)</Label>
                <Input
                  data-testid="input-threshold"
                  type="number"
                  step="0.1"
                  className="h-9 text-sm"
                  value={alertForm.threshold}
                  onChange={e => setAlertForm(f => ({ ...f, threshold: e.target.value }))}
                  placeholder="e.g. 4"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ZIP Code (optional)</Label>
              <Input
                data-testid="input-zip-alert"
                className="h-9 text-sm"
                value={alertForm.zipCode}
                onChange={e => setAlertForm(f => ({ ...f, zipCode: e.target.value }))}
                placeholder="e.g. 33401"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email (optional)</Label>
              <Input
                data-testid="input-email"
                type="email"
                className="h-9 text-sm"
                value={alertForm.email}
                onChange={e => setAlertForm(f => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <Button
              data-testid="button-create-alert"
              className="w-full h-9"
              onClick={() => createMutation.mutate({ ...alertForm, threshold: parseFloat(alertForm.threshold), unit: "ppt", active: 1, createdAt: new Date().toISOString() })}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create Alert"}
            </Button>
          </div>

          {alerts.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Active Alerts ({alerts.length})</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {alerts.map(a => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg alert-active border border-transparent" data-testid={`alert-item-${a.id}`}>
                    <div>
                      <ChemicalTag name={a.contaminant} variant="inline" className="font-semibold text-sm" />
                      <span className="text-muted-foreground text-xs"> &gt; {a.threshold} {a.unit}</span>
                      {a.zipCode && <span className="text-xs text-muted-foreground"> · {a.zipCode}</span>}
                    </div>
                    <button onClick={() => onDelete(a.id)} className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-delete-alert-${a.id}`}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </DialogContent>
  );
}

// ── National Comparison Bar ────────────────────────────────────
function ComparisonBar({ label, pbValue, nationalAvg, epaLimit, ewgLimit, color, unit }: {
  label: string; pbValue: number; nationalAvg: number; epaLimit: number; ewgLimit: number; color: string; unit: string;
}) {
  const max = Math.max(epaLimit * 1.3, pbValue * 1.2, nationalAvg * 1.2);
  const bars = [
    { name: "Palm Beach", value: pbValue, fill: color },
    { name: "National Avg", value: nationalAvg, fill: "#64748b" },
  ];
  const risk = getRiskLevel(pbValue, epaLimit);

  return (
    <div className="space-y-2" data-testid={`comparison-${label}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`status-dot ${risk}`} />
          <ChemicalTag name={label} variant="inline" className="text-sm font-medium" />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>EPA MCL: <strong className="text-foreground">{epaLimit} {unit}</strong></span>
          <span>EWG: <strong className="text-foreground">{ewgLimit} {unit}</strong></span>
        </div>
      </div>
      <div className="h-20">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, max]} hide />
            <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
            <Tooltip
              content={({ active, payload }) => active && payload?.length ? (
                <div className="bg-card border border-border rounded p-2 text-xs">
                  <p>{payload[0]?.payload?.name}: <strong>{fmt(payload[0]?.value as number, 2)} {unit}</strong></p>
                </div>
              ) : null}
            />
            <ReferenceLine x={epaLimit} stroke="#ef4444" strokeDasharray="4 2" label={{ value: "MCL", fill: "#ef4444", fontSize: 10, position: "right" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {bars.map((b) => <Cell key={b.name} fill={b.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const { theme, toggle } = useTheme();
  const { toast } = useToast();

  const [selectedZip, setSelectedZip] = useState<string>("all");
  const [selectedContaminant, setSelectedContaminant] = useState<string>("all");
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [trendContaminant, setTrendContaminant] = useState<string>("PFOS");

  // ── Static data (bundled at build time — no server needed for reads) ──
  const summary = useMemo(() => getSummary(selectedZip !== "all" ? selectedZip : undefined), [selectedZip]);
  const summaryLoading = false;

  const systems = useMemo(() => getWaterSystems(selectedZip !== "all" ? selectedZip : undefined), [selectedZip]);

  const violations = useMemo(() => getViolations({ zip: selectedZip !== "all" ? selectedZip : undefined }), [selectedZip]);
  const violationsLoading = false;

  const pfosTrend = useMemo(() => getTrends("FL4004801", "PFOS"), []);
  const pfoaTrend = useMemo(() => getTrends("FL4004801", "PFOA"), []);

  const allReadings = useMemo(() => getReadings({
    zip: selectedZip !== "all" ? selectedZip : undefined,
    contaminant: selectedContaminant !== "all" ? selectedContaminant : undefined,
  }), [selectedZip, selectedContaminant]);

  // ── Live queries (POST/DELETE — server required) ──────────────
  const { data: alerts = [] } = useQuery<Alert[]>({
    queryKey: ["/api/alerts"],
    queryFn: () => apiRequest("GET", "/api/alerts").then(r => r.json()),
  });

  // Delete alert mutation
  const deleteAlert = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/alerts"] }),
  });

  // ── Processed trend data ─────────────────────────────────────
  const combinedTrend = useMemo(() => {
    const dateMap = new Map<string, any>();
    for (const r of pfosTrend) {
      const d = r.sampleDate.slice(0, 7); // YYYY-MM
      if (!dateMap.has(d)) dateMap.set(d, { date: d, epaLimit: 4 });
      dateMap.get(d).PFOS = r.value;
    }
    for (const r of pfoaTrend) {
      const d = r.sampleDate.slice(0, 7);
      if (!dateMap.has(d)) dateMap.set(d, { date: d, epaLimit: 4 });
      dateMap.get(d).PFOA = r.value;
    }
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [pfosTrend, pfoaTrend]);

  // ── National comparison data ──────────────────────────────────
  const comparisonData = [
    { label: "PFOS", pbValue: summary?.latestPFOS ?? 0, nationalAvg: 3.2, epaLimit: 4, ewgLimit: 0.02, color: "#ef4444", unit: "ppt" },
    { label: "PFOA", pbValue: summary?.latestPFOA ?? 0, nationalAvg: 2.1, epaLimit: 4, ewgLimit: 0.004, color: "#f97316", unit: "ppt" },
  ];

  // Latest readings by system
  const latestBySystem = useMemo(() => {
    const map = new Map<string, Reading[]>();
    for (const r of allReadings) {
      if (!map.has(r.pwsid)) map.set(r.pwsid, []);
      map.get(r.pwsid)!.push(r);
    }
    return map;
  }, [allReadings]);

  const pfosStatus = summary ? getRiskLevel(summary.latestPFOS, 4) : "safe";
  const pfoaStatus = summary ? getRiskLevel(summary.latestPFOA, 4) : "safe";

  const activeViolationsCount = violations.filter(v => v.status === "Ongoing").length;

  const triggerAlerts = useMemo(() => {
    // Deduplicate: one trigger per alert (use the worst/max reading)
    const triggered: { alert: Alert; reading: Reading; count: number }[] = [];
    for (const alert of alerts) {
      const matchingReadings = allReadings.filter(
        r => r.contaminant === alert.contaminant && r.value > alert.threshold
      );
      if (matchingReadings.length > 0) {
        const worst = matchingReadings.reduce((a, b) => a.value > b.value ? a : b);
        triggered.push({ alert, reading: worst, count: matchingReadings.length });
      }
    }
    return triggered;
  }, [alerts, allReadings]);

  return (
    <div className="flex h-full bg-background">
      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 sidebar-scroll border-r border-border flex flex-col" style={{ background: 'hsl(218 30% 14%)', color: 'hsl(220 15% 85%)' }}>
        {/* Logo */}
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="AquaWatch">
              <circle cx="16" cy="16" r="14" fill="hsl(200 85% 32%)" opacity="0.15" />
              <path d="M16 4 C16 4 8 14 8 20 a8 8 0 0 0 16 0 C24 14 16 4 16 4Z" fill="hsl(200 85% 32%)" />
              <ellipse cx="13" cy="19" rx="2" ry="3" fill="white" opacity="0.35" transform="rotate(-20 13 19)" />
            </svg>
            <div>
              <p className="text-sm font-bold text-sidebar-foreground leading-tight">AquaWatch</p>
              <p className="text-[10px] text-sidebar-foreground/50 leading-tight">Palm Beach County</p>
            </div>
          </div>
        </div>

        {/* ZIP Filter */}
        <div className="p-3 border-b border-sidebar-border">
          <Label className="text-xs text-sidebar-foreground/60 mb-1.5 block">ZIP Code Filter</Label>
          <Select value={selectedZip} onValueChange={setSelectedZip}>
            <SelectTrigger data-testid="select-zip" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs h-8">
              <SelectValue placeholder="All ZIP codes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Palm Beach County</SelectItem>
              {PB_ZIPS.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Contaminant Filter */}
        <div className="p-3 border-b border-sidebar-border">
          <Label className="text-xs text-sidebar-foreground/60 mb-1.5 block">Contaminant</Label>
          <Select value={selectedContaminant} onValueChange={setSelectedContaminant}>
            <SelectTrigger data-testid="select-contaminant-filter" className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTAMINANTS.map(c => <SelectItem key={c.value} value={c.value}>{c.value}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-3 space-y-0.5">
          {[
            { label: "Overview", icon: Activity, id: "overview" },
            { label: "PFAS Trends", icon: TrendingUp, id: "trends" },
            { label: "Violations", icon: ShieldAlert, id: "violations" },
            { label: "Comparisons", icon: Globe, id: "comparisons" },
            { label: "Water Systems", icon: MapPin, id: "systems" },
          ].map(item => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth" })}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
          <div className="pt-2 mt-2 border-t border-sidebar-border">
            <a
              href="/#/reports"
              data-testid="nav-ccr-reports"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <FileText size={14} />
              CCR Reports
            </a>
          </div>
        </nav>

        {/* Data sources */}
        <div className="p-3 border-t border-sidebar-border">
          <p className="text-[10px] text-sidebar-foreground/40 mb-2 font-medium uppercase tracking-wider">Data Sources</p>
          <div className="space-y-1">
            {[
              { label: "EPA SDWIS", url: "https://www.epa.gov/enviro/sdwis-overview" },
              { label: "EPA UCMR5", url: "https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule" },
              { label: "EWG Tap Water", url: "https://www.ewg.org/tapwater/" },
              { label: "Florida DEP", url: "https://floridadep.gov/water/source-drinking-water" },
            ].map(s => (
              <a key={s.label} href={s.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-sidebar-foreground/50 hover:text-sidebar-primary transition-colors">
                <ExternalLink size={9} />
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <h1 className="text-base font-bold text-foreground">Palm Beach County Tap Water Quality</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="status-dot safe" />
              Data from EPA SDWIS, UCMR5 &amp; EWG · Updated quarterly
              {summary?.lastUpdated && (
                <span className="ml-1">· Last fetched {new Date(summary.lastUpdated).toLocaleDateString()}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {triggerAlerts.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                <AlertTriangle size={12} />
  {triggerAlerts.length} alert{triggerAlerts.length > 1 ? "s" : ""} triggered
              </div>
            )}
            <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5" data-testid="button-alerts">
                  <Bell size={13} />
                  Alerts {alerts.length > 0 && <Badge className="ml-0.5 h-4 px-1 text-[10px]">{alerts.length}</Badge>}
                </Button>
              </DialogTrigger>
              <AlertSetupDialog
                alerts={alerts}
                onDelete={(id) => deleteAlert.mutate(id)}
                prefilledZip={selectedZip !== "all" ? selectedZip : undefined}
                prefilledContaminant={selectedContaminant !== "all" ? selectedContaminant : "PFOS"}
                pfosLevel={summary?.latestPFOS}
                pfoaLevel={summary?.latestPFOA}
              />
            </Dialog>
            <Button size="sm" variant="ghost" onClick={toggle} className="h-8 w-8 p-0" data-testid="button-theme">
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </Button>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 main-scroll px-6 py-5 space-y-6">
          {/* ── TRIGGERED ALERTS BANNER ── */}
          {triggerAlerts.length > 0 && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">Threshold Exceedance Detected</p>
                {triggerAlerts.map((t, i) => (
                  <p key={i} className="text-xs text-red-700 dark:text-red-400">
                    {t.reading.contaminant} peak {t.reading.value} ppt (in {t.reading.pwsid}) exceeds your alert threshold of {t.alert.threshold} ppt · {t.count} reading{t.count > 1 ? "s" : ""} affected
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION: OVERVIEW ── */}
          <section id="overview">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Overview</h2>
              <span className="text-xs text-muted-foreground">
                {selectedZip !== "all" ? `ZIP ${selectedZip}` : "Palm Beach County"} · {new Date().getFullYear()}
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPICard
                label={<span className="flex items-center gap-1">Latest <ChemicalTag name="PFOS" variant="badge" /></span>} value={fmt(summary?.latestPFOS ?? 0)} unit="ppt"
                sub="EPA limit: 4 ppt" icon={Droplets}
                status={pfosStatus} trend="up"
              />
              <KPICard
                label={<span className="flex items-center gap-1">Latest <ChemicalTag name="PFOA" variant="badge" /></span>} value={fmt(summary?.latestPFOA ?? 0)} unit="ppt"
                sub="EPA limit: 4 ppt" icon={Droplets}
                status={pfoaStatus} trend="up"
              />
              <KPICard
                label="Active Violations" value={activeViolationsCount}
                sub={`${violations.filter(v => v.isHealthBased === 1 && v.status === "Ongoing").length} health-based`}
                icon={ShieldAlert}
                status={activeViolationsCount > 0 ? "danger" : "safe"}
              />
              <KPICard
                label="Water Systems"
                value={summary?.systemCount ?? 0}
                sub={`${(summary?.populationServed ?? 0).toLocaleString()} served`}
                icon={MapPin} status="neutral"
              />
            </div>

            {/* EPA MCL Context */}
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-2.5">
              <Info size={14} className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <strong>EPA MCL for PFOS &amp; PFOA:</strong> 4 ppt (parts per trillion), finalized April 2024. Compliance required by 2029.
                EWG health guidelines are far stricter: PFOA at 0.004 ppt, PFOS at 0.02 ppt.
                Testing data sourced from <a href="https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule" target="_blank" rel="noopener noreferrer" className="underline">EPA UCMR5</a> and{" "}
                <a href="https://marinmurphylaw.com/pfas-water-contamination-palm-beach-county-water-utilities" target="_blank" rel="noopener noreferrer" className="underline">public records</a>.
              </p>
            </div>
          </section>

          {/* ── SECTION: PFAS TRENDS ── */}
          <section id="trends">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">PFAS Trends Since 2020</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">PBCWUD (Primary System)</span>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>PFOS &amp; PFOA Levels Over Time</span>
                  <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block"/><span>PFOS</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-500 inline-block"/><span>PFOA</span></span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 border-dashed border-t inline-block"/><span>EPA MCL</span></span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72" data-testid="chart-pfas-trend">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={combinedTrend} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false}
                        tickFormatter={v => {
                          const [y, m] = v.split("-");
                          return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)-1]} ${y.slice(2)}`;
                        }}
                        interval={3}
                      />
                      <YAxis tick={{ fontSize: 11 }} tickLine={false} label={{ value: "ppt", angle: -90, position: "insideLeft", offset: 10, style: { fontSize: 10 } }} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <ReferenceLine y={4} stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: "EPA MCL (4 ppt)", fill: "#ef4444", fontSize: 10, position: "insideTopRight" }} />
        
                      <Line type="monotone" dataKey="PFOS" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: "#ef4444" }} activeDot={{ r: 5 }} name="PFOS" />
                      <Line type="monotone" dataKey="PFOA" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3, fill: "#f97316" }} activeDot={{ r: 5 }} name="PFOA" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Source: <a href="https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule-data-finder" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">EPA UCMR5 Data Finder</a> · PBC Water Utilities WTP #2 &amp; WTP #8 Entry Points
                </p>
              </CardContent>
            </Card>

            {/* PFAS gauge summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {[
                { name: "PFOS", value: summary?.latestPFOS ?? 0, limit: 4, ewg: 0.02, color: "#ef4444" },
                { name: "PFOA", value: summary?.latestPFOA ?? 0, limit: 4, ewg: 0.004, color: "#f97316" },
                { name: "PFNA", value: 1.9, limit: 10, ewg: 0.3, color: "#a855f7" },
                { name: "PFHxS", value: 1.2, limit: 10, ewg: 0.1, color: "#eab308" },
              ].map(c => {
                const pct = Math.min((c.value / c.limit) * 100, 120);
                const status = getRiskLevel(c.value, c.limit);
                return (
                  <Card key={c.name} className="p-4" data-testid={`pfas-gauge-${c.name}`}>
                    <div className="h-16">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart cx="50%" cy="80%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} data={[{ value: Math.min(pct, 100), fill: c.color }]}>
                          <RadialBar dataKey="value" background={{ fill: "hsl(var(--muted))" }} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="text-center -mt-2">
                      <p className={`text-lg font-bold tabular ${status === "danger" ? "text-red-500" : status === "warning" ? "text-amber-500" : "text-green-500"}`}>
                        {fmt(c.value)} <span className="text-xs font-normal text-muted-foreground">ppt</span>
                      </p>
                      <ChemicalTag name={c.name} variant="badge" />
                      <p className="text-[10px] text-muted-foreground">MCL: {c.limit} · EWG: {c.ewg}</p>
                      <RiskBadge value={c.value} limit={c.limit} />
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* ── SECTION: VIOLATION HISTORY ── */}
          <section id="violations">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Violation History</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${activeViolationsCount > 0 ? "badge-danger" : "badge-safe"}`}>
                  {activeViolationsCount} Active
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium badge-info">
                  {violations.filter(v => v.status === "Resolved").length} Resolved
                </span>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                {violationsLoading ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">Loading violations…</div>
                ) : violations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground text-sm">No violations found for selected filters.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="violations-table">
                      <thead className="border-b border-border">
                        <tr className="text-left">
                          {["System", "Contaminant", "Type", "Category", "Start Date", "Status", "Description"].map(h => (
                            <th key={h} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {violations.map(v => {
                          const system = systems.find(s => s.pwsid === v.pwsid);
                          return (
                            <tr key={v.id} className="hover:bg-muted/30 transition-colors" data-testid={`violation-row-${v.id}`}>
                              <td className="px-4 py-3 text-xs font-medium whitespace-nowrap">
                                {system?.name?.split(" ").slice(0, 3).join(" ") ?? v.pwsid}
                              </td>
                              <td className="px-4 py-3">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CONTAMINANT_COLORS[v.contaminant] ?? "#94a3b8" }} />
                                  <ChemicalTag name={v.contaminant} variant="inline" className="text-xs font-semibold" />
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">{v.violationType}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs ${v.isHealthBased === 1 ? "badge-danger" : "badge-info"} px-1.5 py-0.5 rounded-full`}>
                                  {v.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground tabular whitespace-nowrap">{v.startDate}</td>
                              <td className="px-4 py-3">
                                <span className={`flex items-center gap-1.5 text-xs font-medium ${v.status === "Ongoing" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                  <span className={`status-dot ${v.status === "Ongoing" ? "danger" : "safe"}`} />
                                  {v.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs">
                                <p className="truncate" title={v.description ?? ""}>{v.description}</p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground mt-2">
              Source: <a href="https://www.epa.gov/enviro/sdwis-overview" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">EPA SDWIS Federal Reporting Services</a> · Violation history for last 10 years
            </p>
          </section>

          {/* ── SECTION: NATIONAL COMPARISONS ── */}
          <section id="comparisons">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">National Comparisons</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">PFAS vs. National Average &amp; Limits</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {comparisonData.map(c => (
                    <ComparisonBar key={c.label} {...c} />
                  ))}
                  <p className="text-xs text-muted-foreground pt-1">
                    National average from <a href="https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule-data-finder" target="_blank" rel="noopener noreferrer" className="underline">EPA UCMR5 national dataset</a> (2023–2025)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">All Contaminants — Latest Readings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3" data-testid="contaminant-list">
                    {allReadings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No readings match current filters.</p>
                    ) : (
                      (() => {
                        // Deduplicate: latest per contaminant per system
                        const seen = new Map<string, Reading>();
                        for (const r of [...allReadings].sort((a, b) => b.sampleDate.localeCompare(a.sampleDate))) {
                          const key = `${r.pwsid}-${r.contaminant}`;
                          if (!seen.has(key)) seen.set(key, r);
                        }
                        return Array.from(seen.values()).map(r => {
                          const system = systems.find(s => s.pwsid === r.pwsid);
                          const risk = r.epaLimit ? getRiskLevel(r.value, r.epaLimit) : "safe";
                          const pct = r.epaLimit ? Math.min((r.value / r.epaLimit) * 100, 100) : 0;
                          return (
                            <div key={`${r.pwsid}-${r.contaminant}`} data-testid={`reading-${r.contaminant}-${r.pwsid}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CONTAMINANT_COLORS[r.contaminant] ?? "#94a3b8" }} />
                                  <ChemicalTag name={r.contaminant} variant="inline" className="text-xs font-semibold" />
                                  <span className="text-[10px] text-muted-foreground">{system?.city}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="tabular text-xs font-bold">{fmt(r.value, 2)} {r.unit}</span>
                                  <RiskBadge value={r.value} limit={r.epaLimit ?? 999} />
                                </div>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    background: risk === "danger" ? "#ef4444" : risk === "warning" ? "#f59e0b" : "#22c55e"
                                  }}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{r.sampleDate} · {r.samplePoint}</p>
                            </div>
                          );
                        });
                      })()
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* ── SECTION: FREE CONSULTATION CTA ── */}
          <section id="consultation">
            <div
              className="relative overflow-hidden rounded-xl p-5 text-white"
              style={{ background: "linear-gradient(135deg, hsl(218 60% 18%) 0%, hsl(205 70% 28%) 100%)" }}
            >
              {/* Decorative drop */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
                <svg width="120" height="120" viewBox="0 0 28 28" fill="none">
                  <path d="M14 2 C14 2 4 13 4 19 C4 24 8.5 27 14 27 C19.5 27 24 24 24 19 C24 13 14 2 14 2Z" fill="white" />
                </svg>
              </div>

              <div className="relative flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-white/20 flex items-center justify-center">
                      <Wrench size={13} />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-white/70">Free Service · No Obligation</span>
                  </div>
                  <h3 className="text-lg font-bold leading-snug">
                    Is your tap water safe?<br />
                    <span className="text-blue-200">Get a free filtration assessment.</span>
                  </h3>
                  <p className="text-sm text-white/70 max-w-sm">
                    Local PFOS levels are {summary ? `${fmt(summary.latestPFOS)} ppt — ${(summary.latestPFOS / 4).toFixed(1)}× the EPA limit` : "above EPA limits"}. A licensed South Florida plumber will review your water data and recommend the right solution for your home.
                  </p>
                  <div className="flex flex-wrap gap-3 pt-1 text-xs text-white/60">
                    <span className="flex items-center gap-1"><CheckCircle2 size={11} /> Whole-house filtration</span>
                    <span className="flex items-center gap-1"><CheckCircle2 size={11} /> Reverse osmosis</span>
                    <span className="flex items-center gap-1"><CheckCircle2 size={11} /> Under-sink systems</span>
                  </div>
                </div>
                <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="bg-white text-blue-900 hover:bg-blue-50 font-bold text-sm h-11 px-6 flex-shrink-0 gap-2 shadow-lg"
                      data-testid="button-cta-consult"
                      onClick={() => setAlertDialogOpen(true)}
                    >
                      <Sparkles size={15} />
                      Get Free Consultation
                    </Button>
                  </DialogTrigger>
                </Dialog>
              </div>
            </div>
          </section>

          {/* ── SECTION: WATER SYSTEMS ── */}
          <section id="systems" className="pb-6">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">Water Systems</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {systems.map(s => {
                const zips: string[] = JSON.parse(s.zipCodes);
                const readings = latestBySystem.get(s.pwsid) ?? [];
                const pfos = readings.filter(r => r.contaminant === "PFOS").sort((a, b) => b.sampleDate.localeCompare(a.sampleDate))[0];
                const pfoa = readings.filter(r => r.contaminant === "PFOA").sort((a, b) => b.sampleDate.localeCompare(a.sampleDate))[0];
                const sysViolations = violations.filter(v => v.pwsid === s.pwsid && v.status === "Ongoing");
                return (
                  <Card key={s.pwsid} className="hover:shadow-md transition-shadow" data-testid={`system-card-${s.pwsid}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground">{s.city} · {s.pwsid}</p>
                        </div>
                        {sysViolations.length > 0 && (
                          <span className="badge-danger px-1.5 py-0.5 rounded-full text-[10px] font-medium ml-2 flex-shrink-0">
                            {sysViolations.length} violation{sysViolations.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] mt-2">
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-muted-foreground">Source</p>
                          <p className="font-semibold">{s.sourceType === "SW" ? "Surface Water" : s.sourceType === "GW" ? "Groundwater" : s.sourceType}</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded">
                          <p className="text-muted-foreground">Population</p>
                          <p className="font-semibold tabular">{s.populationServed.toLocaleString()}</p>
                        </div>
                      </div>
                      {(pfos || pfoa) && (
                        <div className="mt-2 flex gap-2">
                          {pfos && (
                            <div className={`flex-1 p-1.5 rounded text-center text-[10px] ${getRiskLevel(pfos.value, 4) === "danger" ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                              <p className="text-muted-foreground">PFOS</p>
                              <p className={`font-bold tabular ${getRiskLevel(pfos.value, 4) === "danger" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                {fmt(pfos.value)} ppt
                              </p>
                            </div>
                          )}
                          {pfoa && (
                            <div className={`flex-1 p-1.5 rounded text-center text-[10px] ${getRiskLevel(pfoa.value, 4) === "danger" ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20"}`}>
                              <p className="text-muted-foreground">PFOA</p>
                              <p className={`font-bold tabular ${getRiskLevel(pfoa.value, 4) === "danger" ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                                {fmt(pfoa.value)} ppt
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {zips.slice(0, 5).map(z => (
                          <span key={z} className="px-1 py-0.5 bg-muted text-muted-foreground rounded text-[9px] tabular">{z}</span>
                        ))}
                        {zips.length > 5 && <span className="text-[9px] text-muted-foreground">+{zips.length - 5} more</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Sources: <a href="https://www.epa.gov/enviro/sdwis-overview" target="_blank" rel="noopener noreferrer" className="underline">EPA SDWIS</a> ·{" "}
              <a href="https://www.epa.gov/pfas/pfas-analytic-tools" target="_blank" rel="noopener noreferrer" className="underline">EPA PFAS Analytic Tools</a> ·{" "}
              <a href="https://www.ewg.org/tapwater/" target="_blank" rel="noopener noreferrer" className="underline">EWG Tap Water Database</a> ·{" "}
              <a href="https://marinmurphylaw.com/pfas-water-contamination-palm-beach-county-water-utilities" target="_blank" rel="noopener noreferrer" className="underline">Palm Beach County PFAS Records (Nov 2024)</a>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
