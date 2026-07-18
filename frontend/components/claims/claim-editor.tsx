"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { FileUp, Save, SendHorizonal } from "lucide-react";
import { claimsApi, subscribeToJob } from "@/lib/claims/client-api";
import { findScenario } from "@/lib/claims/scenarios";
import type {
  Claim837P,
  ClaimDetail,
  ClaimFinding,
  ConfidenceReport,
  FindingLayer,
  JobEvent,
  JobStatus,
  SpecialistId,
} from "@/lib/claims/types";
import { Button } from "@/components/ui";
import { ClaimForm } from "./claim-form";
import { ScenarioBar } from "./scenario-bar";
import {
  ValidationPanel,
  type LayerMap,
  type SpecialistMap,
} from "./validation-panel";

const IDLE_LAYERS: LayerMap = {
  structural: { state: "idle" },
  content: { state: "idle" },
  clinical: { state: "idle" },
};

const IDLE_SPECIALISTS: SpecialistMap = {
  coding: { state: "idle" },
  necessity: { state: "idle" },
  diagnosis: { state: "idle" },
};

const SPECIALIST_IDS: SpecialistId[] = ["coding", "necessity", "diagnosis"];

// Rebuild pipeline display for a finished job loaded from the server.
function layersFromHistory(
  detail: ClaimDetail,
): LayerMap {
  if (!detail.latest_job || detail.latest_job.status !== "complete") {
    return IDLE_LAYERS;
  }
  const map: LayerMap = structuredClone(IDLE_LAYERS);
  for (const layer of ["structural", "content", "clinical"] as const) {
    const errors = detail.findings.filter(
      (f) => f.layer === layer && f.severity === "error",
    ).length;
    const warnings = detail.findings.filter(
      (f) => f.layer === layer && f.severity === "warning",
    ).length;
    map[layer] = {
      state: errors > 0 ? "fail" : "pass",
      errors,
      warnings,
    };
  }
  return map;
}

// Rebuild the clinical specialist strip from a finished job's findings.
function specialistsFromHistory(detail: ClaimDetail): SpecialistMap {
  if (!detail.latest_job || detail.latest_job.status !== "complete") {
    return structuredClone(IDLE_SPECIALISTS);
  }
  const map = structuredClone(IDLE_SPECIALISTS);
  for (const id of SPECIALIST_IDS) {
    const mine = detail.findings.filter((f) => f.agent === id);
    const errors = mine.filter((f) => f.severity === "error").length;
    const warnings = mine.filter((f) => f.severity === "warning").length;
    map[id] = { state: errors > 0 ? "fail" : "pass", errors, warnings };
  }
  return map;
}

