"use client";
import {
  Bot,
  CheckCircle2,
  Circle,
  CircleAlert,
  Cpu,
  Gauge,
  Loader2,
  MinusCircle,
  Terminal,
  XCircle,
} from "lucide-react";
import type {
  ClaimFinding,
  ConfidenceReport,
  FindingLayer,
  JobStatus,
  SpecialistId,
} from "@/lib/claims/types";
import { SPECIALIST_LABELS } from "@/lib/claims/types";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ConfidenceGauge } from "./confidence-gauge";
import { FindingCard } from "./finding-card";

export type LayerState = {
  state: "idle" | "running" | "pass" | "fail";
  errors?: number;
  warnings?: number;
};

export type LayerMap = Record<FindingLayer, LayerState>;

export type SpecialistState = {
  state: "idle" | "running" | "pass" | "fail" | "skipped";
  errors?: number;
  warnings?: number;
};

export type SpecialistMap = Record<SpecialistId, SpecialistState>;

const STEPS: { layer: FindingLayer; label: string }[] = [
  { layer: "structural", label: "Structural" },
  { layer: "content", label: "Content & coding" },
  { layer: "clinical", label: "Clinical evidence — specialist agents" },
];

// Render order for the clinical specialist strip.
const SPECIALIST_ORDER: SpecialistId[] = ["coding", "necessity", "diagnosis"];

function StepIcon({ state }: { state: LayerState["state"] | "skipped" }) {
  if (state === "running")
    return <Loader2 size={18} className="animate-spin text-teal-600" />;
  if (state === "pass")
    return <CheckCircle2 size={18} className="text-emerald-600" />;
  if (state === "fail") return <XCircle size={18} className="text-rose-600" />;
  if (state === "skipped")
    return <MinusCircle size={18} className="text-slate-400" />;
  return <Circle size={18} className="text-slate-300" />;
}

function SpecialistStrip({ specialists }: { specialists: SpecialistMap }) {
  return (
    <div className="mt-3 ml-7 space-y-2 border-l border-slate-200 pl-4">
      {SPECIALIST_ORDER.map((id) => {
        const s = specialists[id];
        const errors = s.errors ?? 0;
        const warnings = s.warnings ?? 0;
        return (
          <div key={id} className="flex items-center gap-2.5">
            <StepIcon state={s.state} />
            <span
              className={cn(
                "text-sm font-medium",
                s.state === "idle" ? "text-slate-400" : "text-slate-700",
              )}
            >
              {SPECIALIST_LABELS[id]}
            </span>
            {s.state === "running" && (
              <span className="ml-auto text-xs text-slate-400">reviewing…</span>
            )}
            {s.state === "skipped" && (
              <span className="ml-auto text-xs text-slate-400">skipped</span>
            )}
            {(s.state === "pass" || s.state === "fail") && (
              <span
                className={cn(
                  "ml-auto text-xs font-semibold",
                  errors > 0 ? "text-rose-600" : "text-emerald-600",
                )}
              >
                {errors > 0 || warnings > 0
                  ? `${errors} error${errors === 1 ? "" : "s"}${
                      warnings ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""
                    }`
                  : "clear"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ValidationPanel({
  jobStatus,
  engine,
  layers,
  specialists,
  activity,
  findings,
  confidence,
  streamError,
  onFindingUpdate,
}: {
  jobStatus: JobStatus | null;
  engine: "agent" | "mock" | null;
  layers: LayerMap;
  specialists: SpecialistMap;
  activity: string[];
  findings: ClaimFinding[];
  confidence: ConfidenceReport | null;
  streamError: string | null;
  onFindingUpdate: (updated: ClaimFinding) => void;
}) {
  const running =
    jobStatus !== null && jobStatus !== "complete" && jobStatus !== "failed";
  const clinicalRunning = layers.clinical.state === "running";
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Gauge size={20} className="text-teal-700" />
          Validation feedback
        </h2>
        {engine && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              engine === "agent"
                ? "bg-teal-50 text-teal-700"
                : "bg-slate-100 text-slate-600",
            )}
          >
            {engine === "agent" ? <Bot size={13} /> : <Cpu size={13} />}
            {engine === "agent" ? "Claude agent" : "Mock engine"}
          </span>
        )}
      </div>

      <Card className="p-4">
        <ol className="space-y-3">
          {STEPS.map((step, i) => {
            const s = layers[step.layer];
            return (
              <li key={step.layer} className="flex items-center gap-3">
                <StepIcon state={s.state} />
                <span
                  className={cn(
                    "text-sm font-semibold",
                    s.state === "idle" ? "text-slate-400" : "text-slate-800",
                  )}
                >
                  {i + 1}. {step.label}
                </span>
                {s.state === "fail" && (
                  <span className="ml-auto text-xs font-semibold text-rose-600">
                    {s.errors ?? 0} error{(s.errors ?? 0) === 1 ? "" : "s"}
                    {s.warnings
                      ? ` · ${s.warnings} warning${s.warnings === 1 ? "" : "s"}`
                      : ""}
                  </span>
                )}
                {s.state === "pass" && (
                  <span className="ml-auto text-xs font-semibold text-emerald-600">
                    {s.warnings
                      ? `passed · ${s.warnings} warning${s.warnings === 1 ? "" : "s"}`
                      : "passed"}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {layers.clinical.state !== "idle" && (
          <SpecialistStrip specialists={specialists} />
        )}
        {jobStatus === "failed" && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-700">
            <CircleAlert size={15} />
            Validation job failed{streamError ? `: ${streamError}` : "."}
          </p>
        )}
      </Card>

      {(activity.length > 0 || clinicalRunning) && (
        <Card className="overflow-hidden bg-slate-950 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-teal-300">
            <Terminal size={13} />
            Agent activity
            {clinicalRunning && (
              <span className="ml-auto flex items-center gap-1.5 normal-case text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
                reviewing evidence
              </span>
            )}
          </p>
          <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {activity.slice(-8).map((line, i) => (
              <p
                key={`${i}-${line.slice(0, 24)}`}
                className="whitespace-pre-wrap break-words font-mono text-xs leading-5 text-slate-300"
              >
                {line}
              </p>
            ))}
          </div>
        </Card>
      )}

      {confidence && (
        <Card className="p-4">
          <ConfidenceGauge confidence={confidence} />
        </Card>
      )}

      <div className="space-y-3">
        {findings.length > 0 && (
          <p className="text-sm font-semibold text-slate-600">
            {findings.length} finding{findings.length === 1 ? "" : "s"} — each
            requires reviewer action
          </p>
        )}
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} onUpdate={onFindingUpdate} />
        ))}
        {!findings.length && !running && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            {jobStatus === "complete"
              ? "No findings. The claim passed every validation layer."
              : "Submit the claim to run structural, content, and clinical-evidence validation."}
          </div>
        )}
      </div>
    </section>
  );
}
