import { NextResponse } from "next/server";
import { startValidationJob } from "@/lib/claims/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { job_id } = startValidationJob(id);
    return NextResponse.json({ job_id });
  } catch (error) {
    if (error instanceof Error && error.message === "claim_not_found") {
      return NextResponse.json(
        { error: { code: "not_found", message: "Claim not found." } },
        { status: 404 },
      );
    }
    throw error;
  }
}
