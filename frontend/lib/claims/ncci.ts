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

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge", "ncci");

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
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  return fs
    .readdirSync(KNOWLEDGE_DIR)
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

  const passages: NcciPassage[] = [];
  for (const section of listNcciSections()) {
    const full = path.join(KNOWLEDGE_DIR, section.file);
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
  if (!section) return null;
  const offset = Math.max(0, opts.offset ?? 0);
  const length = Math.min(opts.length ?? 12000, 40000);
  const full = fs.readFileSync(path.join(KNOWLEDGE_DIR, section.file), "utf-8");
  return {
    section: sectionLabel(section),
    offset,
    length,
    total: full.length,
    text: full.slice(offset, offset + length),
  };
}
