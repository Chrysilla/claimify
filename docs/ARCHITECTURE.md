# Architecture

Claimify is a single Next.js application. Server components render dashboards and
records; client components own forms, search, validation submission, and reviewer
decisions. The API is a set of Next.js route handlers under `app/api/` (all
`runtime = "nodejs"`) — there is no separate backend service.

## Claims vertical (837P)

The claim-validation engine lives in `lib/claims/`:

- `db.ts` — better-sqlite3 schema + singleton (server-only). Seeded from the
  `synthetic-ambient-fhir-25` dataset by `scripts/seed-claims.ts`, which also
  generates the mock cross-validation sources a claim needs: a Medicare payer,
  per-patient eligibility, an NPI/provider registry, and SNOMED→ICD-10/CPT
  overlays that turn each encounter into a clinically grounded draft claim.
- `validate.ts` + `rules.ts` — deterministic structural and content checks driven
  by the `rules/837p-rules.json` catalog.
- `agent.ts` — the clinical-evidence layer: a Claude Agent SDK agent with
  in-process MCP tools (`get_claim`, `get_clinical_note`, `get_transcript`,
  `get_fhir_context`, `get_medical_necessity_rules`, `report_finding`,
  `report_confidence`). Falls back to a deterministic mock when no credentials are
  present or the agent errors.
- `import.ts` — extracts a `Claim837P` from an uploaded CMS-1500 / 837P PDF using
  Claude's native document understanding (raw Anthropic SDK), with a deterministic
  sample fallback when no API key is present. Backs the editor's "Import from PDF".
- `jobs.ts` — orchestrates the three layers, persists findings, and fans job
  events out to SSE subscribers (with replay for late joiners / reloads).
- `scoring.ts` — blends the agent's clinical assessment with deterministic caps
  (a structural error caps acceptance at ~10%).

```text
claim submit -> layer 1 structural (deterministic)
             -> layer 2 content & coding (deterministic)
             -> layer 3 clinical evidence (Claude Agent SDK, mock fallback)
             -> confidence score + streamed findings
             -> human approve / edit / reject
```

## Patient-review vertical

`lib/patients/store.ts` is a server-only in-memory store seeded from
`demo/*.json`, with a deterministic mock reviewer. Findings live in memory and
reset on restart.

## Human review

Findings — from either vertical — stay `pending` until a human approves or
rejects them; the AI never auto-decides.

## Deployment

The app deploys to Vercel as a standard Next.js project. The claims SQLite
database is produced by the seed script; for persistent multi-instance
deployments, point `CLAIMS_DB_PATH` at durable storage.
