# Claimify agent guide

Claimify is a full-stack **Next.js** healthcare claim-review app. The whole stack —
UI, API route handlers, data (SQLite + in-memory demo store), and AI — lives in
`frontend/`. There is no separate backend service. All records are fictional or
synthetic; the default AI path is a deterministic mock.

## Architecture

- `frontend/app/`: Next.js App Router UI (server + client components).
- `frontend/app/api/`: route handlers — the entire API (all `runtime = "nodejs"`).
- `frontend/lib/`: shared contracts (`types.ts`), the isomorphic patient API client
  (`api.ts`), and the two verticals under `lib/claims/` and `lib/patients/`.
- `frontend/demo/*.json`: fictional patient fixtures (patient-review vertical).
- `frontend/rules/837p-rules.json`: 837P validation rule catalog.
- `prompts/`: reference model-grounding notes (not loaded at runtime).

Keep API access in the typed clients (`lib/api.ts` for patients, `lib/claims/client-api.ts`
for claims); components should not construct URLs or import server-only modules
(`lib/claims/db.ts`, `lib/claims/jobs.ts`, `lib/patients/store.ts`).

## 837P claim validation vertical

The claim-validation engine is the app's centerpiece. See
[docs/CLAIMS.md](docs/CLAIMS.md) for the full guide. Key boundaries:

- `frontend/lib/claims/`: contracts (`types.ts`), SQLite (`db.ts`, **server-only**),
  deterministic validators (`validate.ts`), rule catalog (`rules.ts`), the Claude
  Agent SDK runner + mock fallback (`agent.ts`), the PDF→claim extractor
  (`import.ts`, **server-only**, raw Anthropic SDK + mock fallback), the job/SSE
  orchestrator (`jobs.ts`), and confidence scoring (`scoring.ts`).
- `frontend/app/api/claims/**` and `app/api/validation/**`: Next.js route handlers
  (all `runtime = "nodejs"`).
- `frontend/app/claims/**` + `frontend/components/claims/**`: the 837P form and
  streaming feedback UI. Client code imports only from `types.ts`,
  `scenarios.ts`, and `client-api.ts` — never `db.ts`.
- `frontend/rules/837p-rules.json`: the validation rule catalog. Keep rule ids
  stable (`S-`/`C-`/`M-` prefixes); both the deterministic checks and the agent
  read from it. Do not paste licensed X12 TR3 or CPT text into it.
- Golden path: encounter `4b4735a2` (Elias Wisozk), claim `clm-4b4735a2`. Keep
  its generated draft passing all layers. `npm run seed:claims` is the
  deterministic reset; the in-app "Reset to draft" restores the pristine claim
  from `original_claim_json`.
- Preserve no-key mock mode: with no `ANTHROPIC_API_KEY` / `USE_MOCK_AI=true`,
  the clinical layer must run deterministically.

## Run and validate

Run `npm run setup` then `npm run dev` (or `make install` / `make dev`). Validate
with `npm run build`, `npm run lint`, and `npm test` inside `frontend/`.

## Conventions

- Keep TypeScript strict and API responses typed; use the shared types in
  `lib/types.ts` and `lib/claims/types.ts` rather than redefining shapes.
- Keep route handlers thin; validation/orchestration logic belongs in `lib/`.
- Preserve structured error envelopes: `{ "error": { "code", "message", "details"? } }`.
- Server-only modules (`lib/claims/db.ts`, `jobs.ts`, `agent.ts`, `queries.ts`,
  `lib/patients/store.ts`) must never be imported by client components.
- Prefer small, reviewable changes. Do not reintroduce a separate backend service,
  queues, or extra infrastructure without a demonstrated need.
- Preserve no-key mock mode and deterministic reset behavior.
- Never add real patient data or secrets.
- Update tests and documentation when behavior changes.

## Protect the demo

Two golden paths:
- **Claims:** encounter `4b4735a2` (Elias Wisozk), claim `clm-4b4735a2` — its
  generated draft must pass all three layers. `npm run seed:claims` is the
  deterministic reset; in-app "Reset to draft" restores `original_claim_json`.
- **Patient review:** Maya Thompson — the note ID, payer-rule ID, deterministic
  mock finding, and run-review → edit/approve sequence must keep working.
