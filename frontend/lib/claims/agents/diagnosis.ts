// Diagnosis-quality specialist: ICD-10-CM specificity and laterality, deleted /
// non-billable codes, and consistency between a diagnosis's laterality and the
// laterality modifier (RT/LT) on the service lines that point to it.
import type { FindingDraft } from "../validate";
import {
  type Specialist,
  type SpecialistContext,
  type SpecialistOutput,
  SLEEP,
  runSdkSpecialist,
} from "./shared";
import { ICD10_LATERALITY, UNSPECIFIED_LATERALITY_ICD10 } from "./mock-data";

const SYSTEM_PROMPT = `You are Claimify's diagnosis-coding validator for 837P professional claims, reviewing ICD-10-CM quality before submission to Medicare.

The deterministic layers already checked ICD-10 code FORMAT. Other specialists cover correct-coding (NCCI) and medical necessity. YOUR concern is diagnosis quality only:
- Specificity: an unspecified code where a more specific one is clearly supported (site, laterality, stage, encounter type).
- Laterality: a code's side (right/left) must be consistent with the RT/LT/50 modifiers on the service lines that point to it. Flag mismatches (e.g. a right-knee diagnosis pointed to by a left (LT) procedure).
- Deleted / non-billable / header (category) codes used where a billable child code is required.
- Each diagnosis is pointed to by at least one service line.

Method:
1. Read the claim (get_claim) and, when present, the FHIR conditions (get_fhir_context).
2. report_finding for each confirmed diagnosis-quality issue, naming the EXACT field (e.g. 'Diagnosis A (M17.11)' or 'Service line 1 (CPT 27447) modifier'). Do not judge medical necessity or NCCI bundling.
3. Finish with exactly one report_confidence for the diagnosis-quality dimension.

Be precise. Do not invent ICD-10 codes or descriptions.`;

async function runAgent(ctx: SpecialistContext): Promise<SpecialistOutput> {
  return runSdkSpecialist({
    ctx,
    systemPrompt: SYSTEM_PROMPT,
    toolGroups: ["claim", "fhir"],
    maxTurns: 20,
  });
}

const SIDE_LABEL: Record<"RT" | "LT", string> = { RT: "right", LT: "left" };

function dxLetter(index0: number): string {
  return String.fromCharCode(65 + index0); // 0 -> A
}

async function runMock(ctx: SpecialistContext): Promise<SpecialistOutput> {
  const { claim, emit } = ctx;
  const drafts: FindingDraft[] = [];
  const diagnoses = claim.diagnoses;

  emit("Checking ICD-10 specificity and laterality against the service lines…");
  await SLEEP(300);

  // Cross-check: diagnosis laterality vs. the RT/LT modifier on pointing lines.
  for (const line of claim.service_lines) {
    const mods = new Set(line.modifiers.map((m) => m.trim().toUpperCase()));
    const lineSide: "RT" | "LT" | null = mods.has("RT")
      ? "RT"
      : mods.has("LT")
        ? "LT"
        : null;
    if (!lineSide) continue;
    for (const pointer of line.diagnosis_pointers) {
      const dx = diagnoses[pointer - 1];
      if (!dx) continue;
      const dxSide = ICD10_LATERALITY[dx.code];
      if (dxSide && dxSide !== lineSide) {
        drafts.push({
          layer: "clinical",
          rule_id: "DX-LATERALITY",
          severity: "error",
          loop_segment: "2400 SV101 / 2300 HI",
          field: `Service line ${line.line_number} (CPT ${line.cpt}) modifier ${lineSide}`,
          issue: `Laterality mismatch: diagnosis ${dx.code} indicates the ${SIDE_LABEL[dxSide]} side, but service line ${line.line_number} carries the ${SIDE_LABEL[lineSide]} modifier (${lineSide}).`,
          why_it_matters:
            "When the diagnosis laterality and the procedure's RT/LT modifier disagree, the payer cannot confirm the correct anatomic site and denies the line for inconsistent laterality.",
          evidence: [
            {
              source_type: "claim",
              source_id: `line ${line.line_number}`,
              label: "Diagnosis vs. modifier",
              excerpt: `Diagnosis ${dxLetter(pointer - 1)} (${dx.code}) = ${SIDE_LABEL[dxSide]}; service line ${line.line_number} (${line.cpt}) modifier = ${lineSide} (${SIDE_LABEL[lineSide]}).`,
            },
          ],
          recommended_fix: `Correct the laterality: change the ${lineSide} modifier to ${dxSide}, or use the ${SIDE_LABEL[lineSide]}-side diagnosis if that is the true site.`,
        });
      }
    }
  }

  // Specificity: unspecified-laterality codes where a specific child exists.
  for (const [idx, dx] of diagnoses.entries()) {
    const note = UNSPECIFIED_LATERALITY_ICD10[dx.code];
    if (!note) continue;
    drafts.push({
      layer: "clinical",
      rule_id: "DX-SPECIFICITY",
      severity: "warning",
      loop_segment: "2300 HI",
      field: `Diagnosis ${dxLetter(idx)} (${dx.code})`,
      issue: `Diagnosis ${dx.code} is an unspecified code (${note}); a more specific code is available.`,
      why_it_matters:
        "Payers increasingly deny or pend claims that carry unspecified diagnosis codes when a more specific code (site, laterality) is supported by the record.",
      evidence: [
        {
          source_type: "claim",
          source_id: `diagnosis ${dxLetter(idx)}`,
          label: "Unspecified ICD-10",
          excerpt: `${dx.code} — ${note}.`,
        },
      ],
      recommended_fix: `Replace ${dx.code} with the specific code supported by the documentation.`,
    });
  }

  if (drafts.length === 0) {
    emit("Diagnosis codes are specific and laterality is consistent with the service lines.");
  }
  await SLEEP(150);

  const errors = drafts.filter((d) => d.severity === "error").length;
  const warnings = drafts.filter((d) => d.severity === "warning").length;
  const score = Math.min(0.97, Math.max(0.2, 0.95 - 0.2 * errors - 0.06 * warnings));
  return {
    assessment: {
      score,
      rationale:
        drafts.length === 0
          ? "Diagnosis codes are specific and laterality-consistent with the billed procedures."
          : `${errors} laterality/consistency error(s) and ${warnings} specificity warning(s) in the diagnoses.`,
    },
    drafts,
  };
}

export const diagnosisSpecialist: Specialist = {
  id: "diagnosis",
  label: "Diagnosis quality",
  runAgent,
  runMock,
};
