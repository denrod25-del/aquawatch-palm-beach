import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, ShieldCheck, FileText, AlertTriangle } from "lucide-react";

export type VerificationTier = "cross_verified" | "source_linked" | "needs_review" | "unverified";

export interface VerificationProfile {
  pwsid: string;
  utilityName: string;
  tier: VerificationTier;
  readingCount: number;
  ccrReportCount: number;
  officialLinkedReportCount: number;
  benchmarkExceedanceCount: number;
  regulatoryViolationCount: number;
  unresolvedRegulatoryViolationCount: number;
  unresolvedBenchmarkCount: number;
  missingPwsid: boolean;
  needsReviewReasons: string[];
  recommendedNextAction: string;
}

function pretty(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function tierBadge(tier: VerificationTier) {
  if (tier === "cross_verified") {
    return {
      label: "Cross-Verified",
      className: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/40",
      icon: <ShieldCheck className="h-3 w-3" />,
    };
  }
  if (tier === "source_linked") {
    return {
      label: "Source Linked",
      className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40",
      icon: <ShieldCheck className="h-3 w-3" />,
    };
  }
  if (tier === "unverified") {
    return {
      label: "Unverified",
      className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40",
      icon: <ShieldAlert className="h-3 w-3" />,
    };
  }
  return {
    label: "Needs Review",
    className: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/40",
    icon: <ShieldAlert className="h-3 w-3" />,
  };
}

export function VerificationStatusPanel({ profiles }: { profiles: VerificationProfile[] }) {
  const crossVerified = profiles.filter(p => p.tier === "cross_verified").length;
  const sourceLinked = profiles.filter(p => p.tier === "source_linked").length;
  const needsReview = profiles.filter(p => p.tier === "needs_review").length;
  const unverified = profiles.filter(p => p.tier === "unverified").length;
  const unresolvedBenchmarks = profiles.reduce((sum, p) => sum + p.unresolvedBenchmarkCount, 0);
  const unresolvedRegulatory = profiles.reduce((sum, p) => sum + p.unresolvedRegulatoryViolationCount, 0);

  const priorityProfiles = [...profiles]
    .sort((a, b) => {
      const score = (p: VerificationProfile) =>
        p.unresolvedRegulatoryViolationCount * 100 +
        p.unresolvedBenchmarkCount * 20 +
        p.needsReviewReasons.length * 5;
      return score(b) - score(a);
    })
    .slice(0, 5);

  return (
    <Card data-testid="verification-status-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Data Verification Status
          </span>
          <Badge variant="outline" className="text-xs">
            {profiles.length} utilities
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg border bg-green-50 dark:bg-green-900/10 p-2">
            <div className="font-bold text-green-700 dark:text-green-300">{crossVerified}</div>
            <div className="text-muted-foreground">Cross-verified</div>
          </div>
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 p-2">
            <div className="font-bold text-blue-700 dark:text-blue-300">{sourceLinked}</div>
            <div className="text-muted-foreground">Source linked</div>
          </div>
          <div className="rounded-lg border bg-yellow-50 dark:bg-yellow-900/10 p-2">
            <div className="font-bold text-yellow-700 dark:text-yellow-300">{needsReview}</div>
            <div className="text-muted-foreground">Needs review</div>
          </div>
          <div className="rounded-lg border bg-red-50 dark:bg-red-900/10 p-2">
            <div className="font-bold text-red-700 dark:text-red-300">{unverified}</div>
            <div className="text-muted-foreground">Unverified</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border bg-muted/30 p-2 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
            <span><strong>{unresolvedBenchmarks}</strong> unresolved benchmark exceedances</span>
          </div>
          <div className="rounded-lg border bg-muted/30 p-2 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-red-500" />
            <span><strong>{unresolvedRegulatory}</strong> unresolved regulatory records</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Priority Review Queue
          </div>
          {priorityProfiles.length === 0 ? (
            <div className="text-xs text-muted-foreground rounded-lg border bg-muted/30 p-3">
              No utility profiles available.
            </div>
          ) : (
            priorityProfiles.map(profile => {
              const badge = tierBadge(profile.tier);
              return (
                <div key={profile.pwsid} className="rounded-lg border p-3 space-y-2" data-testid={`verification-profile-${profile.pwsid}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{profile.utilityName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{profile.pwsid || "Missing PWSID"}</div>
                    </div>
                    <Badge variant="outline" className={`gap-1 ${badge.className}`}>
                      {badge.icon}
                      {badge.label}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    <Badge variant="outline">{profile.readingCount} readings</Badge>
                    <Badge variant="outline">{profile.ccrReportCount} reports</Badge>
                    <Badge variant="outline">{profile.benchmarkExceedanceCount} benchmarks</Badge>
                    <Badge variant="outline">{profile.regulatoryViolationCount} regulatory records</Badge>
                  </div>
                  {profile.needsReviewReasons.length > 0 && (
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {profile.needsReviewReasons.slice(0, 2).map(reason => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  <div className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Next:</strong> {profile.recommendedNextAction}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/10 p-3 text-xs text-blue-800 dark:text-blue-300">
          Benchmark exceedances are AquaWatch intelligence signals. Do not present them as legal violations unless official CCR, SDWIS, or UCMR5 verification confirms that status.
        </div>
      </CardContent>
    </Card>
  );
}
