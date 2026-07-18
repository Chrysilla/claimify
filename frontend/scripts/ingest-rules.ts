// Parse a payer-provided 837P rules PDF into the rules catalog format.
//
// Usage:  npx tsx scripts/ingest-rules.ts <path-to-pdf>
//
// Extracted rules replace catalog rules with the same id; all other existing
// rules are kept. The previous catalog is backed up first.
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

const RULES_PATH = path.join(process.cwd(), "rules", "837p-rules.json");
const BACKUP_PATH = path.join(process.cwd(), "rules", "837p-rules.backup.json");

const RULE_SCHEMA = `{
  "id": "S-001",            // stable id; prefix S- (structural), C- (content), M- (clinical/medical-necessity)
  "layer": "structural",    // "structural" | "content" | "clinical"
  "severity": "error",      // "error" | "warning" | "info"
  "loop_segment": "2010BA NM109",
  "field": "subscriber.member_id",
  "title": "Subscriber member ID missing",
  "message": "The subscriber's member identification number is missing from the subscriber name loop.",
  "why": "Without a member ID the payer cannot match the claim to a beneficiary; the claim rejects before adjudication.",
  "fix": "Enter the subscriber's Medicare Beneficiary Identifier exactly as it appears on the member's card.",
  "category": "identification"
}`;

type RuleShape = {
  id: string;
  layer: string;
  severity: string;
  [key: string]: unknown;
};

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    fail("usage: npx tsx scripts/ingest-rules.ts <path-to-pdf>");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    fail(
      "ANTHROPIC_API_KEY is not set. Export it before running rules ingestion.",
    );
  }
  const resolved = path.resolve(pdfPath);
  if (!fs.existsSync(resolved)) {
    fail(`PDF not found: ${resolved}`);
  }

  const pdfData = fs.readFileSync(resolved).toString("base64");
  console.log(
    `Extracting rules from ${path.basename(resolved)} (${(pdfData.length / 1024).toFixed(0)} KB base64)...`,
  );

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfData,
            },
          },
          {
            type: "text",
            text: [
              "This PDF documents validation rules for 837 Professional (837P) healthcare claims.",
              "Extract every validation rule into a JSON array where each rule matches EXACTLY this shape:",
              "",
              RULE_SCHEMA,
              "",
              "Requirements:",
              '- "layer" is "structural" for X12 loop/segment/required-element/balancing rules, "content" for code-format, date, identifier, POS, eligibility, and payer-policy rules, and "clinical" for documentation-support and medical-necessity rules.',
              '- Use stable ids: S-0xx for structural, C-1xx for content, M-2xx for clinical. Reuse the id of an equivalent well-known rule when obvious (e.g., subscriber ID missing -> S-001).',
              "- Paraphrase in your own words. Do NOT copy licensed X12 TR3 or CPT text verbatim.",
              "- Fill loop_segment with the X12 loop and segment the rule concerns when the PDF names one; otherwise your best mapping.",
              "- Output ONLY the JSON array. No prose, no markdown fences.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    fail("No text content in the model response.");
  }

  let raw = textBlock.text.trim();
  // Defensive: strip markdown fences if the model added them anyway.
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1) {
    fail("Response did not contain a JSON array.");
  }

  let extracted: RuleShape[];
  try {
    extracted = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    fail(`Could not parse extracted rules as JSON: ${String(err)}`);
  }
  if (!Array.isArray(extracted!) || extracted!.length === 0) {
    fail("Extraction produced an empty rule list.");
  }
  const invalid = extracted!.filter(
    (rule) =>
      !rule ||
      typeof rule.id !== "string" ||
      !["structural", "content", "clinical"].includes(rule.layer as string) ||
      !["error", "warning", "info"].includes(rule.severity as string),
  );
  if (invalid.length > 0) {
    fail(
      `${invalid.length} extracted rule(s) missing a valid id/layer/severity, e.g. ${JSON.stringify(invalid[0]).slice(0, 200)}`,
    );
  }

  const existing: RuleShape[] = fs.existsSync(RULES_PATH)
    ? JSON.parse(fs.readFileSync(RULES_PATH, "utf-8"))
    : [];
  if (fs.existsSync(RULES_PATH)) {
    fs.copyFileSync(RULES_PATH, BACKUP_PATH);
  }

  const extractedIds = new Set(extracted!.map((rule) => rule.id));
  const merged = [
    ...existing.filter((rule) => !extractedIds.has(rule.id)),
    ...extracted!,
  ].sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(RULES_PATH, `${JSON.stringify(merged, null, 2)}\n`);

  const replaced = existing.filter((rule) => extractedIds.has(rule.id)).length;
  console.log(
    [
      `Extracted ${extracted!.length} rule(s) from the PDF.`,
      `Replaced ${replaced} existing rule(s); kept ${existing.length - replaced} untouched.`,
      `Catalog now has ${merged.length} rule(s) at ${RULES_PATH}.`,
      `Previous catalog backed up to ${BACKUP_PATH}.`,
    ].join("\n"),
  );
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
