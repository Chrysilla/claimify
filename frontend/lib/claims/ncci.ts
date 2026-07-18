// NCCI Medicaid Policy Manual retrieval (server-only).
//
// The 283-page manual is parsed to markdown and split into per-chapter files
// under knowledge/ncci/ by scripts/split-ncci-manual.ts. This module gives the
// clinical-evidence agent two cheap, dependency-free capabilities over those
// files — no embeddings, no vector store:
//
//   listNcciSections() — a compact index (chapter -> topic) for the prompt
//   searchNcci(query)  — keyword search returning cited passages
//   readNcciSection(id)— read one section (windowed, so it never floods context)
//
// This is the "agentic file search" pattern: the agent picks what to read.
import fs from "fs";
import path from "path";

// The NCCI Policy Manual chapters live in the repo-root `ncci-knowledge/` folder
// (they may also be copied to `frontend/knowledge/ncci/`). Resolve either one by
// walking up from the server cwd (frontend/), so NCCI search works in dev and in
// the build without copying files. Override with NCCI_KNOWLEDGE_DIR.
let cachedDir: string | null | undefined;
function knowledgeDir(): string | null {
  if (cachedDir !== undefined) return cachedDir;
  const envDir = process.env.NCCI_KNOWLEDGE_DIR;
  if (envDir && fs.existsSync(envDir)) return (cachedDir = envDir);
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    for (const candidate of [
      path.join(dir, "knowledge", "ncci"),
      path.join(dir, "ncci-knowledge"),
    ]) {
      if (fs.existsSync(candidate)) return (cachedDir = candidate);
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return (cachedDir = null);
}

export type NcciSection = { id: string; slug: string; title: string; file: string };
export type NcciPassage = {
  section: string; // "04 — Surgery: Musculoskeletal System"
  file: string; // "04-surgery-musculoskeletal-system.md"
  line: number; // 1-based line of the first match in this passage
  score: number; // distinct query terms matched in the passage
  text: string; // the matching passage (a small window of lines)
};

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** The section index: chapter number, slug, and human title. Cheap to embed in a prompt. */
export function listNcciSections(): NcciSection[] {
  const dir = knowledgeDir();
  if (!dir) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const m = file.match(/^(\d+)-(.+)\.md$/);
      const id = m ? m[1] : file.replace(/\.md$/, "");
      const slug = m ? m[2] : file.replace(/\.md$/, "");
      return { id, slug, title: titleFromSlug(slug), file };
    });
}

function sectionLabel(s: NcciSection): string {
  return `${s.id} — ${s.title}`;
}

function resolveSection(id: string): NcciSection | undefined {
  const sections = listNcciSections();
  const key = id.trim().toLowerCase();
  return sections.find(
    (s) =>
      s.id === key.padStart(2, "0") ||
      s.id === key ||
      s.slug === key ||
      s.file.toLowerCase() === key,
  );
}

/**
 * Keyword search across all section files. Splits the query into terms, finds
 * lines matching any term, groups nearby matches into passages, and ranks by
 * how many distinct terms a passage covers. Returns the top passages with
 * citations (section + line) so the agent can quote and locate policy text.
 */
export function searchNcci(
  query: string,
  opts: { limit?: number; window?: number } = {},
): NcciPassage[] {
  const limit = opts.limit ?? 6;
  const window = opts.window ?? 4; // lines of context on each side of a hit
  const terms = Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3),
    ),
  );
  if (terms.length === 0) return [];
  const dir = knowledgeDir();
  if (!dir) return [];

  const passages: NcciPassage[] = [];
  for (const section of listNcciSections()) {
    const full = path.join(dir, section.file);
    const lines = fs.readFileSync(full, "utf-8").split("\n");

    // Line indices where any term appears.
    const hits: number[] = [];
    lines.forEach((line, i) => {
      const lower = line.toLowerCase();
      if (terms.some((t) => lower.includes(t))) hits.push(i);
    });
    if (hits.length === 0) continue;

    // Merge hits that fall within `window` of each other into one passage.
    let cluster: number[] = [];
    const flush = () => {
      if (cluster.length === 0) return;
      const start = Math.max(0, cluster[0] - window);
      const end = Math.min(lines.length, cluster[cluster.length - 1] + window + 1);
      const text = lines.slice(start, end).join("\n").trim();
      const lower = text.toLowerCase();
      const score = terms.filter((t) => lower.includes(t)).length;
      passages.push({
        section: sectionLabel(section),
        file: section.file,
        line: cluster[0] + 1,
        score,
        text,
      });
      cluster = [];
    };
    for (const h of hits) {
      if (cluster.length && h - cluster[cluster.length - 1] > window * 2) flush();
      cluster.push(h);
    }
    flush();
  }

  return passages
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, limit);
}

