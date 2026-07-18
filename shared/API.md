# API contract

The API is served by Next.js route handlers under `frontend/app/api/` (same
origin as the UI, all `runtime = "nodejs"`). Errors use the envelope
`{ "error": { "code": string, "message": string, "details"?: object } }`.

## Claims (837P validation)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/claims` | List claim summaries |
| `GET` | `/api/claims/{id}` | Claim detail (claim, encounter, latest job, findings) |
| `POST` | `/api/claims/import` | Extract a `Claim837P` from an uploaded CMS-1500 / 837P PDF (`multipart/form-data`, field `file`) → `{ claim, engine, warnings }` |
| `PUT` | `/api/claims/{id}` | Save `{ claim, scenario }` |
| `POST` | `/api/claims/{id}/validate` | Start a validation job → `{ job_id }` |
| `POST` | `/api/claims/{id}/reset` | Restore the pristine generated claim |
| `GET` | `/api/validation/jobs/{jobId}/stream` | SSE stream of `JobEvent`s (with replay) |
| `PATCH` | `/api/claims/findings/{findingId}` | Review a finding (approve / edit / reject) |

## Patient documentation review

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/patients` | List patients |
| `GET` | `/api/patients/{id}` | Patient detail |
| `POST` | `/api/patients/{id}/review` | Run the (mock) review → findings |
| `GET` | `/api/findings?patient_id=` | List findings |
| `PATCH` | `/api/findings/{id}` | Edit a pending finding's recommended action |
| `POST` | `/api/findings/{id}/approve` | Approve |
| `POST` | `/api/findings/{id}/reject` | Reject with a reason |

Findings stay `pending` until a human approves or rejects them.

Client code consumes the typed helpers in `frontend/lib/api.ts` (patients) and
`frontend/lib/claims/client-api.ts` (claims) rather than constructing URLs in
components.
