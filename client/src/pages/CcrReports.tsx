import { useState, useMemo } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { getZipCcr, type ZipCcrEntry } from "@/data/staticData";
import { ChemicalTag } from "@/components/ChemicalTag";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText, ExternalLink, Search, Sun, Moon, Download,
  MapPin, AlertTriangle, CheckCircle, Info,
  Building2, X, Droplets, Link, ChevronRight,
  Calendar, Globe
} from "lucide-react";

const EPA_MCL = 4;

// ── Helpers ─────────────────────────────────────────────────────
function pfasColor(level: number | null): string {
  if (level === null) return "text-muted-foreground";
  if (level > EPA_MCL) return "text-red-500 dark:text-red-400";
  if (level > EPA_MCL * 0.75) return "text-yellow-500 dark:text-yellow-400";
  return "text-green-500 dark:text-green-400";
}

function pfasBg(level: number | null): string {
  if (level === null) return "bg-muted/40";
  if (level > EPA_MCL) return "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40";
  if (level > EPA_MCL * 0.75) return "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40";
  return "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40";
}

function statusBadge(entry: ZipCcrEntry) {
  const maxPfas = Math.max(entry.pfosLevel ?? 0, entry.pfoaLevel ?? 0);
  if (maxPfas > EPA_MCL) return { label: "PFAS Detected", variant: "destructive" as const, icon: <AlertTriangle className="h-3 w-3" /> };
  if (entry.violationCount > 0) return { label: `${entry.violationCount} Violation${entry.violationCount > 1 ? "s" : ""}`, variant: "secondary" as const, icon: <AlertTriangle className="h-3 w-3 text-yellow-500" /> };
  return { label: "Within Limits", variant: "secondary" as const, icon: <CheckCircle className="h-3 w-3 text-green-500" /> };
}

