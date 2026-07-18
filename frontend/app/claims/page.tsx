"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileJson,
  FileUp,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { claimsApi } from "@/lib/claims/client-api";
import type {
  ClaimStatus,
  ClaimSummary,
  DemoJsonSummary,
} from "@/lib/claims/types";
import { Badge, Button, Card } from "@/components/ui";

const SETTING_TONE: Record<string, "teal" | "amber" | "blue" | "slate"> = {
  AMB: "teal",
  IMP: "amber",
  HH: "blue",
};

const STATUS_TONE: Record<ClaimStatus, "slate" | "teal" | "amber" | "blue"> = {
  draft: "slate",
  submitted: "blue",
  validating: "amber",
  validated: "teal",
};

function confidenceTone(score: number | null): "teal" | "amber" | "rose" | "slate" {
  if (score === null) return "slate";
  if (score >= 0.7) return "teal";
  if (score >= 0.4) return "amber";
  return "rose";
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function ClaimsPage() {
  const router = useRouter();
  const [claims, setClaims] = useState<ClaimSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Create / import actions
  const [busy, setBusy] = useState<null | "new" | "pdf" | "json">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonFiles, setJsonFiles] = useState<DemoJsonSummary[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    claimsApi
      .list()
      .then((c) => active && setClaims(c))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      active = false;
    };
  }, []);

  async function createNew() {
    setBusy("new");
    setActionError(null);
    try {
      const detail = await claimsApi.create();
      router.push(`/claims/${detail.id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Could not create a claim");
      setBusy(null);
    }
  }

  async function importFromPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("pdf");
    setActionError(null);
    try {
      const { claim } = await claimsApi.importPdf(file);
      const detail = await claimsApi.create(claim);
      router.push(`/claims/${detail.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "PDF import failed");
      setBusy(null);
    }
  }

  async function toggleJson() {
    const next = !jsonOpen;
    setJsonOpen(next);
    if (next && !jsonFiles) {
      setActionError(null);
      try {
        setJsonFiles(await claimsApi.listDemoJson());
      } catch (e) {
        setActionError(
          e instanceof Error ? e.message : "Could not list demo JSON files",
        );
        setJsonOpen(false);
      }
    }
  }

  async function importFromJson(file: string) {
    setBusy("json");
    setActionError(null);
    setJsonOpen(false);
    try {
      const detail = await claimsApi.importJson(file);
      router.push(`/claims/${detail.id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "JSON import failed");
      setBusy(null);
    }
  }

  const shown = useMemo(
    () =>
      (claims ?? []).filter((c) =>
        `${c.patient_name} ${c.visit_title}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [claims, query],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            837P claims workspace
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            A claim validation and medical-necessity scoring engine for 837P
            professional claims. Each draft is generated from a synthetic ambient
            encounter; submit one to run structural, content, and agentic
            clinical-evidence checks and see the probability Medicare accepts it.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button onClick={createNew} disabled={busy !== null}>
            {busy === "new" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Plus size={15} />
            )}
            New claim
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={importFromPdf}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
          >
            {busy === "pdf" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <FileUp size={15} />
            )}
            Import PDF
          </Button>

          <div className="relative">
            <Button
              variant="secondary"
              onClick={toggleJson}
              disabled={busy !== null}
            >
              {busy === "json" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FileJson size={15} />
              )}
              Import from JSON
            </Button>
            {jsonOpen && (
              <>
                <button
                  type="button"
                  aria-label="Close menu"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setJsonOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-2 max-h-96 w-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Mock 837P claims · demo-data/
                  </p>
                  {!jsonFiles && (
                    <div className="p-3 text-sm text-slate-400">Loading…</div>
                  )}
                  {jsonFiles?.map((f) => (
                    <button
                      key={f.file}
                      type="button"
                      onClick={() => importFromJson(f.file)}
                      className="block w-full rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">
                          {f.label}
                        </span>
                        {f.severity && (
                          <Badge
                            tone={
                              f.severity === "HIGH" || f.severity === "SEVERE"
                                ? "rose"
                                : f.severity === "MODERATE"
                                  ? "amber"
                                  : "slate"
                            }
                          >
                            {f.severity.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate font-mono text-[11px] text-slate-400">
                        {f.patient_name} · {f.line_count} line
                        {f.line_count === 1 ? "" : "s"} · {usd(f.total_charge)} ·{" "}
                        {f.file}
                      </p>
                    </button>
                  ))}
                  {jsonFiles?.length === 0 && (
                    <div className="p-3 text-sm text-slate-400">
                      No JSON files in demo-data/.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {actionError}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
          {error.includes("seed") && (
            <p className="mt-2 font-mono text-xs text-rose-600">
              cd frontend &amp;&amp; npm run seed:claims
            </p>
          )}
        </div>
      )}

      {!claims && !error && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {claims && (
        <Card>
          <div className="border-b border-slate-200 p-4">
            <label className="relative block max-w-md">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input
                aria-label="Search claims"
                className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm"
                placeholder="Search patient or visit"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {["Patient", "Visit", "DOS", "Setting", "Lines", "Charge", "Status", "Findings", "Acceptance"].map(
                    (x) => (
                      <th key={x} className="px-5 py-3 font-semibold">
                        {x}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link
                        href={`/claims/${c.id}`}
                        className="font-semibold text-slate-900 hover:text-teal-700"
                      >
                        {c.patient_name}
                      </Link>
                      <p className="font-mono text-xs text-slate-400">{c.id}</p>
                    </td>
                    <td className="max-w-xs px-5 py-4 text-slate-600">
                      {c.visit_title}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{c.encounter_date}</td>
                    <td className="px-5 py-4">
                      <Badge tone={SETTING_TONE[c.encounter_class] ?? "slate"}>
                        {c.encounter_class}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{c.line_count}</td>
                    <td className="px-5 py-4 text-slate-600">{usd(c.total_charge)}</td>
                    <td className="px-5 py-4">
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {c.finding_count > 0 ? c.finding_count : "—"}
                    </td>
                    <td className="px-5 py-4">
                      {c.latest_confidence === null ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <Badge tone={confidenceTone(c.latest_confidence)}>
                          {Math.round(c.latest_confidence * 100)}%
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length && (
              <div className="p-10 text-center text-sm text-slate-500">
                No claims match this search.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
