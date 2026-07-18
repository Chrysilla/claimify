import { NextResponse } from "next/server";
import { dbExistsAndSeeded } from "@/lib/claims/db";
import { getClaimSummaries } from "@/lib/claims/queries";

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
