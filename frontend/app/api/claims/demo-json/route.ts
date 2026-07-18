import { NextResponse } from "next/server";
import { listDemoJson } from "@/lib/claims/import-json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(listDemoJson());
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "demo_data_unavailable",
          message:
            error instanceof Error ? error.message : "Could not list demo JSON.",
        },
      },
      { status: 404 },
    );
  }
}
