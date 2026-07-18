import { NextResponse } from "next/server";
import { getPatient } from "@/lib/patients/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const patient = getPatient(id);
  if (!patient) {
    return NextResponse.json(
      { error: { code: "patient_not_found", message: "Patient not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json(patient);
}
