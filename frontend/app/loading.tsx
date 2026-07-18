export default function Loading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-10 w-64 rounded bg-slate-200" />
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((x) => (
          <div key={x} className="h-32 rounded-xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