// ── ZIP Card ────────────────────────────────────────────────────
function ZipCard({ entry, highlight }: { entry: ZipCcrEntry; highlight: boolean }) {
  const badge = statusBadge(entry);
  const hasData = entry.pfosLevel !== null || entry.pfoaLevel !== null;
  const isPdf = entry.latestReportType === "PDF";

  return (
    <Card
      className={`transition-shadow hover:shadow-md ${highlight ? "ring-2 ring-primary" : ""} ${entry.pfosLevel !== null && entry.pfosLevel > EPA_MCL ? "border-red-300 dark:border-red-800/50" : ""}`}
      data-testid={`card-zip-${entry.zipCode}`}
    >
      <CardContent className="p-4 space-y-3">
        {/* ZIP + city header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-lg leading-none">{entry.zipCode}</span>
              {highlight && <Badge variant="default" className="text-[10px] px-1.5 py-0.5">Your ZIP</Badge>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {entry.city}
            </div>
          </div>
          <Badge
            variant={badge.variant}
            className={`text-xs gap-1 flex-shrink-0 ${badge.label === "Within Limits" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/40" : ""}`}
          >
            {badge.icon}
            {badge.label}
          </Badge>
        </div>

        {/* Utility */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3 flex-shrink-0" />
          <span className="line-clamp-1">{entry.utilityName}</span>
          {entry.pwsid && <span className="font-mono bg-muted px-1 rounded text-[10px] flex-shrink-0">{entry.pwsid}</span>}
        </div>

        {/* PFAS pills */}
        {hasData && (
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-md px-2 py-1.5 text-center ${pfasBg(entry.pfosLevel)}`}>
              <div className="text-[10px] text-muted-foreground mb-0.5"><ChemicalTag name="PFOS" variant="plain" className="text-[10px] text-muted-foreground" /></div>
              <div className={`text-sm font-bold ${pfasColor(entry.pfosLevel)}`}>
                {entry.pfosLevel != null ? `${entry.pfosLevel} ppt` : "—"}
              </div>
            </div>
            <div className={`rounded-md px-2 py-1.5 text-center ${pfasBg(entry.pfoaLevel)}`}>
              <div className="text-[10px] text-muted-foreground mb-0.5"><ChemicalTag name="PFOA" variant="plain" className="text-[10px] text-muted-foreground" /></div>
              <div className={`text-sm font-bold ${pfasColor(entry.pfoaLevel)}`}>
                {entry.pfoaLevel != null ? `${entry.pfoaLevel} ppt` : "—"}
              </div>
            </div>
          </div>
        )}

        {/* Report year + links */}
        <div className="space-y-1.5">
          <Button
            size="sm"
            className="w-full gap-1.5 h-8 text-xs"
            variant={isPdf ? "default" : "outline"}
            data-testid={`link-latest-${entry.zipCode}`}
            onClick={() => window.open(entry.latestReportUrl, "_blank", "noopener,noreferrer")}
          >
            {isPdf ? <Download className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
            {entry.latestYear} CCR {isPdf ? "— Download PDF" : "— View Report"}
          </Button>
          {entry.priorYear && entry.priorReportUrl && (
            <button
              data-testid={`link-prior-${entry.zipCode}`}
              onClick={() => window.open(entry.priorReportUrl!, "_blank", "noopener,noreferrer")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 w-full"
            >
              <Calendar className="h-3 w-3" />
              {entry.priorYear} report
              <ExternalLink className="h-2.5 w-2.5 ml-auto" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────────────
export default function CcrReports() {
  const { theme, toggleTheme } = useTheme();
  const [zipInput, setZipInput] = useState("");
  const [searchedZip, setSearchedZip] = useState("");
  const [cityFilter, setCityFilter] = useState("All");

  const allEntries: ZipCcrEntry[] = useMemo(() => getZipCcr(), []);
  const isLoading = false;

  // Unique cities for filter
  const cities = useMemo(() => {
    const s = new Set(allEntries.map(e => e.city.split(" / ")[0].split(" (")[0]));
    return ["All", ...Array.from(s).sort()];
  }, [allEntries]);

  // Filter logic
  const filtered = useMemo(() => {
    return allEntries.filter(e => {
      if (searchedZip && e.zipCode !== searchedZip) return false;
      if (cityFilter !== "All") {
        if (!e.city.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [allEntries, searchedZip, cityFilter]);

  // Stats
  const exceedCount = allEntries.filter(e => (e.pfosLevel ?? 0) > EPA_MCL || (e.pfoaLevel ?? 0) > EPA_MCL).length;

  const handleSearch = () => {
    const z = zipInput.trim();
    if (/^\d{5}$/.test(z)) {
      setSearchedZip(z);
      setCityFilter("All");
    }
  };

  const clearSearch = () => {
    setSearchedZip("");
    setZipInput("");
  };

  const searchResult = searchedZip ? allEntries.find(e => e.zipCode === searchedZip) : null;
  const notFound = searchedZip && !searchResult;

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className="w-48 flex-shrink-0 flex flex-col"
        style={{ background: "hsl(218 30% 14%)", color: "hsl(220 15% 85%)" }}
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2 mb-1">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="AquaWatch logo">
              <circle cx="14" cy="14" r="12" fill="hsl(205 70% 45%)" opacity="0.2" />
              <path d="M14 4 C14 4 8 11 8 16 C8 19.3 10.7 22 14 22 C17.3 22 20 19.3 20 16 C20 11 14 4 14 4Z" fill="hsl(205 70% 55%)" />
              <ellipse cx="11.5" cy="15" rx="2" ry="3" fill="white" opacity="0.3" transform="rotate(-20 11.5 15)" />
            </svg>
            <div>
              <div className="font-bold text-sm leading-tight" style={{ color: "hsl(220 15% 95%)" }}>AquaWatch</div>
              <div className="text-xs" style={{ color: "hsl(220 15% 60%)" }}>Palm Beach County</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <a href="/#/" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors hover:bg-white/10" style={{ color: "hsl(220 15% 70%)" }}>
            <Droplets className="h-4 w-4" />
            Dashboard
          </a>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ background: "hsl(205 70% 45% / 0.25)", color: "hsl(205 70% 75%)" }}>
            <FileText className="h-4 w-4" />
            CCR Reports
          </div>
        </nav>

        {/* Stats */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(220 15% 45%)" }}>COVERAGE</div>
          <div className="text-xs" style={{ color: "hsl(220 15% 65%)" }}>
            <span className="font-bold text-white">{allEntries.length}</span> ZIP codes indexed
          </div>
          <div className="text-xs" style={{ color: "hsl(220 15% 65%)" }}>
            <span className="font-bold text-red-400">{exceedCount}</span> ZIPs with PFAS above EPA limit
          </div>
        </div>

        <div className="p-3 border-t border-white/10">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "hsl(220 15% 45%)" }}>DATA SOURCES</div>
          <div className="space-y-1">
            {[
              { label: "EPA SDWIS", href: "https://sdwis.epa.gov" },
              { label: "EPA UCMR5", href: "https://www.epa.gov/dwucmr" },
              { label: "Florida DEP", href: "https://floridadep.gov/water/source-drinking-water/content/consumer-confidence-reports-ccrs" },
              { label: "EPA CCR Info", href: "https://www.epa.gov/ccr" },
            ].map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs hover:underline" style={{ color: "hsl(220 15% 55%)" }}>
                <ExternalLink className="h-3 w-3" />
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b bg-background">
          <div>
            <h1 className="text-xl font-bold">CCR Reports by ZIP Code</h1>
            <p className="text-sm text-muted-foreground">
              Consumer Confidence Reports for every ZIP in Palm Beach County — search yours to get the exact report
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://www.epa.gov/ccr" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ExternalLink className="h-4 w-4" />
              What is a CCR?
            </a>
            <Button variant="ghost" size="icon" onClick={toggleTheme} data-testid="button-toggle-theme">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
          </div>
        </header>

        {/* Search bar + filters */}
        <div className="flex-shrink-0 px-6 py-4 border-b bg-muted/20">
          <div className="flex flex-wrap items-end gap-3">
            {/* ZIP search — primary */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Search by ZIP Code</label>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    data-testid="input-zip-search"
                    className="pl-9 w-40 font-mono"
                    placeholder="e.g. 33401"
                    value={zipInput}
                    maxLength={5}
                    onChange={e => setZipInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={e => e.key === "Enter" && handleSearch()}
                  />
                </div>
                <Button data-testid="button-search" onClick={handleSearch} disabled={zipInput.length !== 5}>
                  Find My CCR
                </Button>
                {searchedZip && (
                  <Button variant="ghost" size="icon" onClick={clearSearch} data-testid="button-clear">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* City filter — only show when not searching a specific ZIP */}
            {!searchedZip && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter by City</label>
                <div className="flex flex-wrap gap-1.5">
                  {["All", "Boca Raton", "Boynton Beach", "Delray Beach", "Jupiter", "Lake Worth Beach", "Palm Beach Gardens", "Riviera Beach", "Royal Palm Beach", "Wellington", "West Palm Beach"].map(c => (
                    <button
                      key={c}
                      onClick={() => setCityFilter(c)}
                      data-testid={`filter-city-${c.replace(/\s/g, "-").toLowerCase()}`}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${cityFilter === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Result count / active filter info */}
          {(searchedZip || cityFilter !== "All") && (
            <div className="flex items-center gap-2 mt-3 text-sm">
              {searchedZip ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  Showing CCR for ZIP <strong className="text-foreground font-mono">{searchedZip}</strong>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  <strong className="text-foreground">{filtered.length}</strong> ZIP codes in {cityFilter}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="flex-shrink-0 px-6 pt-4">
          <div className="p-3 rounded-lg border bg-blue-500/5 border-blue-500/15 flex gap-2.5 text-sm">
            <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <span className="text-muted-foreground">
              Every utility in Palm Beach County must publish an annual CCR by July 1st.
              PFAS levels shown where available from EPA UCMR5 data —{" "}
              <strong className="text-foreground">PFAS MCL enforcement begins 2029</strong>, so levels above 4 ppt may not appear as official violations yet.{" "}
              <a href="https://www.epa.gov/ccr" target="_blank" rel="noopener noreferrer" className="underline text-blue-500">EPA CCR guide →</a>
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : notFound ? (
            <div className="text-center py-20">
              <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-1">ZIP {searchedZip} not found</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                This ZIP code doesn't appear to be in Palm Beach County. Try a different ZIP, or browse all reports below.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearSearch}>
                Show all ZIPs
              </Button>
            </div>
          ) : searchedZip && searchResult ? (
            /* ── Single ZIP result — prominent layout ── */
            <div className="max-w-xl mx-auto space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
                Showing CCR report for <strong className="text-foreground font-mono">{searchedZip}</strong>
                <Button variant="ghost" size="sm" onClick={clearSearch} className="ml-auto gap-1 text-xs h-7">
                  <X className="h-3 w-3" /> Show all ZIPs
                </Button>
              </div>

              {/* Big card for the single result */}
              <Card className={`border-2 ${(searchResult.pfosLevel ?? 0) > EPA_MCL ? "border-red-400 dark:border-red-700" : "border-primary/40"}`}>
                <CardContent className="p-6 space-y-5">
                  {/* ZIP + city */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-black text-3xl">{searchResult.zipCode}</span>
                        <Badge variant="default" className="text-xs">Your ZIP</Badge>
                      </div>
                      <div className="text-base font-semibold">{searchResult.city}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-3.5 w-3.5" />
                        {searchResult.utilityName}
                        {searchResult.pwsid && <span className="font-mono text-xs bg-muted px-1.5 rounded ml-1">{searchResult.pwsid}</span>}
                      </div>
                    </div>
                    {(() => { const b = statusBadge(searchResult); return <Badge variant={b.variant} className={`text-sm gap-1.5 px-3 py-1 ${b.label === "Within Limits" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : ""}`}>{b.icon}{b.label}</Badge>; })()}
                  </div>

                  {/* PFAS data */}
                  {(searchResult.pfosLevel !== null || searchResult.pfoaLevel !== null) && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`rounded-lg p-3 text-center ${pfasBg(searchResult.pfosLevel)}`}>
                        <div className="text-xs text-muted-foreground mb-1"><ChemicalTag name="PFOS" variant="plain" className="text-xs text-muted-foreground" /></div>
                        <div className={`text-xl font-black ${pfasColor(searchResult.pfosLevel)}`}>{searchResult.pfosLevel ?? "—"} <span className="text-sm font-normal">ppt</span></div>
                        {searchResult.pfosLevel !== null && searchResult.pfosLevel > EPA_MCL && <div className="text-[10px] text-red-500 mt-0.5">{(searchResult.pfosLevel / EPA_MCL).toFixed(1)}× EPA limit</div>}
                      </div>
                      <div className={`rounded-lg p-3 text-center ${pfasBg(searchResult.pfoaLevel)}`}>
                        <div className="text-xs text-muted-foreground mb-1"><ChemicalTag name="PFOA" variant="plain" className="text-xs text-muted-foreground" /></div>
                        <div className={`text-xl font-black ${pfasColor(searchResult.pfoaLevel)}`}>{searchResult.pfoaLevel ?? "—"} <span className="text-sm font-normal">ppt</span></div>
                        {searchResult.pfoaLevel !== null && searchResult.pfoaLevel > EPA_MCL && <div className="text-[10px] text-red-500 mt-0.5">{(searchResult.pfoaLevel / EPA_MCL).toFixed(1)}× EPA limit</div>}
                      </div>
                      <div className="rounded-lg p-3 text-center bg-muted/40 border">
                        <div className="text-xs text-muted-foreground mb-1">EPA Limit</div>
                        <div className="text-xl font-black text-muted-foreground">4 <span className="text-sm font-normal">ppt</span></div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">PFOS & PFOA</div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {searchResult.notes && (
                    <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground leading-relaxed">
                      {searchResult.notes}
                    </div>
                  )}

                  {/* Report buttons */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available Reports</div>
                    <Button
                      className="w-full gap-2 h-11 font-semibold"
                      data-testid="link-single-latest"
                      onClick={() => window.open(searchResult.latestReportUrl, "_blank", "noopener,noreferrer")}
                    >
                      {searchResult.latestReportType === "PDF" ? <Download className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                      {searchResult.latestYear} Consumer Confidence Report
                      {searchResult.latestReportType === "PDF" ? " — Download PDF" : " — View Online"}
                    </Button>
                    {searchResult.priorYear && searchResult.priorReportUrl && (
                      <Button
                        variant="outline"
                        className="w-full gap-2 h-9 text-sm"
                        data-testid="link-single-prior"
                        onClick={() => window.open(searchResult.priorReportUrl!, "_blank", "noopener,noreferrer")}
                      >
                        <Calendar className="h-4 w-4" />
                        {searchResult.priorYear} Report
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="w-full gap-2 h-8 text-xs text-muted-foreground"
                      onClick={() => window.open("https://floridadep.gov/water/source-drinking-water/content/consumer-confidence-reports-ccrs", "_blank", "noopener,noreferrer")}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Find older reports on Florida DEP portal
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* ── Default: full grid of all ZIPs ── */
            <>
              {filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No results for "{cityFilter}". <button onClick={() => setCityFilter("All")} className="underline">Clear filter</button></p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.map(entry => (
                    <ZipCard key={entry.zipCode} entry={entry} highlight={entry.zipCode === searchedZip} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="mt-8 pt-5 border-t text-center text-xs text-muted-foreground space-y-1">
            <p>CCR data compiled from utility websites, EPA SDWIS, and <a href="https://floridadep.gov/water/source-drinking-water/content/consumer-confidence-reports-ccrs" target="_blank" rel="noopener noreferrer" className="underline">Florida DEP</a>. Report links go directly to utility-published sources.</p>
            <p>PFAS levels from EPA UCMR5 monitoring data · EPA MCL for PFOS &amp; PFOA: 4 ppt (enforcement 2029) · <a href="https://www.epa.gov/ccr" target="_blank" rel="noopener noreferrer" className="underline">EPA CCR Info</a></p>
          </div>
        </div>
      </main>
    </div>
  );
}
