import { NextResponse } from "next/server";
import { decideFinding, getFinding } from "@/lib/patients/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getFinding(id)) {
    return NextResponse.json(
      { error: { code: "finding_not_found", message: "Finding not found" } },
      { status: 404 },
    );
  }
  try {
    return NextResponse.json(decideFinding(id, "approved"));
  } catch {
    return NextResponse.json(
      {
        error: { code: "finding_already_reviewed", message: "Finding already reviewed" },
      },
      { status: 409 },
    );
  }
}
