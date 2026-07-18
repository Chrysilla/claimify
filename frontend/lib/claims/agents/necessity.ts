// Medical-necessity specialist: is every billed service and every pointed
// diagnosis actually supported by the encounter documentation? (Layer-3 rules
// M-201..M-206.) This is the original clinical agent, refactored to return
// drafts for the orchestrator to dedupe + score.
import type { FindingDraft } from "../validate";
import { getRule } from "../rules";
import { CPT_EVIDENCE_KEYWORDS, ICD10_EVIDENCE_KEYWORDS } from "../overlays";
import {
  type Specialist,
  type SpecialistContext,
  type SpecialistOutput,
  SLEEP,
  docsContainAny,
  runSdkSpecialist,
} from "./shared";

const SYSTEM_PROMPT = `You are Claimify's medical-necessity validator for 837P professional claims, reviewing claims before submission to Medicare.

The deterministic layers already checked structure and coding formats, and other specialists cover correct-coding (NCCI) and diagnosis quality. YOUR concern is only this: is every billed service and every pointed diagnosis actually supported by the encounter documentation?

Method:
1. Read the claim (get_claim), then the clinical note, transcript, and FHIR context, plus the medical-necessity rules.
2. For EACH service line: verify the documentation supports that the service was performed and medically necessary. For E/M codes, check the documented time (encounter period) and complexity plausibly support the level billed.
3. For EACH diagnosis referenced by a pointer: verify it is documented in this encounter (note, transcript, or FHIR conditions/observations).
4. Report every confirmed issue via report_finding with verbatim evidence excerpts and the EXACT field (e.g. 'Service line 2 (CPT 99215)'). Do not report coding/bundling or diagnosis-specificity issues — other specialists own those. If the claim has no linked documentation, say so in your rationale and do not invent evidence.
5. Finish with exactly one report_confidence call for the medical-necessity dimension.

Be precise and cite real excerpts. Never invent documentation that is not there.`;

async function runAgent(ctx: SpecialistContext): Promise<SpecialistOutput> {
  return runSdkSpecialist({
    ctx,
    systemPrompt: SYSTEM_PROMPT,
    toolGroups: ["claim", "note", "transcript", "fhir", "rules", "ncci"],
    maxTurns: 40,
  });
}

