// Correct-coding specialist: NCCI procedure-to-procedure (PTP) edits, bundling,
// mutually exclusive procedures, modifier 25/59 appropriateness, add-on codes,
// and units/MUE sanity. Consults only the NCCI chapters the claim's codes hit
// (via the deterministic router).
import type { ServiceLine } from "../types";
import type { FindingDraft } from "../validate";
import {
  type Specialist,
  type SpecialistContext,
  type SpecialistOutput,
  SLEEP,
  runSdkSpecialist,
  relevantNcciChaptersText,
} from "./shared";
import { MOCK_PTP_PAIRS, isEmCode, isMinorProcedure } from "./mock-data";

function buildPrompt(chapters: string): string {
  return `You are Claimify's correct-coding validator for 837P professional claims, applying CMS National Correct Coding Initiative (NCCI) policy before submission to Medicare.

The deterministic layers already checked code FORMATS. Other specialists cover medical necessity and diagnosis quality. YOUR concern is correct coding only:
- NCCI procedure-to-procedure (PTP) edits: is a billed code bundled into another on the same date of service? If so, is an appropriate modifier (59 / X{EPSU}, or 25 for a separately identifiable E/M) present and justified?
- Mutually exclusive procedures billed together.
- Modifier appropriateness: 25 on an E/M billed the same day as a minor procedure; 59 to unbundle; RT/LT/50 laterality.
- Add-on codes billed without their required primary code.
- Units / medically-unlikely-edit (MUE) plausibility.

The NCCI chapters relevant to THIS claim's codes are: ${chapters}. Start with chapter 01 (general policies) and the body-system chapter(s) above.

Method:
1. Read the claim (get_claim).
2. For each relevant code/pair, consult the NCCI manual (search_ncci_manual, read_ncci_section) and confirm the policy before flagging.
3. report_finding for each confirmed coding issue, naming the EXACT field (e.g. 'Service line 2 (CPT 45380)') and citing the NCCI chapter/line. Do not repeat format issues the earlier layers raised, and do not judge medical necessity or diagnosis specificity.
4. Finish with exactly one report_confidence for the correct-coding dimension.

Cite real NCCI passages. Do not invent edits.`;
}

async function runAgent(ctx: SpecialistContext): Promise<SpecialistOutput> {
  return runSdkSpecialist({
    ctx,
    systemPrompt: buildPrompt(relevantNcciChaptersText(ctx.claim)),
    toolGroups: ["claim", "ncci"],
    maxTurns: 25,
  });
}

function hasModifier(line: ServiceLine, mods: string[]): boolean {
  const set = new Set(line.modifiers.map((m) => m.trim().toUpperCase()));
  return mods.some((m) => set.has(m));
}

const UNBUNDLING_MODIFIERS = ["59", "XE", "XS", "XP", "XU"];

async function runMock(ctx: SpecialistContext): Promise<SpecialistOutput> {
  const { claim, emit } = ctx;
  const drafts: FindingDraft[] = [];
  const lines = claim.service_lines;

  emit("Applying NCCI PTP and modifier edits to the service lines…");
  await SLEEP(300);

  // Edit 1: E/M billed the same DOS as a minor procedure needs modifier 25.
  for (const em of lines) {
    if (!isEmCode(em.cpt)) continue;
    const sameDayProc = lines.find(
      (l) =>
        l.line_number !== em.line_number &&
        isMinorProcedure(l.cpt) &&
        l.dos_from === em.dos_from,
    );
    if (sameDayProc && !hasModifier(em, ["25"])) {
      drafts.push({
        layer: "clinical",
        rule_id: "NCCI-MOD25",
        severity: "error",
        loop_segment: "2400 SV101-3",
        field: `Service line ${em.line_number} (CPT ${em.cpt}) modifier`,
        issue: `E/M ${em.cpt} is billed on the same date as procedure ${sameDayProc.cpt} without modifier 25.`,
        why_it_matters:
          "Under NCCI, an E/M service on the same day as a minor procedure is bundled unless modifier 25 documents a significant, separately identifiable service; without it the E/M is denied.",
        evidence: [
          {
            source_type: "rule",
            source_id: "NCCI Ch.1 — modifier 25",
            label: "NCCI general policy",
            excerpt: `Line ${em.line_number} (${em.cpt}) and line ${sameDayProc.line_number} (${sameDayProc.cpt}) share DOS ${em.dos_from}; the E/M carries no modifier 25.`,
          },
        ],
        recommended_fix: `Append modifier 25 to service line ${em.line_number} (${em.cpt}) if a separately identifiable E/M is documented; otherwise remove the E/M.`,
      });
    }
  }

  // Edit 2: known PTP pairs — column2 bundled into column1 without an override.
  for (const pair of MOCK_PTP_PAIRS) {
    const col1 = lines.find((l) => l.cpt === pair.column1);
    const col2 = lines.find((l) => l.cpt === pair.column2);
    if (col1 && col2 && !hasModifier(col2, UNBUNDLING_MODIFIERS)) {
      drafts.push({
        layer: "clinical",
        rule_id: "NCCI-PTP",
        severity: "error",
        loop_segment: "2400 SV101",
        field: `Service line ${col2.line_number} (CPT ${col2.cpt})`,
        issue: `CPT ${col2.cpt} is bundled into ${col1.cpt} under an NCCI PTP edit and is billed without an unbundling modifier.`,
        why_it_matters: `${pair.label}. Column-two codes are denied when reported with the column-one code unless modifier 59 / X{EPSU} shows a distinct service.`,
        evidence: [
          {
            source_type: "rule",
            source_id: "NCCI PTP edit",
            label: "NCCI PTP table",
            excerpt: `${pair.column1}/${pair.column2}: ${pair.label}. No 59/X{EPSU} modifier on line ${col2.line_number}.`,
          },
        ],
        recommended_fix: `Remove service line ${col2.line_number} (${col2.cpt}), or append modifier 59/X{EPSU} if it was a distinct service.`,
      });
    }
  }

  if (drafts.length === 0) {
    emit("No NCCI PTP or modifier conflicts detected among the billed codes.");
  }
  await SLEEP(150);

  const errors = drafts.filter((d) => d.severity === "error").length;
  const score = Math.min(0.96, Math.max(0.15, 0.95 - 0.2 * errors));
  return {
    assessment: {
      score,
      rationale:
        errors === 0
          ? "Billed code combinations pass NCCI PTP and modifier edits."
          : `${errors} NCCI correct-coding edit(s) would deny line(s) as billed.`,
    },
    drafts,
  };
}

export const codingSpecialist: Specialist = {
  id: "coding",
  label: "Correct coding (NCCI)",
  runAgent,
  runMock,
};
