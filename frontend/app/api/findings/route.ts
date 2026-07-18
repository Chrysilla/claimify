import { NextResponse } from "next/server";
import { listFindings } from "@/lib/patients/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const patientId = new URL(request.url).searchParams.get("patient_id") ?? undefined;
  return NextResponse.json(listFindings(patientId));
}
