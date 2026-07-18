import { NextResponse } from "next/server";
import { resetClaim } from "@/lib/claims/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = resetClaim(id);
  if (!detail) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Claim not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(detail);
}
