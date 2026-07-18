# Architecture

The Next.js frontend is an independently deployable workflow client. Server components load dashboards and records; client components own search, filters, review execution, and reviewer decisions.

FastAPI owns the REST boundary and OpenAPI documentation. Pydantic validates requests, responses, and AI findings. SQLAlchemy models use JSON fields for adaptable clinical fixture data and ordinary columns for searchable workflow state. `DATABASE_URL` defaults to SQLite and can target Supabase Postgres later.

The AI factory selects mock, OpenAI, or Anthropic without exposing provider details to review code. Missing credentials safely fall back to deterministic mock mode. Prompts prohibit invented facts, rules, or citations.

`demo/*.json` is the canonical demo source. Reset deletes local patients and findings, reloads three fictional patients, and returns the workspace to a known state.

Human review is explicit:

```text
source records + payer rules -> AI provider -> validated pending finding
                                           -> human edit/approve/reject
```

The frontend deploys to Vercel. The API deploys to Railway or Render. Use managed Postgres only when persistence across backend deployments becomes necessary.
