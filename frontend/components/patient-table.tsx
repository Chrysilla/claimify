"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Patient } from "@/lib/types";
import { age } from "@/lib/utils";
import { Badge, Card } from "./ui";
export function PatientTable({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState("all");
  const shown = useMemo(
    () =>
      patients.filter(
        (p) =>
          (p.name + p.primary_condition + p.payer)
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (risk === "all" || p.risk_level === risk),
      ),
    [patients, query, risk],
  );
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row">
        <label className="relative flex-1">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={18}
          />
          <input
            aria-label="Search patients"
            className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm"
            placeholder="Search name, condition, or payer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="relative">
          <SlidersHorizontal
            className="absolute left-3 top-2.5 text-slate-400"
            size={17}
          />
          <select
            aria-label="Filter by risk"
            className="h-10 rounded-lg border border-slate-300 bg-white pl-9 pr-8 text-sm"
            value={risk}
            onChange={(e) => setRisk(e.target.value)}
          >
            <option value="all">All urgency</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {[
                "Patient",
                "Age",
                "Condition",
                "Payer",
                "Workflow",
                "Urgency",
              ].map((x) => (
                <th key={x} className="px-5 py-3 font-semibold">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <Link
                    href={`/patients/${p.id}`}
                    className="font-semibold text-slate-900 hover:text-teal-700"
                  >
                    {p.name}
                  </Link>
                  <p className="text-xs text-slate-500">ID {p.id}</p>
                </td>
                <td className="px-5 py-4">{age(p.date_of_birth)}</td>
                <td className="px-5 py-4">{p.primary_condition}</td>
                <td className="px-5 py-4">{p.payer}</td>
                <td className="px-5 py-4">
                  <Badge>{p.workflow_status}</Badge>
                </td>
                <td className="px-5 py-4">
                  <Badge
                    tone={
                      p.risk_level === "high"
                        ? "rose"
                        : p.risk_level === "medium"
                          ? "amber"
                          : "teal"
                    }
                  >
                    {p.risk_level}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && (
          <div className="p-10 text-center text-sm text-slate-500">
            No patients match these filters.
          </div>
        )}
      </div>
    </Card>
  );
}
