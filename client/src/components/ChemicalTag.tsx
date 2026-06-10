import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

// ── Chemical definitions ────────────────────────────────────────
export const CHEMICAL_DEFS: Record<string, {
  fullName: string;
  aka?: string;
  category: string;
  description: string;
  healthEffects: string;
  epaLimit: string;
  ewgLimit?: string;
  source: string;
  sourceUrl: string;
  color: string;
}> = {
  PFOS: {
    fullName: "Perfluorooctane Sulfonic Acid",
    aka: "Forever Chemical",
    category: "PFAS",
    description:
      "A man-made fluorinated compound used in firefighting foam (AFFF), non-stick cookware, stain-resistant fabrics, and food packaging. Extremely persistent — it does not break down in the environment or the human body.",
    healthEffects:
      "Linked to kidney cancer, testicular cancer, thyroid disease, immune system suppression, elevated cholesterol, and reproductive/developmental harm.",
    epaLimit: "4 ppt (parts per trillion) — EPA MCL finalized April 2024, compliance required by 2029",
    ewgLimit: "0.02 ppt — EWG health guideline (200× stricter than EPA limit)",
    source: "EPA PFAS Basics",
    sourceUrl: "https://www.epa.gov/pfas/pfas-explained",
    color: "#ef4444",
  },
  PFOA: {
    fullName: "Perfluorooctanoic Acid",
    aka: "C8 / Forever Chemical",
    category: "PFAS",
    description:
      "A long-chain PFAS chemical formerly used in manufacturing Teflon (PTFE) coatings and other non-stick/waterproof products. Phased out of U.S. manufacturing by 2015 but persists widely in water supplies due to industrial contamination.",
    healthEffects:
      "Associated with kidney and testicular cancer, thyroid disorders, high cholesterol, pregnancy-induced hypertension, and immune deficiency in children.",
    epaLimit: "4 ppt — EPA MCL finalized April 2024, compliance required by 2029",
    ewgLimit: "0.004 ppt — EWG health guideline (1,000× stricter than EPA limit)",
    source: "EPA PFOA Fact Sheet",
    sourceUrl: "https://www.epa.gov/sites/default/files/2016-05/documents/pfoa_health_advisory_final_508.pdf",
    color: "#f97316",
  },
  PFNA: {
    fullName: "Perfluorononanoic Acid",
    category: "PFAS",
    description:
      "A nine-carbon PFAS compound used as a processing agent in fluoropolymer manufacturing. Found in drinking water supplies near industrial facilities. Part of the EPA's 2024 PFAS MCL rule.",
    healthEffects:
      "Linked to thyroid hormone disruption, liver toxicity, immune system effects, and developmental harm in animal studies.",
    epaLimit: "10 ppt — EPA PFAS hazard index (combined with PFHxS, HFPO-DA, PFBS)",
    source: "EPA UCMR5",
    sourceUrl: "https://www.epa.gov/dwucmr/fifth-unregulated-contaminant-monitoring-rule",
    color: "#a855f7",
  },
  PFHxS: {
    fullName: "Perfluorohexane Sulfonic Acid",
    category: "PFAS",
    description:
      "A six-carbon PFAS used in firefighting foams, metal plating, and textile treatments. Like other PFAS, it does not break down in the environment. Regulated under the EPA's 2024 PFAS rule as part of a hazard index.",
    healthEffects:
      "May disrupt thyroid hormone levels, impair immune response, and affect liver function. Linked to developmental effects in animal studies.",
    epaLimit: "10 ppt — EPA PFAS hazard index (combined with PFNA, HFPO-DA, PFBS)",
    source: "EPA PFAS Rule 2024",
    sourceUrl: "https://www.epa.gov/sdwa/and-polyfluoroalkyl-substances-pfas",
    color: "#eab308",
  },
  Lead: {
    fullName: "Lead (Pb)",
    category: "Heavy Metal",
    description:
      "A naturally occurring heavy metal that enters drinking water primarily through corrosion of lead service lines, lead solder in plumbing, and brass fixtures — not typically from the water source itself. There is no safe level of lead exposure.",
    healthEffects:
      "Causes irreversible neurological damage and developmental delays in children. In adults: high blood pressure, kidney damage, and cognitive decline. Particularly dangerous for infants and pregnant women.",
    epaLimit: "Action level: 15 ppb (EPA is working to lower this to 10 ppb). No safe level exists.",
    ewgLimit: "0.1 ppb — EWG health guideline",
    source: "EPA Lead in Drinking Water",
    sourceUrl: "https://www.epa.gov/ground-water-and-drinking-water/basic-information-about-lead-drinking-water",
    color: "#6b7280",
  },
  Nitrate: {
    fullName: "Nitrate (NO₃⁻)",
    category: "Inorganic",
    description:
      "A naturally occurring ion found in fertilizers, septic systems, and animal waste. Leaches into groundwater through agricultural runoff. Common in rural and agricultural communities in South Florida.",
    healthEffects:
      "High levels cause methemoglobinemia (\"blue baby syndrome\") in infants under 6 months — a potentially fatal condition. May also be associated with certain cancers with long-term exposure.",
    epaLimit: "10 mg/L (10 ppm) — EPA MCL",
    source: "EPA Nitrate Basics",
    sourceUrl: "https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations",
    color: "#22c55e",
  },
  Chloroform: {
    fullName: "Chloroform (Trichloromethane)",
    aka: "TTHMs — Total Trihalomethanes",
    category: "Disinfection Byproduct",
    description:
      "Formed when chlorine used to disinfect drinking water reacts with naturally occurring organic matter (like algae or sediment). Chloroform is the most common of the four trihalomethane compounds grouped as TTHMs.",
    healthEffects:
      "Long-term exposure linked to increased risk of bladder and rectal cancer, liver and kidney damage, and adverse reproductive outcomes.",
    epaLimit: "80 µg/L (TTHMs combined) — EPA MCL",
    ewgLimit: "0.15 µg/L — EWG health guideline (500× stricter)",
    source: "EPA Disinfection Byproducts",
    sourceUrl: "https://www.epa.gov/dwreginfo/stage-1-and-stage-2-disinfectants-and-disinfection-byproducts-rules",
    color: "#06b6d4",
  },
  Arsenic: {
    fullName: "Arsenic (As)",
    category: "Heavy Metal / Metalloid",
    description:
      "A naturally occurring element found in rock and soil that dissolves into groundwater. Also introduced through industrial and agricultural activities. Tasteless and odorless — undetectable without testing.",
    healthEffects:
      "Long-term exposure is a known human carcinogen linked to bladder, lung, and skin cancers. Also causes cardiovascular disease, diabetes, and developmental effects in children.",
    epaLimit: "10 ppb — EPA MCL (lowered from 50 ppb in 2001)",
    ewgLimit: "0.004 ppb — EWG health guideline (2,500× stricter than EPA limit)",
    source: "EPA Arsenic in Drinking Water",
    sourceUrl: "https://www.epa.gov/ground-water-and-drinking-water/arsenic-drinking-water",
    color: "#ec4899",
  },
};

