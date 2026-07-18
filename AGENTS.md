# CareFlow agent guide

CareFlow is a reusable AI healthcare workflow starter. It demonstrates pre-submission documentation review using fully fictional records and deterministic mock AI.

## Architecture

- `frontend/`: Next.js App Router UI. API access belongs in `frontend/lib/api.ts`; shared contracts belong in `frontend/lib/types.ts`.
- `backend/`: FastAPI API, Pydantic contracts, SQLAlchemy persistence, services, and provider-neutral AI adapters.
- `demo/`: canonical fictional fixtures loaded by `DemoService`.
- `prompts/`: model instructions. Never weaken source-grounding or human-review requirements.

## Run and validate

Run `make install`, `make reset`, and `make dev`. Validate behavior with `make test`, `make lint`, and `make build`. API docs are at `http://localhost:8000/docs`.

## Conventions

- Keep TypeScript strict and API responses typed.
- Keep FastAPI routes thin; workflow logic belongs in services and persistence logic in repositories.
- Use Pydantic to validate all provider output before persistence.
- Preserve structured error envelopes: `{ "error": { "code", "message", "details"? } }`.
- Prefer small, reviewable changes. Do not introduce queues, microservices, code generation, or additional infrastructure without a demonstrated need.
- Preserve no-key mock mode and deterministic reset behavior.
- Never add real patient data or secrets.
- Update tests and documentation when behavior changes.

## Protect the demo

Maya Thompson is the two-minute golden path. Keep the note ID, payer-rule ID, deterministic finding, and reset → run review → edit/approve sequence working. Run `make reset` before presentations.
