import { NextResponse } from "next/server";
import { getPatient, runReview } from "@/lib/patients/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getPatient(id)) {
    return NextResponse.json(
      { error: { code: "patient_not_found", message: "Patient not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json(runReview(id), { status: 201 });
}
