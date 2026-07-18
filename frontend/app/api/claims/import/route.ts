import { NextResponse } from "next/server";
import { extractClaimFromPdf } from "@/lib/claims/import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (Anthropic PDF limit is 32 MB)

function bad(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("invalid_request", "Expected multipart/form-data with a file.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return bad("invalid_request", "No PDF file was uploaded.", 400);
  }

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return bad("invalid_file", "Only PDF files can be imported.", 415);
  }
  if (file.size === 0) {
    return bad("invalid_file", "The uploaded PDF is empty.", 400);
  }
  if (file.size > MAX_BYTES) {
    return bad("file_too_large", "PDF exceeds the 25 MB limit.", 413);
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await extractClaimFromPdf(base64);
  return NextResponse.json(result);
}
