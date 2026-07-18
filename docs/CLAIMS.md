# Claimify 837P claim validation vertical

An end-to-end 837P professional-claim validation engine built into the Next.js app
(`frontend/`), with an agentic clinical-evidence layer powered by the Claude Agent SDK.
The whole app is Next.js — UI, API routes, SQLite, and AI — with no separate backend.

> Demo only. All patients, payers, providers, identifiers, rules, and claims are
> fictional or synthetic. Not a medical device; not billing advice.

## What it does

1. **837P web form** (`/claims/[id]`) — a claim editor mirroring the 837P structure
   (Loop 2010AA billing provider, 2010BA subscriber, 2010BB payer, 2300 claim info,
   HI diagnosis codes with A–L pointers, 2400 service lines), prefilled from the
   synthetic FHIR encounter it bills. Every field carries a **CMS-1500 (02/12) box
   number** chip on the left (Box 1a, 21, 24D, 33a, …) for one-to-one mapping with
   the paper form, alongside the X12 loop/segment headers. Fields whose 837P loop
   has no numbered CMS-1500 box (payer, rendering-provider name) show a muted chip.
   An **Import from PDF** control extracts a claim from an uploaded CMS-1500 / 837P
   PDF and prefills the form for review (see below).
2. **Three-layer validation** on submit:
   - **Layer 1 — structural** (deterministic): required loops/segments, balanced
     totals (CLM02 vs Σ SV102), valid diagnosis pointers, duplicate lines,
     frequency-code rules.
   - **Layer 2 — content & coding** (deterministic): ICD-10-CM/CPT formats, NPI
     check digits, DOS vs the documented encounter period, place-of-service vs
     encounter setting, payer eligibility on DOS, provider registry, timely filing.
   - **Layer 3 — clinical evidence** (agentic): a **map-reduce of specialist
     agents** that each cross-check the claim (form data) against the source data
     and the rules they own, then a reduce step dedupes their findings and blends
     their confidences. Each finding is tagged with the specialist that raised it
     and names the exact claim field.
     - **Correct coding (NCCI)** — PTP/bundling, mutually exclusive procedures,
       modifier 25/59 appropriateness, add-on codes, MUEs. Consults only the NCCI
       Policy Manual chapters the claim's CPT codes route to (deterministic
       `chaptersForCpts()` router → 1–3 of 14 chapters instead of all 14).
     - **Medical necessity** — is every billed service / pointed diagnosis
       supported by the note, transcript, and FHIR context? (rules M-201…M-206).
     - **Diagnosis quality** — ICD-10 specificity, and laterality consistency
       between a diagnosis and the RT/LT modifier on the lines that point to it.
     - Each specialist runs in its own Claude Agent SDK session (in parallel),
       reports findings (`report_finding`) with verbatim evidence and a confidence
       (`report_confidence`), and falls back independently to a deterministic mock.
3. **Live streaming feedback** — a specialist strip under the clinical step shows
   each agent going running → pass/fail; findings stream to the UI over SSE as
   each layer/specialist runs; each finding is a reviewable card (approve / edit /
   reject) badged with its author.
4. **Confidence score** — the probability Medicare accepts the claim as billed,
   blending the agent's clinical assessment with deterministic caps (a structural
   error caps acceptance at ~10%: the claim would reject at the clearinghouse).

## Setup

One command from the repo root seeds the claims DB (if missing) and starts the app:

```bash
npm run setup    # one-time: installs deps + seeds the claims DB
npm run dev      # start the app; open http://localhost:3000/claims
```

| Root command | What it does |
|---|---|
| `npm run dev` | Seed claims DB (if missing) → start Next.js |
| `npm run dev:mock` | Same, forcing the deterministic mock validator (no API key, no tokens) |
| `npm run seed` | Re-seed the claims DB (deterministic reset) |
| `npm run build` / `npm run start` | Production build / serve |

Claims-only, from `frontend/` directly:

```bash
cd frontend
npm install
npm run seed:claims   # builds claimify-claims.db from ../synthetic-ambient-fhir-25
npm run dev:claims    # seeds if missing, then next dev → http://localhost:3000/claims
```

The seed ingests the 25 synthetic encounters and generates the mock
cross-validation sources the dataset lacks: a Medicare payer record, per-patient
eligibility (MBI-style member IDs), a provider/NPI registry (valid Luhn check
digits), and curated SNOMED→ICD-10-CM / CPT overlays that turn each encounter into
a clinically grounded draft claim.

### AI engine selection

