// Client wrapper for the claims API routes (same-origin Next.js handlers).
import type {
  Claim837P,
  ClaimDetail,
  ClaimFinding,
  ClaimImportResult,
  ClaimSummary,
  JobEvent,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error?.message || `Request failed (${response.status})`,
    );
  }
  return response.json();
}

export const claimsApi = {
  list: () => request<ClaimSummary[]>("/api/claims"),
  get: (id: string) => request<ClaimDetail>(`/api/claims/${id}`),
  save: (id: string, claim: Claim837P, scenario: string | null) =>
    request<ClaimDetail>(`/api/claims/${id}`, {
      method: "PUT",
      body: JSON.stringify({ claim, scenario }),
    }),
  reset: (id: string) =>
    request<ClaimDetail>(`/api/claims/${id}/reset`, { method: "POST" }),
  // Multipart upload: bypasses the JSON `request` helper (no JSON content-type).
  importPdf: async (file: File): Promise<ClaimImportResult> => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/claims/import", {
      method: "POST",
      body,
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload.error?.message || `Import failed (${response.status})`,
      );
    }
    return response.json();
  },
  validate: (id: string) =>
    request<{ job_id: string }>(`/api/claims/${id}/validate`, {
      method: "POST",
    }),
  approveFinding: (findingId: string) =>
    request<ClaimFinding>(`/api/claims/findings/${findingId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    }),
  rejectFinding: (findingId: string, review_note: string) =>
    request<ClaimFinding>(`/api/claims/findings/${findingId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "reject", review_note }),
    }),
  editFinding: (findingId: string, recommended_fix: string) =>
    request<ClaimFinding>(`/api/claims/findings/${findingId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "edit", recommended_fix }),
    }),
};

// Subscribes to a validation job's SSE stream. Returns an unsubscribe fn.
// The server replays missed events on connect and closes after done/error.
export function subscribeToJob(
  jobId: string,
  onEvent: (event: JobEvent) => void,
): () => void {
  const source = new EventSource(`/api/validation/jobs/${jobId}/stream`);
  source.onmessage = (message) => {
    let event: JobEvent;
    try {
      event = JSON.parse(message.data) as JobEvent;
    } catch {
      return;
    }
    onEvent(event);
    if (event.type === "done" || event.type === "error") {
      source.close();
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects; the server replays events on reconnect.
    // If the stream is already finished the server closes it immediately.
  };
  return () => source.close();
}