export function ClaimEditor({ initial }: { initial: ClaimDetail }) {
  const [claim, setClaim] = useState<Claim837P>(initial.claim);
  const [scenario, setScenario] = useState<string | null>(initial.scenario);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [jobStatus, setJobStatus] = useState<JobStatus | null>(
    initial.latest_job?.status ?? null,
  );
  const [engine, setEngine] = useState<"agent" | "mock" | null>(
    initial.latest_job?.engine ?? null,
  );
  const [layers, setLayers] = useState<LayerMap>(layersFromHistory(initial));
  const [specialists, setSpecialists] = useState<SpecialistMap>(
    specialistsFromHistory(initial),
  );
  const [findings, setFindings] = useState<ClaimFinding[]>(initial.findings);
  const [activity, setActivity] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<ConfidenceReport | null>(
    initial.latest_job?.confidence ?? null,
  );
  const [streamError, setStreamError] = useState<string | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  useEffect(() => () => unsubscribeRef.current?.(), []);

  const handleEvent = useCallback((event: JobEvent) => {
    switch (event.type) {
      case "status":
        setJobStatus(event.status);
        if (event.engine) setEngine(event.engine);
        break;
      case "layer":
        setLayers((prev) => ({
          ...prev,
          [event.layer as FindingLayer]: {
            state:
              event.state === "start"
                ? "running"
                : event.state === "pass"
                  ? "pass"
                  : "fail",
            errors: event.errors,
            warnings: event.warnings,
          },
        }));
        break;
      case "finding":
        setFindings((prev) =>
          prev.some((f) => f.id === event.finding.id)
            ? prev
            : [...prev, event.finding],
        );
        break;
      case "agent_start":
        setSpecialists((prev) => ({
          ...prev,
          [event.agent]: { state: "running" },
        }));
        break;
      case "agent_done":
        setSpecialists((prev) => ({
          ...prev,
          [event.agent]: {
            state: event.state,
            errors: event.errors,
            warnings: event.warnings,
          },
        }));
        break;
      case "agent_activity":
        setActivity((prev) => [...prev.slice(-19), event.text]);
        break;
      case "confidence":
        setConfidence(event.confidence);
        break;
      case "done":
        setJobStatus(event.job.status);
        if (event.job.confidence) setConfidence(event.job.confidence);
        setRunning(false);
        break;
      case "error":
        setStreamError(event.message);
        setJobStatus("failed");
        setRunning(false);
        break;
    }
  }, []);

  const attachToJob = useCallback(
    (jobId: string) => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = subscribeToJob(jobId, handleEvent);
    },
    [handleEvent],
  );

  // Re-attach to an in-flight job after a page reload; the stream replays.
  useEffect(() => {
    const job = initial.latest_job;
    if (job && job.status !== "complete" && job.status !== "failed") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRunning(true);
      attachToJob(job.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateClaim(next: Claim837P) {
    setClaim(next);
    setDirty(true);
  }

  function inject(scenarioId: string) {
    const s = findScenario(scenarioId);
    if (!s) return;
    setClaim(s.apply(claim));
    setScenario(scenarioId);
    setDirty(true);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setImporting(true);
    setActionError(null);
    setImportNotice(null);
    try {
      const result = await claimsApi.importPdf(file);
      setClaim(result.claim);
      setScenario(null);
      setDirty(true);
      const label =
        result.engine === "anthropic"
          ? "Extracted values from the PDF"
          : "Loaded sample data";
      const warn = result.warnings.length
        ? ` · ${result.warnings.join(" ")}`
        : "";
      setImportNotice(`${label} — review each box, then Save or Submit.${warn}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function resetToDraft() {
    setActionError(null);
    try {
      // Restores the pristine generated claim and clears prior findings.
      const detail = await claimsApi.reset(initial.id);
      setClaim(detail.claim);
      setScenario(null);
      setDirty(false);
      unsubscribeRef.current?.();
      setJobStatus(null);
      setEngine(null);
      setLayers(structuredClone(IDLE_LAYERS));
      setSpecialists(structuredClone(IDLE_SPECIALISTS));
      setFindings([]);
      setActivity([]);
      setConfidence(null);
      setStreamError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to reset");
    }
  }

  async function saveDraft() {
    setSaving(true);
    setActionError(null);
    try {
      await claimsApi.save(initial.id, claim, scenario);
      setDirty(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setRunning(true);
    setActionError(null);
    setStreamError(null);
    setFindings([]);
    setActivity([]);
    setConfidence(null);
    setLayers(structuredClone(IDLE_LAYERS));
    setSpecialists(structuredClone(IDLE_SPECIALISTS));
    setJobStatus("pending");
    try {
      await claimsApi.save(initial.id, claim, scenario);
      setDirty(false);
      const { job_id } = await claimsApi.validate(initial.id);
      attachToJob(job_id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Submission failed");
      setRunning(false);
      setJobStatus(null);
    }
  }

  function onFindingUpdate(updated: ClaimFinding) {
    setFindings((prev) =>
      prev.map((f) => (f.id === updated.id ? updated : f)),
    );
  }

  return (
    <div className="space-y-5">
      <ScenarioBar
        activeScenario={scenario}
        disabled={running}
        onInject={inject}
        onReset={resetToDraft}
      />
      {actionError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {actionError}
        </p>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-3">
          <FileUp size={18} className="text-teal-700" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700">
              Import from PDF
            </p>
            <p className="text-xs text-slate-400">
              Upload a completed CMS-1500 / 837P PDF to prefill every box.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button
            variant="secondary"
            className="ml-auto"
            disabled={running || importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={15} />
            {importing ? "Reading PDF…" : "Choose PDF"}
          </Button>
        </div>
        {importNotice && (
          <p className="mt-2 rounded-lg border border-teal-200 bg-teal-50 p-2 text-xs text-teal-800">
            {importNotice}
          </p>
        )}
      </div>
      <div className="space-y-5">
        <ClaimForm claim={claim} onChange={updateClaim} disabled={running} />
        <div className="sticky bottom-4 z-10 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <Button
            variant="secondary"
            onClick={saveDraft}
            disabled={running || saving || !dirty}
          >
            <Save size={15} />
            {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </Button>
          <Button onClick={submit} disabled={running || saving}>
            <SendHorizonal size={15} />
            {running ? "Validating…" : "Submit for validation"}
          </Button>
          <p className="ml-auto hidden text-xs text-slate-400 md:block">
            Submitting saves the claim, then runs all three validation layers.
          </p>
        </div>
        <ValidationPanel
          jobStatus={jobStatus}
          engine={engine}
          layers={layers}
          specialists={specialists}
          activity={activity}
          findings={findings}
          confidence={confidence}
          streamError={streamError}
          onFindingUpdate={onFindingUpdate}
        />
      </div>
    </div>
  );
}
