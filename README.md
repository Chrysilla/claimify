# Claimify

Claimify is a full-stack **Next.js** application for pre-submission healthcare
claim review. Its centerpiece is an **837P professional-claim validation engine
and medical-necessity scorer** with an agentic clinical-evidence layer powered by
the **Claude Agent SDK**. It also includes a lightweight patient documentation
review workflow. Everything — UI, API, data, and AI — runs on a single Next.js
stack with SQLite; no separate backend and no paid API required to demo.

> Demo only. All people, plans, identifiers, notes, claims, and rules are
> fictional or synthetic. This software is not a medical device and does not
> provide clinical or billing advice.

## What's inside

- **837P claims workspace (`/claims`)** — a web form mirroring the 837P structure
  (billing provider 2010AA, subscriber 2010BA, payer 2010BB, claim info 2300,
  diagnosis codes, service lines 2400) prefilled from synthetic FHIR encounters.
  Submit a claim to run three validation layers:
  1. **Structural** (deterministic) — required loops, balanced totals, diagnosis
     pointers, duplicate lines, frequency codes.
  2. **Content & coding** (deterministic) — ICD-10/CPT formats, NPI check digits,
     DOS vs encounter period, place of service, eligibility, provider registry,
     timely filing.
  3. **Clinical evidence** (agentic, Claude Agent SDK) — grounds every billed
     service and diagnosis against the encounter note, transcript, and FHIR
     context, citing verbatim evidence.

  Findings stream to the UI live and the claim receives a **Medicare-acceptance
  confidence score**. Each finding is reviewable (approve / edit / reject).
- **Patient review workflow (`/patients`, `/review-queue`)** — a documentation
  review demo over three fictional patients with a deterministic mock reviewer.

## Architecture

```text
Next.js app :3000
  ├── app/                UI (server + client components)
  ├── app/api/            Route handlers (all runtime = "nodejs")
  │     ├── claims/**            837P claims + validation + findings
  │     ├── validation/**        SSE job stream
  │     ├── patients/**          patient documentation review
  │     └── findings/**          review lifecycle
  ├── lib/claims/         SQLite, validators, rule catalog, Agent SDK runner, scoring
  ├── lib/patients/       in-memory demo store (demo/*.json)
  ├── rules/837p-rules.json      validation rule catalog
  ├── demo/*.json                fictional patient fixtures
  └── scripts/            seed-claims.ts, ingest-rules.ts
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and data flow, and
[docs/CLAIMS.md](docs/CLAIMS.md) for the claims engine in depth.

## Prerequisites

- macOS or Linux
- Node.js 22+
- npm 10+

## Start locally

```bash
npm run setup    # install deps + seed the claims database (one time)
npm run dev      # start the app; open http://localhost:3000/claims
```

`npm run dev` seeds the claims DB if needed and starts Next.js. Stop with `Ctrl-C`.

## Commands (repo root)

| Command | Action |
|---|---|
| `npm run setup` | Install frontend dependencies and seed the claims database |
| `npm run dev` | Seed (if missing) and start the Next.js app |
| `npm run dev:mock` | Same, forcing the deterministic mock validator (no API key, no tokens) |
| `npm run dev:claims` | Alias — the whole app is Next.js, so this is equivalent to `dev` |
| `npm run seed` | Deterministic reset of the claims database |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run ingest:rules -- <pdf>` | Parse an 837P rules PDF into the rule catalog |

`make dev` / `make install` / `make seed` / `make test` / `make lint` / `make build`
are thin wrappers around the same npm scripts.

## AI engine selection

The clinical-evidence layer runs the Claude Agent SDK when credentials are
available, and a deterministic mock otherwise — with automatic fallback.

| Condition | Engine |
|---|---|
| `USE_MOCK_AI=true` | Deterministic mock validator (no key) |
| `ANTHROPIC_API_KEY` set, or a local Claude Code login (`~/.claude`) | Claude Agent SDK |
| Agent errors mid-run | Automatic fallback to the mock |

Optional environment variables (all have working defaults — no `.env` needed):

| Variable | Default | Purpose |
|---|---|---|
| `USE_MOCK_AI` | unset | Set `true` to force the deterministic mock clinical layer |
| `ANTHROPIC_API_KEY` | unset | Enables the Claude Agent SDK clinical layer |
| `CLAIMIFY_AGENT_MODEL` | `claude-opus-4-8` | Model for the clinical agent |
| `CLAIMS_DB_PATH` | `frontend/claimify-claims.db` | SQLite database location |

## Demo: 837P golden claim

Patient **Elias Wisozk** (general adult exam — new hypertension + metabolic
syndrome). Golden claim: 99204 office visit + G0444 depression screening + G0442
alcohol screening, $211, dx I10 / E88.81 / E66.9 / Z68.30 / K05.10 / Z13.31 /
Z13.89.

1. Open `/claims`, pick Elias Wisozk → the prefilled draft.
2. Submit as-is → all three layers pass, high acceptance probability.
3. Pick an **error-injection scenario** (e.g. *Unsupported procedure*,
   *Upcoded E/M*, *Invalid place of service*) → Submit → structural/content
   findings appear instantly, the agent streams its clinical review with cited
   evidence, and the confidence gauge drops with an explanation.
4. Approve / edit / reject each finding — the human stays in the loop.
5. **Reset to draft** restores the pristine claim.

Full talk track: [docs/CLAIMS.md](docs/CLAIMS.md). The patient-review demo
walkthrough is in [docs/DEMO.md](docs/DEMO.md).

## Tests

```bash
npm run build --prefix frontend   # production compile + typecheck
npm run lint --prefix frontend
npm test --prefix frontend -- --run
```

## Deployment (Vercel)

Import the repository, set `frontend` as the root directory, and deploy — the
included `frontend/vercel.json` selects Next.js. Set `ANTHROPIC_API_KEY` to enable
the live agent (or leave it unset for mock mode). Note that the claims SQLite
database is generated by `npm run seed:claims` at build/seed time; for a
persistent multi-instance deployment, point `CLAIMS_DB_PATH` at durable storage or
run the seed as part of the build.

## Rules PDF ingestion

`frontend/rules/837p-rules.json` ships a fictional Medicare-style starter catalog.
Replace it with rules extracted from your own PDF:

```bash
cd frontend
ANTHROPIC_API_KEY=... npm run ingest:rules -- /path/to/837p-rules.pdf
```

## Troubleshooting

- **A page fails to load data:** the app serves its own API — confirm the dev
  server is running and reachable at `http://localhost:3000`.
- **`/claims` says the database is empty:** run `npm run seed:claims` in
  `frontend/`.
- **Claims demo state is messy:** run `npm run seed` (deterministic reset), or use
  "Reset to draft" in the claim editor.
- **Agent doesn't run:** ensure `ANTHROPIC_API_KEY` is set (or a Claude Code login
  exists) and `USE_MOCK_AI` is not `true`; otherwise the mock validator runs.
- **Port already in use:** stop the process on port 3000 or start with a different
  `PORT`.

## Data & licensing

The `synthetic-ambient-fhir-25/` dataset (provided by Abridge for the hackathon)
and the generated `claimify-claims.db` are gitignored — do not commit them
publicly. The rule catalog is original fictional content; do not paste licensed
X12 TR3 or CPT text into it.

Agent contributors should read [AGENTS.md](AGENTS.md) before modifying the golden
demo path.
