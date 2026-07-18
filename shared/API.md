# API contract

The live OpenAPI contract is served at `/openapi.json`; interactive docs are at `/docs`.

Primary resources are `/api/patients` and `/api/findings`. Findings remain `pending` until a human calls approve or reject. Errors use `{ "error": { "code": string, "message": string, "details"?: object } }`.

Frontend code should consume the typed helpers in `frontend/lib/api.ts` rather than constructing URLs in components.