async function runMock(ctx: SpecialistContext): Promise<SpecialistOutput> {
  const { claim, docs, encounterId, hasDocs, emit } = ctx;
  const drafts: FindingDraft[] = [];

  if (!hasDocs) {
    emit("No linked encounter documentation — medical necessity cannot be verified.");
    await SLEEP(200);
    drafts.push({
      layer: "clinical",
      rule_id: null,
      severity: "info",
      loop_segment: null,
      field: "Claim documentation",
      issue:
        "This claim has no linked encounter note/transcript, so medical necessity could not be verified against source documentation.",
      why_it_matters:
        "Manually created or imported claims are not grounded in a chart; attach documentation before relying on medical-necessity results.",
      evidence: [
        {
          source_type: "claim",
          source_id: claim.patient_control_number || "(no control number)",
          label: "Claim source",
          excerpt: "No encounter note, transcript, or FHIR context is linked to this claim.",
        },
      ],
      recommended_fix:
        "Link this claim to its encounter documentation, or verify medical necessity manually.",
    });
    return { assessment: { score: 0.6, rationale: "No source documentation to verify medical necessity." }, drafts };
  }

  const corpus = `${docs.note}\n${docs.transcript}`;
  let errors = 0;

  emit("Reading clinical note and transcript…");
  await SLEEP(300);

  for (const line of claim.service_lines) {
    emit(`Cross-checking service line ${line.line_number} (${line.cpt}) against documentation…`);
    await SLEEP(250);
    const keywords = CPT_EVIDENCE_KEYWORDS[line.cpt];
    if (keywords && !docsContainAny(corpus, keywords)) {
      errors += 1;
      const rule = getRule("M-201");
      drafts.push({
        layer: "clinical",
        rule_id: "M-201",
        severity: "error",
        loop_segment: "2400 SV101",
        field: `Service line ${line.line_number} (${line.cpt})`,
        issue: `Billed procedure ${line.cpt} (${line.description}) is not supported by the encounter documentation.`,
        why_it_matters:
          rule?.why ??
          "Medicare denies services that the medical record does not document as performed and necessary.",
        evidence: [
          {
            source_type: "note",
            source_id: encounterId,
            label: "Clinical note",
            excerpt: `No documentation matching ${keywords.map((k) => `"${k}"`).join(", ")} found in the note or transcript for this visit (${docs.visitTitle}).`,
          },
        ],
        recommended_fix: `Remove service line ${line.line_number} or add documentation showing ${line.description.toLowerCase()} was performed.`,
      });
    }
    // Time-based upcoding heuristic: high-level or prolonged E/M vs documented duration.
    if (["99205", "99215", "99417"].includes(line.cpt)) {
      const start = Date.parse(docs.periodStart);
      const end = Date.parse(docs.periodEnd);
      const minutes =
        Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 60000 : NaN;
      if (Number.isFinite(minutes) && minutes < 60) {
        errors += 1;
        drafts.push({
          layer: "clinical",
          rule_id: "M-203",
          severity: "error",
          loop_segment: "2400 SV101",
          field: `Service line ${line.line_number} (${line.cpt})`,
          issue: `E/M level ${line.cpt} is not supported by the documented encounter time (~${Math.round(minutes)} minutes).`,
          why_it_matters:
            "Time-based E/M levels require documented total time; billing above the documented level is upcoding and a common denial/audit trigger.",
          evidence: [
            {
              source_type: "fhir",
              source_id: encounterId,
              label: "Encounter period",
              excerpt: `Encounter ${docs.periodStart} → ${docs.periodEnd} (~${Math.round(minutes)} minutes documented).`,
            },
          ],
          recommended_fix:
            "Bill the E/M level supported by documented time/complexity (e.g. 99204) or document the additional time.",
        });
      }
    }
  }

  const pointed = new Set<number>();
  for (const line of claim.service_lines) {
    for (const p of line.diagnosis_pointers) pointed.add(p);
  }
  for (const [idx, dx] of claim.diagnoses.entries()) {
    if (!pointed.has(idx + 1)) continue;
    emit(`Verifying diagnosis ${dx.code} against chart evidence…`);
    await SLEEP(200);
    const keywords = ICD10_EVIDENCE_KEYWORDS[dx.code];
    if (keywords && !docsContainAny(corpus, keywords)) {
      errors += 1;
      drafts.push({
        layer: "clinical",
        rule_id: "M-202",
        severity: "error",
        loop_segment: "2300 HI",
        field: `Diagnosis ${String.fromCharCode(64 + idx + 1)} (${dx.code})`,
        issue: `Diagnosis ${dx.code} (${dx.description}) is referenced by a service line but is not documented in this encounter.`,
        why_it_matters:
          "Diagnoses on a claim must be documented in the medical record for the date of service; unsupported diagnoses trigger denials and audit risk.",
        evidence: [
          {
            source_type: "note",
            source_id: encounterId,
            label: "Clinical note",
            excerpt: `No mention matching ${keywords.map((k) => `"${k}"`).join(", ")} in the note, transcript, or FHIR conditions for this visit.`,
          },
        ],
        recommended_fix: `Remove diagnosis ${dx.code} (and its pointers) or attach documentation supporting it.`,
      });
    }
  }

  if (errors === 0) {
    emit("All billed services and pointed diagnoses are supported by documentation.");
  }
  await SLEEP(150);

  const score = Math.min(0.95, Math.max(0.1, 0.92 - 0.18 * errors));
  return {
    assessment: {
      score,
      rationale:
        errors === 0
          ? "Every billed service and pointed diagnosis is grounded in the encounter note, transcript, and FHIR record."
          : `${errors} clinical documentation gap(s) found; unsupported services/diagnoses are routinely denied by Medicare.`,
    },
    drafts,
  };
}

export const necessitySpecialist: Specialist = {
  id: "necessity",
  label: "Medical necessity",
  runAgent,
  runMock,
};
