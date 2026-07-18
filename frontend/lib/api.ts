import type { Finding, Patient } from "./types";
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
async function request<T>(path:string, init?:RequestInit):Promise<T>{
  const response=await fetch(`${API_URL}${path}`,{...init,headers:{"Content-Type":"application/json",...init?.headers},cache:"no-store"});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error?.message || `Request failed (${response.status})`)}
  return response.json();
}
export const api={patients:()=>request<Patient[]>("/api/patients"),patient:(id:string)=>request<Patient>(`/api/patients/${id}`),findings:(patientId?:string)=>request<Finding[]>(`/api/findings${patientId?`?patient_id=${patientId}`:""}`),review:(id:string)=>request<Finding[]>(`/api/patients/${id}/review`,{method:"POST"}),approve:(id:string)=>request<Finding>(`/api/findings/${id}/approve`,{method:"POST"}),reject:(id:string,reason:string)=>request<Finding>(`/api/findings/${id}/reject`,{method:"POST",body:JSON.stringify({reason})}),edit:(id:string,recommended_action:string)=>request<Finding>(`/api/findings/${id}`,{method:"PATCH",body:JSON.stringify({recommended_action})})};