/**
 * Read one section by id ("04"), slug, or filename. Windowed by character
 * offset so a large chapter never floods the agent's context in one call.
 */
export function readNcciSection(
  id: string,
  opts: { offset?: number; length?: number } = {},
): { section: string; offset: number; length: number; total: number; text: string } | null {
  const section = resolveSection(id);
  const dir = knowledgeDir();
  if (!section || !dir) return null;
  const offset = Math.max(0, opts.offset ?? 0);
  const length = Math.min(opts.length ?? 12000, 40000);
  const full = fs.readFileSync(path.join(dir, section.file), "utf-8");
  return {
    section: sectionLabel(section),
    offset,
    length,
    total: full.length,
    text: full.slice(offset, offset + length),
  };
}

/**
 * Deterministic CPT/HCPCS → NCCI chapter router. Maps one code to the id of the
 * chapter whose correct-coding policies govern it, by CPT numeric range. Returns
 * null for codes with no body-system chapter (they still get chapter 01).
 *
 *   00100–01999 → 02 anesthesia          40000–49999 → 06 digestive
 *   10000–19999 → 03 integumentary        50000–59999 → 07 urinary/genital
 *   20000–29999 → 04 musculoskeletal      60000–69999 → 08 endocrine/nervous/eye
 *   30000–39999 → 05 respiratory/cv        70000–79999 → 09 radiology
 *   80000–89999 → 10 pathology/lab         90000–99999 → 11 medicine + E/M
 *   NNNNT (Category III) → 13              HCPCS Level II (A9999) → 11 medicine
 */
export function chapterForCpt(cpt: string): string | null {
  const code = (cpt ?? "").trim().toUpperCase();
  if (!code) return null;
  if (/^\d{4}T$/.test(code)) return "13"; // Category III (e.g. 0512T)
  if (/^[A-Z]\d{4}$/.test(code)) return "11"; // HCPCS Level II (e.g. G0444)
  const n = Number(code);
  if (!Number.isInteger(n)) return null;
  if (n >= 100 && n <= 1999) return "02";
  if (n >= 10000 && n <= 19999) return "03";
  if (n >= 20000 && n <= 29999) return "04";
  if (n >= 30000 && n <= 39999) return "05";
  if (n >= 40000 && n <= 49999) return "06";
  if (n >= 50000 && n <= 59999) return "07";
  if (n >= 60000 && n <= 69999) return "08";
  if (n >= 70000 && n <= 79999) return "09";
  if (n >= 80000 && n <= 89999) return "10";
  if (n >= 90000 && n <= 99999) return "11";
  return null;
}

/**
 * The NCCI chapters relevant to a claim's codes: chapter 01 (general
 * correct-coding policies) always, plus each body-system chapter the codes hit.
 * This is the map-reduce router — it keeps the correct-coding agent scoped to the
 * 1–3 chapters that matter instead of all 14.
 */
export function chaptersForCpts(cpts: string[]): NcciSection[] {
  const ids = new Set<string>(["01"]); // general correct-coding policies always apply
  for (const cpt of cpts) {
    const id = chapterForCpt(cpt);
    if (id) ids.add(id);
  }
  return listNcciSections().filter((s) => ids.has(s.id));
}
