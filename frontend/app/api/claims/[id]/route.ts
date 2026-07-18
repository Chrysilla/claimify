import { NextResponse } from "next/server";
import type { Claim837P } from "@/lib/claims/types";
import { getClaimDetail, saveClaim } from "@/lib/claims/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = getClaimDetail(id);
  if (!detail) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Claim not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(detail);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { claim?: Claim837P; scenario?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  if (!body.claim || !Array.isArray(body.claim.service_lines)) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Body must include a claim object." } },
      { status: 400 },
    );
  }
  const detail = saveClaim(id, body.claim, body.scenario ?? null);
  if (!detail) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Claim not found." } },
      { status: 404 },
    );
  }
  return NextResponse.json(detail);
}
