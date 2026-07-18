// Layer-3 clinical validation now runs as a map-reduce of specialist agents.
// This module is kept as a stable entry point; the implementation lives in
// ./agents/. See agents/orchestrator.ts for the coordinator and agents/{coding,
// necessity,diagnosis}.ts for the specialists.
export {
  runClinicalValidation,
  agentCredentialsAvailable,
  type ClinicalRunOptions,
} from "./agents/orchestrator";
export type { ClinicalAssessment } from "./agents/shared";
