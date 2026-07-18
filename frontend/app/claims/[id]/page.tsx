"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, MapPin, Stethoscope } from "lucide-react";
import { claimsApi } from "@/lib/claims/client-api";
import type { ClaimDetail } from "@/lib/claims/types";
import { Badge } from "@/components/ui";
import { ClaimEditor } from "@/components/claims/claim-editor";

const SETTING_LABEL: Record<string, string> = {
  AMB: "Ambulatory",
  IMP: "Inpatient",
  HH: "Home health",
};

export default function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<ClaimDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    claimsApi
      .get(id)
      .then((d) => active && setDetail(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load"));
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link
          href="/claims"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={15} /> Back to claims
        </Link>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-96 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </div>
    );
  }

  const setting = SETTING_LABEL[detail.encounter.encounter_class] ?? detail.encounter.encounter_class;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/claims"
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft size={15} /> Back to claims
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              837P claim · {detail.patient_name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {detail.encounter.visit_title}
            </p>
          </div>
          <Badge tone="slate">
            <span className="font-mono">{detail.id}</span>
          </Badge>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar size={13} /> DOS {detail.encounter.date}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} /> {setting} · {detail.encounter.organization_name}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Stethoscope size={13} /> {detail.encounter.practitioner_name}
          </span>
        </div>
      </div>
      <ClaimEditor initial={detail} />
    </div>
  );
}
