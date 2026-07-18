import { NextResponse } from "next/server";
import { loadDemoJson } from "@/lib/claims/import-json";
import { createClaim } from "@/lib/claims/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Create a claim from one of the mock JSON files in demo-data/.
export async function POST(request: Request) {
  let file: string | undefined;
  try {
    const body = await request.json();
    file = typeof body?.file === "string" ? body.file : undefined;
  } catch {
    file = undefined;
  }
  if (!file) {
    return NextResponse.json(
      { error: { code: "invalid_request", message: "A `file` name is required." } },
      { status: 400 },
    );
  }
  try {
    const claim = loadDemoJson(file);
    const detail = createClaim(claim);
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    const notFound =
      error instanceof Error && error.message === "demo_file_not_found";
    return NextResponse.json(
      {
        error: {
          code: notFound ? "not_found" : "import_failed",
          message: notFound
            ? "That demo JSON file was not found."
            : error instanceof Error
              ? error.message
              : "Could not import the JSON claim.",
        },
      },
      { status: notFound ? 404 : 500 },
    );
  }
}
