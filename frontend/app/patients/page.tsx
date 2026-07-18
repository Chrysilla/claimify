import { PatientTable } from "@/components/patient-table";
import { api } from "@/lib/api";
export default async function Patients() {
  const patients = await api.patients();
  return (
    <div className="mx-auto max-w-7xl">
      <h1 className="text-3xl font-bold">Patients</h1>
      <p className="mb-6 mt-2 text-slate-600">
        Find and manage active clinical workflows.
      </p>
      <PatientTable patients={patients} />
    </div>
  );
}
