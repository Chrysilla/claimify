// 837P validation rule catalog. Loaded from rules/837p-rules.json, which the
// ingest-rules script regenerates from a payer-provided PDF.
import catalog from "../../rules/837p-rules.json";
import type { FindingLayer, FindingSeverity } from "./types";

export type RuleDef = {
  id: string;
  layer: FindingLayer;
  severity: FindingSeverity;
  loop_segment: string;
  field: string;
  title: string;
  message: string;
  why: string;
  fix: string;
  category: string;
};

const rules = catalog as RuleDef[];
const byId = new Map(rules.map((r) => [r.id, r]));

export function getRules(): RuleDef[] {
  return rules;
}

export function getRule(id: string): RuleDef | undefined {
  return byId.get(id);
}

export function clinicalRulesForPrompt(): string {
  return rules
    .filter((r) => r.layer === "clinical")
    .map((r) => `- ${r.id} — ${r.title}: ${r.message}`)
    .join("\n");
}
