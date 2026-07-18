import { NextResponse } from "next/server";
import { dbExistsAndSeeded } from "@/lib/claims/db";
import { createClaim, getClaimSummaries } from "@/lib/claims/queries";
import type { Claim837P } from "@/lib/claims/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!dbExistsAndSeeded()) {
    return NextResponse.json(
      {
        error: {
          code: "not_seeded",
          message:
            "Claims database is empty. Run `npm run seed:claims` in frontend/ first.",
        },
      },
      { status: 503 },
    );
  }
  return NextResponse.json(getClaimSummaries());
}

// Create a new draft claim: blank when no body, or from a provided claim
// (e.g. after a PDF extraction on the list page).
export async function POST(request: Request) {
  let claim: Claim837P | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body && typeof body === "object" && body.claim) {
      claim = body.claim as Claim837P;
    }
  } catch {
    claim = undefined;
  }
  const detail = createClaim(claim);
  return NextResponse.json(detail, { status: 201 });
}
