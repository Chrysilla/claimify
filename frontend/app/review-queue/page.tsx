import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Card } from "@/components/ui";
export default async function Queue() {
  const [findings, patients] = await Promise.all([
    api.findings(),
    api.patients(),
  ]);
  const names = Object.fromEntries(patients.map((p) => [p.id, p.name]));
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold">Review Queue</h1>
      <p className="mb-6 mt-2 text-slate-600">
        AI findings awaiting or recording human decisions.
      </p>
      <Card className="divide-y divide-slate-100">
        {findings.map((f) => (
          <Link
            href={`/patients/${f.patient_id}`}
            key={f.id}
            className="flex items-center justify-between p-5 hover:bg-slate-50"
          >
            <div>
              <p className="font-semibold">{f.issue}</p>
              <p className="mt-1 text-sm text-slate-500">
                {names[f.patient_id]} · {Math.round(f.confidence * 100)}%
                confidence
              </p>
            </div>
            <Badge
              tone={
                f.status === "approved"
                  ? "teal"
                  : f.status === "rejected"
                    ? "rose"
                    : "blue"
              }
            >
              {f.status}
            </Badge>
          </Link>
        ))}
        {!findings.length && (
          <div className="p-12 text-center text-sm text-slate-500">
            No findings in the queue. Open a patient and run an AI review.
          </div>
        )}
      </Card>
    </div>
  );
}
