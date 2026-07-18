import { NextResponse } from "next/server";
import { getDb } from "@/lib/claims/db";
import type { ClaimFinding } from "@/lib/claims/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PatchBody =
  | { action: "approve" }
  | { action: "reject"; review_note: string }
  | { action: "edit"; recommended_fix: string };

function rowToFinding(row: Record<string, unknown>): ClaimFinding {
  return {
    id: row.id as string,
    claim_id: row.claim_id as string,
    job_id: row.job_id as string,
    layer: row.layer as ClaimFinding["layer"],
    rule_id: (row.rule_id as string) ?? null,
    severity: row.severity as ClaimFinding["severity"],
    loop_segment: (row.loop_segment as string) ?? null,
    field: (row.field as string) ?? null,
    issue: row.issue as string,
    why_it_matters: row.why_it_matters as string,
    evidence: JSON.parse((row.evidence_json as string) || "[]"),
    recommended_fix: row.recommended_fix as string,
    status: row.status as ClaimFinding["status"],
    review_note: (row.review_note as string) ?? null,
    created_at: row.created_at as string,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ findingId: string }> },
) {
  const { findingId } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM findings WHERE id = ?").get(findingId) as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Finding not found." } },
      { status: 404 },
    );
  }
  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }
  if (body.action === "edit") {
    if (!body.recommended_fix || body.recommended_fix.trim().length < 3) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "recommended_fix is required." } },
        { status: 400 },
      );
    }
    db.prepare("UPDATE findings SET recommended_fix = ? WHERE id = ?").run(
      body.recommended_fix.trim(),
      findingId,
    );
  } else if (body.action === "approve") {
    db.prepare("UPDATE findings SET status = 'approved' WHERE id = ?").run(findingId);
  } else if (body.action === "reject") {
    if (!body.review_note || body.review_note.trim().length < 3) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "review_note is required to reject." } },
        { status: 400 },
      );
    }
    db.prepare("UPDATE findings SET status = 'rejected', review_note = ? WHERE id = ?").run(
      body.review_note.trim(),
      findingId,
    );
  } else {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Unknown action." } },
      { status: 400 },
    );
  }
  const updated = db
    .prepare("SELECT * FROM findings WHERE id = ?")
    .get(findingId) as Record<string, unknown>;
  return NextResponse.json(rowToFinding(updated));
}
