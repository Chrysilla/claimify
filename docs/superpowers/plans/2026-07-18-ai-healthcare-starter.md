# AI Healthcare Hackathon Starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a runnable full-stack healthcare review starter with resettable fictional data, deterministic AI findings, human approval, and a polished two-minute demo.

**Architecture:** A Next.js client calls a FastAPI REST API. FastAPI services coordinate SQLAlchemy repositories and a provider-neutral AI interface; SQLite is the local default and JSON fixtures recreate the demo deterministically.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Lucide, Vitest, FastAPI, Pydantic, SQLAlchemy, uv, pytest, SQLite.

## Global Constraints

- The application must run without paid API access using deterministic mock AI.
- AI may create findings but must not change patient workflow state without human approval.
- Demo records must be fictional and resettable.
- `DATABASE_URL` must allow later migration from SQLite to Supabase Postgres.
- Prefer explicit, small modules and minimal infrastructure.
- Support macOS and provide root-level `make` commands.

---

### Task 1: Backend contract and persistence

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/config.py`, `backend/app/database.py`, `backend/app/models.py`, `backend/app/schemas.py`
- Create: `backend/app/repositories/patients.py`, `backend/app/repositories/findings.py`
- Test: `backend/tests/test_health.py`, `backend/tests/test_patients.py`

**Interfaces:**
- Produces: `PatientRepository`, `FindingRepository`, `PatientDetail`, `FindingRead`, and a dependency-injected SQLAlchemy session.

- [ ] Write API tests asserting `GET /api/health`, `GET /api/patients`, `GET /api/patients/{id}`, create, update, and structured not-found errors.
- [ ] Run `cd backend && uv run pytest tests/test_health.py tests/test_patients.py -q`; verify collection/import failure before the application exists.
- [ ] Implement settings, database models, typed schemas, repositories, app factory, and patient routes with only behavior required by the tests.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 2: Deterministic demo-data lifecycle

**Files:**
- Create: `demo/patients.json`, `demo/labs.json`, `demo/clinical-notes.json`, `demo/insurance.json`, `demo/payer-rules.json`
- Create: `backend/app/services/demo.py`, `backend/app/api/demo.py`
- Test: `backend/tests/test_demo.py`

**Interfaces:**
- Produces: `DemoService.seed(reset: bool) -> DemoLoadResult`, `POST /api/demo/load`, and `POST /api/demo/reset`.

- [ ] Write a test that resets data twice, receives three patients both times, and observes no findings after reset.
- [ ] Run the target test and verify failure because reset routes do not exist.
- [ ] Add three fictional workflows and implement idempotent fixture import plus destructive local reset.
- [ ] Re-run the target test and the earlier backend suite.

### Task 3: AI provider abstraction and human review

**Files:**
- Create: `backend/app/ai/base.py`, `mock.py`, `openai_provider.py`, `anthropic_provider.py`, `factory.py`
- Create: `backend/app/services/reviews.py`, `backend/app/api/reviews.py`
- Create: `prompts/system.md`, `patient-review.md`, `structured-output.md`, `safety.md`
- Test: `backend/tests/test_reviews.py`, `backend/tests/test_mock_ai.py`

**Interfaces:**
- Produces: `AIProvider.review(context) -> list[FindingCreate]`; run, list, approve, reject, and edit REST operations.

- [ ] Write tests asserting mock findings validate, cite existing fixture sources, remain deterministic, and begin in `pending` state.
- [ ] Write API tests for review creation, approval, rejection, and editing, including invalid state errors.
- [ ] Run the target tests and verify missing-provider failures.
- [ ] Implement the provider contract, safe key-aware factory, deterministic scenarios, review service, and routes.
- [ ] Re-run all backend tests and confirm they pass.

### Task 4: Workflow frontend

**Files:**
- Create: `frontend/package.json`, Next.js/Tailwind/TypeScript configuration
- Create: `frontend/app/*` routes for dashboard, patients, review queue, settings, loading, and error states
- Create: `frontend/components/app-shell.tsx`, `stat-card.tsx`, `patient-table.tsx`, `ai-review-panel.tsx`, and UI primitives
- Create: `frontend/lib/api.ts`, `types.ts`, `utils.ts`
- Test: `frontend/components/ai-review-panel.test.tsx`

**Interfaces:**
- Consumes: FastAPI routes under `NEXT_PUBLIC_API_URL`.
- Produces: a desktop-first responsive shell and reusable AI review action panel.

- [ ] Configure Vitest and write a component test asserting AI labeling, evidence, confidence, and approve/edit/reject controls.
- [ ] Run `cd frontend && npm test -- --run`; verify failure before component implementation.
- [ ] Implement the shared visual system, navigation, dashboard, searchable patient list, full patient detail, queue, settings, and fetch states.
- [ ] Re-run component tests, `npm run lint`, and `npm run build`.

### Task 5: Developer experience, deployment, and documentation

**Files:**
- Create: `Makefile`, `.gitignore`, `docker-compose.yml`, `scripts/dev.sh`, `scripts/install.sh`
- Create: `frontend/.env.example`, `backend/.env.example`, `frontend/vercel.json`, `backend/render.yaml`, `backend/Procfile`
- Create: `AGENTS.md`, `TASKS.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, `shared/API.md`

**Interfaces:**
- Produces: `make install`, `make dev`, `make seed`, `make reset`, `make test`, `make lint`, `make format`, and `make build`.

- [ ] Add macOS-compatible scripts that preserve process exit codes and clean up both dev servers on interruption.
- [ ] Add environment examples with mock mode enabled and no secrets.
- [ ] Document exact setup, adaptation, test, demo, troubleshooting, Vercel, Railway, and Render steps.
- [ ] Confirm shell syntax with `bash -n scripts/*.sh` and check every documented command exists.

### Task 6: End-to-end verification

**Files:**
- Modify only files implicated by verification failures.

**Interfaces:**
- Consumes: all prior deliverables.
- Produces: fresh evidence for the final handoff.

- [ ] Run `make install`, `make reset`, `make test`, `make lint`, and `make build`.
- [ ] Start both services and verify browser-facing API requests use configured CORS and URL settings.
- [ ] Exercise Maya Thompson's reset → review → cited finding → edit/approve flow through REST calls.
- [ ] Compare the implementation line-by-line against the approved spec and repair material gaps.
