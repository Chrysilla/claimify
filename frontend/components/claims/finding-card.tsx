"use client";
import { useState } from "react";
import { Check, Pencil, Quote, X } from "lucide-react";
import { claimsApi } from "@/lib/claims/client-api";
import type { ClaimFinding, FindingSeverity } from "@/lib/claims/types";
import { SPECIALIST_LABELS } from "@/lib/claims/types";
import { Badge, Button, Card } from "@/components/ui";

const SEVERITY_TONE: Record<FindingSeverity, "rose" | "amber" | "blue"> = {
  error: "rose",
  warning: "amber",
  info: "blue",
};

const LAYER_LABEL: Record<string, string> = {
  structural: "Structural",
  content: "Content & coding",
  clinical: "Clinical evidence",
};

export function FindingCard({
  finding,
  onUpdate,
}: {
  finding: ClaimFinding;
  onUpdate: (updated: ClaimFinding) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fixDraft, setFixDraft] = useState(finding.recommended_fix);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<ClaimFinding>) {
    setBusy(true);
    try {
      onUpdate(await action());
      setEditing(false);
      setRejecting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
          {LAYER_LABEL[finding.layer] ?? finding.layer}
        </span>
        {finding.agent && (
          <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-700">
            {SPECIALIST_LABELS[finding.agent]}
          </span>
        )}
        {finding.rule_id && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
            {finding.rule_id}
          </span>
        )}
        {finding.loop_segment && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
            {finding.loop_segment}
          </span>
        )}
        {finding.status !== "pending" && (
          <span className="ml-auto">
            <Badge tone={finding.status === "approved" ? "teal" : "rose"}>
              {finding.status}
            </Badge>
          </span>
        )}
      </div>
      <p className="mt-2.5 font-semibold text-slate-900">{finding.issue}</p>
      <p className="mt-1 text-sm leading-6 text-slate-600">
        {finding.why_it_matters}
      </p>
      {finding.evidence.length > 0 && (
        <div className="mt-3 space-y-2">
          {finding.evidence.map((e, i) => (
            <div
              key={i}
              className="rounded-r-lg border-l-2 border-teal-600 bg-slate-50 px-3 py-2"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Quote size={12} className="text-teal-700" />
                {e.label}
              </p>
              <p className="mt-1 text-sm italic leading-5 text-slate-700">
                “{e.excerpt}”
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">
          Recommended fix
        </p>
        {editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              aria-label="Edit recommended fix"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              rows={3}
              value={fixDraft}
              onChange={(e) => setFixDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                disabled={busy || fixDraft.trim().length < 3}
                onClick={() =>
                  run(() => claimsApi.editFinding(finding.id, fixDraft.trim()))
                }
              >
                Save fix
              </Button>
              <Button variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm leading-6 text-slate-700">
            {finding.recommended_fix}
          </p>
        )}
      </div>
      {finding.status === "pending" && !editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            disabled={busy}
            onClick={() => run(() => claimsApi.approveFinding(finding.id))}
          >
            <Check size={15} />
            Approve
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setEditing(true);
              setFixDraft(finding.recommended_fix);
            }}
          >
            <Pencil size={14} />
            Edit fix
          </Button>
          {rejecting ? (
            <span className="flex flex-1 items-center gap-2">
              <input
                aria-label="Rejection reason"
                autoFocus
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-2 text-sm"
                placeholder="Reason for rejecting"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                variant="danger"
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  run(() => claimsApi.rejectFinding(finding.id, reason.trim()))
                }
              >
                Confirm
              </Button>
            </span>
          ) : (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              <X size={15} />
              Reject
            </Button>
          )}
        </div>
      )}
      {finding.review_note && (
        <p className="mt-2 text-xs text-slate-500">
          Reviewer note: {finding.review_note}
        </p>
      )}
    </Card>
  );
}
