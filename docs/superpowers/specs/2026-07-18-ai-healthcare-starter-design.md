# AI Healthcare Hackathon Starter Design

## Purpose

Build a reusable, production-like starter for a one-day AI healthcare hackathon. It must start locally without paid services, present a credible clinician-facing workflow, and remain easy to adapt after the final use case is selected.

## Product Workflow

The starter is a review workspace rather than a chatbot. Users move between a dashboard, patient list, review queue, patient detail, and settings. A reviewer can run an AI-assisted review against fictional patient data and payer rules, inspect cited evidence, then approve, edit, or reject each finding. AI output never changes patient or workflow state without a human action.

The primary demonstration follows fictional patient Maya Thompson. A lumbar MRI authorization is at risk because the encounter note does not document the conservative-treatment duration required by the fictional payer rule. Mock AI identifies the gap, cites the encounter note and rule, recommends a precise documentation action, and sends the finding through human review.

## Architecture

Use a simple monorepo with npm for the frontend, uv for the backend, and a root `Makefile` for common operations.

- `frontend/`: Next.js App Router, TypeScript, Tailwind CSS, local shadcn-style primitives, and Lucide icons.
- `backend/`: FastAPI, Pydantic models, SQLAlchemy repositories, service-layer orchestration, and provider-neutral AI adapters.
- `demo/`: readable JSON fixtures imported into the local database by seed and reset commands.
- `prompts/`: provider-neutral system, review, structured-output, and safety instructions.
- `shared/`: API contract notes and reusable cross-stack documentation rather than generated client machinery.
- `docs/`: architecture, deployment, and live-demo guidance.
- `scripts/`: macOS-friendly commands used by the `Makefile`.

SQLite is the zero-configuration default. The SQLAlchemy connection is configured by `DATABASE_URL`, so a Supabase Postgres URL can replace SQLite later without changing service interfaces.

## Backend Boundaries

API routes validate HTTP input and serialize responses. Services implement patient and review workflows. Repositories own persistence. AI providers accept a normalized patient review context and return Pydantic-validated structured findings.

The API provides:

- health status;
- patient list, detail, create, and update;
- run review and list findings;
- approve, reject, and edit findings;
- seed and reset demo data.

Errors use a stable JSON envelope with a machine-readable code, user-facing message, and optional details. Local CORS permits the configured frontend origin.

## AI Design

One provider factory selects mock, OpenAI, or Anthropic based on environment variables. Mock mode is selected when `USE_MOCK_AI=true` or when the selected provider lacks a key. The mock provider returns deterministic findings for known demo scenarios and a safe no-issue result for other records.

Prompts prohibit invented clinical facts, payer rules, and citations. Provider responses use structured JSON and are validated with Pydantic before persistence. Findings include issue, impact, evidence references, confidence, recommended action, and review state.

## Frontend Design

Use a desktop-first shell with a calm navy, teal, slate, and white palette, clear typography, restrained borders, and accessible status colors. Navigation covers Dashboard, Patients, Review Queue, and Settings.

Source clinical facts appear in neutral cards with source labels. AI findings appear in a visually distinct review panel with an AI-generated badge, confidence, evidence links, and approve/edit/reject controls. No action is implied to be automatic.

Dashboard cards summarize patient and review counts, recent activity, and items needing attention. Patient search and filters operate client-side over the API result. Patient detail groups summary, diagnoses, medications, labs, insurance, notes, findings, next actions, evidence, and human review state. Loading skeletons, meaningful empty states, retryable errors, and responsive layouts are first-class states.

## Demo Data

All records are explicitly fictional. JSON files cover patients, labs, notes, insurance, and payer rules. At least three patients exercise different workflows:

1. Maya Thompson: missing conservative-treatment documentation before MRI authorization.
2. Daniel Cho: medication/lab monitoring follow-up with no critical gap.
3. Elena Rodriguez: coding specificity and supporting-note review.

Resetting demo data recreates database records and removes review actions, producing the same presentation every time.

## Testing and Validation

Backend tests cover health, patient retrieval, structured mock output, review persistence, approval, editing, rejection, and reset determinism. Frontend tests exercise a core component or patient workflow with Vitest and Testing Library. Validation also runs backend lint/type-safe imports, frontend lint, frontend tests, and a Next.js production build.

## Deployment

The frontend is independently deployable to Vercel and reads `NEXT_PUBLIC_API_URL`. The backend includes a production start command and configuration suitable for Railway or Render. No cloud database or AI credentials are required for the default demo.

## Constraints

- Prefer small, explicit modules over frameworks or generated abstractions.
- Preserve deterministic mock mode and the resettable demo path.
- Never commit secrets or real patient information.
- Keep provider SDK usage isolated from application services.
- Optimize for a reliable two-minute demonstration and rapid modification.
