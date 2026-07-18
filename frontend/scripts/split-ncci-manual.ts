// Split the NCCI Medicaid Policy Manual (parsed to a single markdown file) into
// per-chapter files the clinical-evidence agent can grep/read at query time.
//
// Usage:  npx tsx scripts/split-ncci-manual.ts <path-to-parsed-markdown>
//         (defaults to ../.firecrawl/ncci-manual.md relative to the repo root)
//
// The manual has a clear structure: front matter (intro + master TOC) followed
// by 13 chapters, each introduced by an all-caps "## CHAPTER <roman>" title
// page. We split on those title pages only — the parsed markdown over-tags many
// lines as headings, so a naive split on every "##" would shatter the text.
import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "knowledge", "ncci");
const DEFAULT_INPUT = path.join(process.cwd(), "..", ".firecrawl", "ncci-manual.md");

// Descriptive slugs keyed by roman numeral, so filenames stay stable and
// human-scannable regardless of how the title-page text is parsed.
const CHAPTER_SLUGS: Record<string, string> = {
  I: "general-correct-coding-policies",
  II: "anesthesia-services",
  III: "surgery-integumentary-system",
  IV: "surgery-musculoskeletal-system",
  V: "surgery-respiratory-cardiovascular-hemic-lymphatic",
  VI: "surgery-digestive-system",
  VII: "surgery-urinary-genital-maternity",
  VIII: "surgery-endocrine-nervous-eye-auditory",
  IX: "radiology-services",
  X: "pathology-laboratory-services",
  XI: "medicine-evaluation-and-management-services",
  XII: "supplemental-services",
  XIII: "category-iii-codes",
};

const ROMAN_ORDER = [
  "I", "II", "III", "IV", "V", "VI", "VII",
  "VIII", "IX", "X", "XI", "XII", "XIII",
];

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function main() {
  const input = path.resolve(process.argv[2] ?? DEFAULT_INPUT);
  if (!fs.existsSync(input)) {
    fail(
      `parsed markdown not found: ${input}\n` +
        `Parse the PDF first, e.g. with the firecrawl CLI:\n` +
        `  firecrawl parse docs/<manual>.PDF -o .firecrawl/ncci-manual.md`,
    );
  }

  const lines = fs.readFileSync(input, "utf-8").split("\n");

  // Find each chapter's starting line. A title page looks like "## CHAPTER IV".
  const chapterRe = /^##\s+CHAPTER\s+([IVXLC]+)\b/;
  const starts: { roman: string; line: number }[] = [];
  lines.forEach((line, i) => {
    const m = line.match(chapterRe);
    if (m && ROMAN_ORDER.includes(m[1])) {
      starts.push({ roman: m[1], line: i });
    }
  });
  if (starts.length === 0) {
    fail("no '## CHAPTER <roman>' title pages found — is this the NCCI manual?");
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written: string[] = [];

  // Front matter: everything before the first chapter (intro + master TOC).
  const frontEnd = starts[0].line;
  if (frontEnd > 0) {
    const file = path.join(OUT_DIR, "00-introduction.md");
    const body = lines.slice(0, frontEnd).join("\n").trim();
    fs.writeFileSync(
      file,
      `# NCCI Medicaid Policy Manual — Introduction & Table of Contents\n\n${body}\n`,
    );
    written.push(`${path.basename(file)} (${body.length} chars)`);
  }

  // Each chapter runs to the start of the next one (or EOF for the last).
  starts.forEach((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
    const num = String(ROMAN_ORDER.indexOf(start.roman) + 1).padStart(2, "0");
    const slug = CHAPTER_SLUGS[start.roman] ?? `chapter-${start.roman.toLowerCase()}`;
    const file = path.join(OUT_DIR, `${num}-${slug}.md`);
    const body = lines.slice(start.line, end).join("\n").trim();
    fs.writeFileSync(
      file,
      `<!-- source: ${path.basename(input)} | chapter ${start.roman} -->\n\n${body}\n`,
    );
    written.push(`${path.basename(file)} (${body.length} chars)`);
  });

  console.log(`Wrote ${written.length} section file(s) to ${OUT_DIR}:`);
  written.forEach((w) => console.log(`  - ${w}`));
}

main();