// ── ChemicalTag component ───────────────────────────────────────
interface ChemicalTagProps {
  name: string;
  /** Visual style: "badge" shows colored pill, "inline" shows underlined text */
  variant?: "badge" | "inline" | "plain";
  className?: string;
}

export function ChemicalTag({ name, variant = "inline", className = "" }: ChemicalTagProps) {
  const def = CHEMICAL_DEFS[name];

  // If no definition, just render plain text
  if (!def) return <span className={className}>{name}</span>;

  const trigger =
    variant === "badge" ? (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold cursor-pointer select-none hover:opacity-80 transition-opacity"
        style={{ background: def.color + "22", color: def.color, border: `1px solid ${def.color}44` }}
      >
        {name}
        <span className="opacity-50 text-[9px]">?</span>
      </span>
    ) : variant === "inline" ? (
      <span
        className={`cursor-pointer border-b border-dotted hover:border-solid transition-all ${className}`}
        style={{ borderColor: def.color + "99", color: "inherit" }}
      >
        {name}
      </span>
    ) : (
      <span className={`cursor-pointer ${className}`}>{name}</span>
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 shadow-xl"
        side="top"
        align="start"
        sideOffset={6}
      >
        {/* Header */}
        <div
          className="px-4 py-3 rounded-t-md"
          style={{ background: def.color + "18", borderBottom: `2px solid ${def.color}44` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm" style={{ color: def.color }}>{name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 h-4">{def.category}</Badge>
              </div>
              <p className="text-xs font-medium text-foreground mt-0.5">{def.fullName}</p>
              {def.aka && <p className="text-[11px] text-muted-foreground">aka {def.aka}</p>}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">{def.description}</p>

          <div className="space-y-1.5">
            <div className="flex gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-20 flex-shrink-0 pt-0.5">Health</span>
              <p className="text-xs text-foreground leading-relaxed">{def.healthEffects}</p>
            </div>
            <div className="flex gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-20 flex-shrink-0 pt-0.5">EPA Limit</span>
              <p className="text-xs text-foreground">{def.epaLimit}</p>
            </div>
            {def.ewgLimit && (
              <div className="flex gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground w-20 flex-shrink-0 pt-0.5">EWG Guide</span>
                <p className="text-xs text-foreground">{def.ewgLimit}</p>
              </div>
            )}
          </div>

          <a
            href={def.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-blue-500 hover:text-blue-600 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            {def.source}
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
