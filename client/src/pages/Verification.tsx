import React, { useMemo } from "react";
import {
  getSummary,
  getUtilityVerificationProfiles,
  type UtilityVerificationProfile,
} from "@/data/staticData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileWarning,
  ShieldAlert,
  ArrowLeft,
} from "lucide-react";

function tierLabel(tier: UtilityVerificationProfile["tier"]) {
  switch (tier) {
    case "cross_verified": return "Cross-Verified";
    case "source_linked": return "Source Linked";
    case "needs_review": return "Needs Review";
    case "unverified": return "Unverified";
    default: return tier;
  }
}

function tierClass(tier: UtilityVerificationProfile["tier"]) {
  switch (tier) {
    case "cross_verified": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "source_linked": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "needs_review": return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "unverified": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    default: return "bg-muted text-muted-foreground";
  }
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold tabular mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="p-2 rounded-lg bg-muted text-primary">
            <Icon size={18} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Verification() {
  const profiles = useMemo(() => getUtilityVerificationProfiles(), []);
  const summary = useMemo(() => getSummary(), []);

  const utilitiesNeedingReview = profiles.filter(p => p.tier === "needs_review" || p.tier === "unverified");
  const crossVerifiedUtilities = profiles.filter(p => p.tier === "cross_verified");
  const benchmarkExceedances = profiles.reduce((sum, p) => sum + p.benchmarkExceedanceCount, 0);
  const regulatoryViolations = profiles.reduce((sum, p) => sum + p.regulatoryViolationCount, 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck size={18} className="text-primary" />
              <h1 className="text-lg font-bold">Utility Verification Dashboard</h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Separates AquaWatch benchmark intelligence from official regulatory findings.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2">
            <a href="/#/">
              <ArrowLeft size={14} />
              Back to Dashboard
            </a>
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Utilities Needing Review"
            value={utilitiesNeedingReview.length}
            sub="Not ready for public claims"
            icon={FileWarning}
          />
          <StatCard
            label="Cross-Verified Utilities"
            value={crossVerifiedUtilities.length}
            sub="CCR / SDWIS / UCMR checked"
            icon={CheckCircle2}
          />
          <StatCard
            label="Benchmark Exceedances"
            value={benchmarkExceedances}
            sub="AquaWatch health-threshold signals"
            icon={ShieldAlert}
          />
          <StatCard
            label="Regulatory Violations"
            value={regulatoryViolations}
            sub="Non-BENCHMARK records in dataset"
            icon={AlertTriangle}
          />
        </section>

        <section>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Database size={16} />
                  Utility Verification Queue
                </span>
                <Badge variant="outline">{profiles.length} utilities</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-y border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                <strong>Trust rule:</strong> BENCHMARK means AquaWatch risk/advisory signal. MCL, TT, and MR should only be treated as official regulatory findings after source verification.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr className="text-left">
                      {[
                        "Utility",
                        "Status",
                        "Readings",
                        "CCR Links",
                        "Benchmark",
                        "Regulatory",
                        "Recommended Next Action",
                      ].map(h => (
                        <th key={h} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {profiles.map(profile => (
                      <tr key={profile.pwsid} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 min-w-[240px]">
                          <p className="font-medium text-xs">{profile.utilityName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{profile.pwsid}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${tierClass(profile.tier)}`}>
                            {tierLabel(profile.tier)}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular text-xs">{profile.readingCount}</td>
                        <td className="px-4 py-3 tabular text-xs">
                          {profile.officialLinkedReportCount}/{profile.ccrReportCount}
                        </td>
                        <td className="px-4 py-3 tabular text-xs">
                          {profile.benchmarkExceedanceCount}
                          {profile.unresolvedBenchmarkCount > 0 && (
                            <span className="ml-1 text-amber-600 dark:text-amber-400">({profile.unresolvedBenchmarkCount} open)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular text-xs">
                          {profile.regulatoryViolationCount}
                          {profile.unresolvedRegulatoryViolationCount > 0 && (
                            <span className="ml-1 text-red-600 dark:text-red-400">({profile.unresolvedRegulatoryViolationCount} open)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground min-w-[300px]">
                          {profile.recommendedNextAction}
                          {profile.needsReviewReasons.length > 0 && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-[10px] text-primary">Review reasons</summary>
                              <ul className="list-disc pl-4 mt-1 space-y-0.5">
                                {profile.needsReviewReasons.map(reason => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Utilities Needing Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {utilitiesNeedingReview.length === 0 ? (
                <p className="text-sm text-muted-foreground">No utilities currently need review.</p>
              ) : utilitiesNeedingReview.map(profile => (
                <div key={profile.pwsid} className="p-3 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{profile.utilityName}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${tierClass(profile.tier)}`}>{tierLabel(profile.tier)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{profile.recommendedNextAction}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cross-Verified Utilities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {crossVerifiedUtilities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  None yet. A utility should only move here after CCR, SDWIS, and/or UCMR5 values are cross-checked.
                </p>
              ) : crossVerifiedUtilities.map(profile => (
                <div key={profile.pwsid} className="p-3 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
                  <p className="text-sm font-medium">{profile.utilityName}</p>
                  <p className="text-xs text-muted-foreground mt-1">{profile.recommendedNextAction}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          Dataset summary: {summary.systemCount} systems, {summary.activeBenchmarkExceedances ?? 0} active benchmark exceedances, {summary.activeRegulatoryViolations ?? 0} active regulatory records.
        </p>
      </main>
    </div>
  );
}