| Condition | Engine |
|---|---|
| `USE_MOCK_AI=true` | Deterministic mock clinical validator (no key needed) |
| `ANTHROPIC_API_KEY` set, or a local Claude Code login (`~/.claude`) | Claude Agent SDK |
| Agent errors mid-run | Automatic fallback to the mock validator |

`CLAIMIFY_AGENT_MODEL` overrides the model (default `claude-opus-4-8`).

## Import from PDF

The claim editor's **Import from PDF** control uploads a completed CMS-1500 /
837P PDF to `POST /api/claims/import`, which reads it with Claude's native
document understanding (`@anthropic-ai/sdk`, model `CLAIMIFY_AGENT_MODEL`) and
returns a `Claim837P`. The prompt carries the CMS-1500 box → field map so each
numbered box lands in the right field; the result is normalized (line renumber,
total backfilled from the line sum, dangling diagnosis pointers dropped) and
loaded into the editable form for review — nothing is saved until you Save/Submit.

| Condition | Behavior |
|---|---|
| `ANTHROPIC_API_KEY` set (and `USE_MOCK_AI` unset) | Claude extracts field values from the PDF |
| No key, or `USE_MOCK_AI=true`, or extraction errors | A deterministic sample claim is loaded so the flow still demos |

The raw Anthropic SDK requires a real API key — a local `~/.claude` login (which
the layer-3 agent can use) does not supply one, so import falls back to the sample
in that case.

## Rules PDF ingestion

The validation rules live in `frontend/rules/837p-rules.json` (a fictional,
Medicare-style starter catalog). To replace them with rules extracted from your
own PDF:

```bash
cd frontend
ANTHROPIC_API_KEY=... npm run ingest:rules -- /path/to/837p-rules.pdf
```

This parses the PDF with Claude, converts it into the catalog schema, backs up the
old file, and merges by rule id. Both the deterministic validators and the agent's
`get_medical_necessity_rules` tool read from this catalog.

## Demo script (encounter 7 — golden claim)

Patient **Elias Wisozk** (54M), general adult exam, new essential hypertension +
metabolic syndrome. Golden claim: 99204 office visit + G0444 depression screening
+ G0442 alcohol screening, $211 total, dx I10 / E88.81 / E66.9 / Z68.30 / K05.10 /
Z13.31 / Z13.89.

1. Open `/claims`, pick Elias Wisozk → the prefilled draft claim.
2. Submit as-is → all three layers pass, high acceptance probability.
3. Pick an **error-injection scenario** (e.g. *Unsupported procedure* adds a
   20610 joint-injection line with no documentation, *Upcoded E/M* raises the
   visit to 99205) → Submit → structural/content findings appear instantly, the
   agent streams its clinical review, cites the note/transcript, and the
   confidence gauge drops with an explanation.
4. Approve / edit / reject each finding — the human stays in the loop.

## Architecture

```text
app/claims/*                     UI: claim list, 837P editor, feedback panel
app/api/claims/*                 REST: claims CRUD, submit, findings review
app/api/validation/.../stream    SSE: JobEvent stream with replay
lib/claims/types.ts              Shared contracts (Claim837P, ClaimFinding, JobEvent)
lib/claims/db.ts                 better-sqlite3 schema/singleton
lib/claims/overlays.ts           SNOMED→ICD-10/CPT maps, claim builder, NPI/MBI gen
lib/claims/validate.ts           Layers 1–2 deterministic checks
lib/claims/rules.ts              Rule catalog loader (rules/837p-rules.json)
lib/claims/ncci.ts               NCCI manual search/read + CPT→chapter router
lib/claims/agent.ts              Layer-3 entry point (re-exports agents/orchestrator)
lib/claims/agents/orchestrator.ts  Clinical map-reduce: run specialists, dedupe, blend
lib/claims/agents/shared.ts      Shared SDK runner, data tools, encounter docs
lib/claims/agents/{coding,necessity,diagnosis}.ts  The three specialists (+ mocks)
lib/claims/import.ts             PDF → Claim837P extractor (Anthropic SDK) + mock
lib/claims/jobs.ts               Job orchestrator + SSE event bus
lib/claims/scoring.ts            Confidence blending + structural caps
scripts/seed-claims.ts           Dataset → SQLite + mocks + draft claims
scripts/ingest-rules.ts          Rules PDF → catalog JSON
```

## Data licensing

`synthetic-ambient-fhir-25/` was provided by Abridge for hackathon use and has no
explicit redistribution license — it is gitignored; do not commit it to a public
repository. The rules catalog is original fictional content; do not paste licensed
X12 TR3 or CPT text into it.
