import Link from "next/link";
import { ArrowRight, ClipboardCheck, Clock3, ShieldAlert, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { Finding, Patient } from "@/lib/types";
import { Badge, Card } from "@/components/ui";

export default async function Dashboard() {
  let patients: Patient[] = [];
  let findings: Finding[] = [];
  try { [patients, findings] = await Promise.all([api.patients(), api.findings()]); } catch {}
  const pending = findings.filter((finding) => finding.status === "pending");
  const stats = [
    { label: "Active patients", value: patients.length, icon: Users, detail: "All demo workflows" },
    { label: "Needs review", value: pending.length, icon: ClipboardCheck, detail: "Human decision required" },
    { label: "High urgency", value: patients.filter((p) => p.risk_level === "high").length, icon: ShieldAlert, detail: "Authorization at risk" },
    { label: "Avg. review time", value: "2m", icon: Clock3, detail: "Demo target" },
  ];
  return <div className="mx-auto max-w-7xl space-y-7">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold text-teal-700">Saturday, July 18</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Good morning, Jordan</h1><p className="mt-2 text-slate-600">Review high-impact items before they delay care.</p></div><Link href="/patients/maya-thompson" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white">Review priority patient <ArrowRight size={17}/></Link></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map((stat) => <Card className="p-5" key={stat.label}><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{stat.label}</p><stat.icon className="text-teal-700" size={19}/></div><p className="mt-3 text-3xl font-bold">{stat.value}</p><p className="mt-1 text-xs text-slate-500">{stat.detail}</p></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]"><Card><div className="border-b border-slate-200 p-5"><h2 className="font-semibold">Recent patient activity</h2></div><div className="divide-y divide-slate-100">{patients.slice(0,3).map((p) => <Link href={`/patients/${p.id}`} key={p.id} className="flex items-center justify-between p-5 hover:bg-slate-50"><div><p className="font-semibold">{p.name}</p><p className="mt-1 text-sm text-slate-500">{p.primary_condition} · {p.payer}</p></div><Badge tone={p.risk_level === "high" ? "rose" : "amber"}>{p.workflow_status}</Badge></Link>)}</div></Card><Card><div className="border-b border-slate-200 p-5"><h2 className="font-semibold">Items requiring review</h2></div><div className="p-5">{pending.length ? <p className="text-sm text-slate-600">{pending.length} AI finding awaits a human decision.</p> : <div className="py-8 text-center"><ClipboardCheck className="mx-auto text-teal-600"/><p className="mt-3 font-semibold">Queue is clear</p><p className="mt-1 text-sm text-slate-500">Run a patient review to populate it.</p></div>}</div></Card></div>
  </div>;
}
