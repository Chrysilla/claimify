import type { Finding, Patient } from "./types";
// The route handlers live on this same Next.js server. In the browser we use a
// same-origin relative URL; server components need an absolute base (server-side
// fetch can't resolve relative paths), derived from the host/Vercel env.
function baseUrl(): string {
  if (typeof window !== "undefined") return "";
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    `http://localhost:${process.env.PORT || 3000}`
  );
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
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
export const api = {
  patients: () => request<Patient[]>("/api/patients"),
  patient: (id: string) => request<Patient>(`/api/patients/${id}`),
  findings: (patientId?: string) =>
    request<Finding[]>(
      `/api/findings${patientId ? `?patient_id=${patientId}` : ""}`,
    ),
  review: (id: string) =>
    request<Finding[]>(`/api/patients/${id}/review`, { method: "POST" }),
  approve: (id: string) =>
    request<Finding>(`/api/findings/${id}/approve`, { method: "POST" }),
  reject: (id: string, reason: string) =>
    request<Finding>(`/api/findings/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  edit: (id: string, recommended_action: string) =>
    request<Finding>(`/api/findings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ recommended_action }),
    }),
};
