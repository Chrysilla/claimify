"use client";
import React from "react";
import { useState } from "react";
import { Bot, Check, FileText, Pencil, ShieldCheck, X } from "lucide-react";
import type { Finding } from "@/lib/types";
import { Badge, Button, Card } from "./ui";

export function AIReviewPanel({finding,onAction}:{finding:Finding;onAction:(action:"approve"|"edit"|"reject",value?:string)=>void|Promise<void>}){
 const [editing,setEditing]=useState(false);const [value,setValue]=useState(finding.recommended_action);
 return <Card className="overflow-hidden border-indigo-200">
  <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/60 px-5 py-3"><span className="flex items-center gap-2 text-sm font-semibold text-indigo-900"><Bot size={17}/>AI-generated finding</span><Badge tone={finding.status==="approved"?"teal":finding.status==="rejected"?"rose":"blue"}>{finding.status}</Badge></div>
  <div className="space-y-5 p-5"><div><div className="mb-2 flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold text-slate-950">{finding.issue}</h3><Badge tone="teal">{Math.round(finding.confidence*100)}% confidence</Badge></div><p className="text-sm leading-6 text-slate-600">{finding.why_it_matters}</p></div>
  <div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500"><FileText size={14}/>Supporting source evidence</p><div className="grid gap-2">{finding.evidence.map(e=><div key={e.source_id} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-800">{e.label}</p><p className="mt-1 text-sm text-slate-600">“{e.excerpt}”</p></div>)}</div></div>
  <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-4"><p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-800"><ShieldCheck size={14}/>Recommended human action</p>{editing?<textarea className="mt-2 w-full rounded-lg border border-teal-300 bg-white p-3 text-sm" value={value} onChange={e=>setValue(e.target.value)}/>:<p className="text-sm leading-6 text-slate-700">{finding.recommended_action}</p>}</div>
  {finding.status==="pending"&&<div className="flex flex-wrap gap-2">{editing?<><Button onClick={()=>{onAction("edit",value);setEditing(false)}}><Check size={15}/>Save edit</Button><Button variant="secondary" onClick={()=>setEditing(false)}>Cancel</Button></>:<><Button aria-label="Approve finding" onClick={()=>onAction("approve")}><Check size={15}/>Approve</Button><Button aria-label="Edit recommendation" variant="secondary" onClick={()=>setEditing(true)}><Pencil size={15}/>Edit</Button><Button aria-label="Reject finding" variant="danger" onClick={()=>onAction("reject","Not supported by reviewer assessment.")}><X size={15}/>Reject</Button></>}</div>}</div>
 </Card>
}
