import { NextResponse } from "next/server";
import { editFinding, getFinding } from "@/lib/patients/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
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
  let body: { recommended_action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  if (!body.recommended_action || body.recommended_action.trim().length < 3) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "recommended_action is required." } },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(editFinding(id, body.recommended_action.trim()));
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "finding_already_reviewed",
          message: "Only pending findings can be edited",
        },
      },
      { status: 409 },
    );
  }
}
