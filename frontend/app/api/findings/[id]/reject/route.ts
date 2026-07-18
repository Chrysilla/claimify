import { NextResponse } from "next/server";
import { decideFinding, getFinding } from "@/lib/patients/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getFinding(id)) {
    return NextResponse.json(
      { error: { code: "finding_not_found", message: "Finding not found" } },
      { status: 404 },
    );
  }
  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  if (!body.reason || body.reason.trim().length < 3) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "A rejection reason is required." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(decideFinding(id, "rejected", body.reason.trim()));
  } catch {
    return NextResponse.json(
      {
        error: { code: "finding_already_reviewed", message: "Finding already reviewed" },
      },
      { status: 409 },
    );
  }
}
