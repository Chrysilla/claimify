# CareFlow healthcare AI starter

CareFlow is a polished full-stack starter for one-day AI healthcare hackathons. It provides a credible clinical review workflow, fictional patient data, provider-neutral AI, explicit human approval, and deployment-ready frontend/backend projects—without requiring a paid API or cloud database.

The included demo catches a likely lumbar MRI authorization issue before submission: the clinical note mentions conservative treatment but omits the duration required by a fictional payer rule.

> Demo only. All people, plans, identifiers, notes, and rules are fictional. This software is not a medical device and does not provide clinical advice.

## Architecture

```text
Next.js workflow UI :3000
          │ REST
FastAPI + Pydantic :8000
          ├── SQLAlchemy → SQLite (default) / Postgres
          ├── mock / OpenAI / Anthropic provider interface
          └── demo/*.json + prompts/*.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for boundaries and data flow.

## Prerequisites

- macOS or Linux
- Node.js 22+
- npm 10+
- [uv](https://docs.astral.sh/uv/) 0.11+
- GNU or BSD Make

## Start locally

```bash
make install
make reset
make dev
```

Open [http://localhost:3000](http://localhost:3000). FastAPI docs are at [http://localhost:8000/docs](http://localhost:8000/docs). Stop both servers with `Ctrl-C`.

The defaults require no `.env` files. To customize them:

```bash
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./careflow.db` | SQLAlchemy database URL; use a Supabase Postgres URL later |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed browser origin |
| `USE_MOCK_AI` | `true` | Forces deterministic no-key behavior |
| `AI_PROVIDER` | `mock` | `mock`, `openai`, or `anthropic` |
| `AI_MODEL` | empty | Provider model selected for live mode |
| `OPENAI_API_KEY` | empty | Optional live OpenAI credential |
| `ANTHROPIC_API_KEY` | empty | Optional live Anthropic credential |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Browser-visible API base URL |

If a selected live provider has no credential, the backend safely falls back to mock mode.

## Commands

| Command | Action |
|---|---|
| `make install` | Install uv and npm dependencies |
| `make dev` | Start frontend and backend together |
| `make seed` / `make reset` | Restore canonical fictional demo records and clear findings |
| `make test` | Run backend and frontend tests |
| `make lint` | Run Ruff and ESLint |
| `make format` | Format Python and web files |
| `make build` | Compile the backend and build Next.js for production |

## Two-minute walkthrough

1. `make reset`, then open the dashboard.
2. Open high-urgency patient **Maya Thompson**.
3. Show the source note and insurance rule.
4. Run the AI review. It identifies missing conservative-treatment dates and cites both supplied sources.
5. Edit the action, approve it, and emphasize that the finding stayed pending until a human decision.

The full talk track is in [docs/DEMO.md](docs/DEMO.md).

## Tests

```bash
make test
make lint
make build
```

The practical suite covers health, patient retrieval and mutation, reset determinism, structured mock results, edit/approve/reject state, and the reusable frontend AI review panel.

## Deployment

### Frontend on Vercel

Import the repository, choose `frontend` as the root directory, and set `NEXT_PUBLIC_API_URL` to the deployed API URL. The included `vercel.json` selects Next.js.

### Backend on Railway

Deploy from the repository using `railway.json`. Set `FRONTEND_ORIGIN`, `USE_MOCK_AI`, and optionally `DATABASE_URL`. SQLite is suitable for a disposable demo; use hosted Postgres for persistent deployments.

### Backend on Render

Create a Blueprint from `backend/render.yaml`, or use build command `pip install uv && uv sync --frozen --no-dev` and start command `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT` from the backend directory.

## Adapt to the final hackathon idea

1. Keep the human-review lifecycle and replace the domain copy in the frontend.
2. Replace only fictional fixtures in `demo/`; preserve stable source IDs.
3. Update `prompts/` with workflow-specific rules and evaluate them against known cases.
4. Adjust Pydantic finding fields only when the new workflow needs different reviewer decisions.
5. Extend the mock provider first so the pitch remains reliable, then enable a live provider.

## Troubleshooting

- **Frontend says it cannot load:** confirm `curl http://localhost:8000/api/health` works and `NEXT_PUBLIC_API_URL` is correct.
- **Browser shows a CORS error:** set `FRONTEND_ORIGIN` to the exact frontend origin and restart the API.
- **Demo state is messy:** run `make reset`; this intentionally clears local findings.
- **AI does not call a live model:** set `USE_MOCK_AI=false`, select `AI_PROVIDER`, provide its API key and model, then restart.
- **Port already in use:** stop the existing process on ports 3000/8000 or run each project independently with a different port.
- **SQLite cannot be written in production:** use a persistent disk or set `DATABASE_URL` to Postgres.

Agent contributors should read [AGENTS.md](AGENTS.md) before modifying the golden demo path.
