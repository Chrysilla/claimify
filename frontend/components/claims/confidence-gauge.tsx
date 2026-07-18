"use client";
import type { ConfidenceReport } from "@/lib/claims/types";
import { cn } from "@/lib/utils";

const ARC_LENGTH = Math.PI * 75;

function tone(pct: number) {
  if (pct >= 70)
    return { stroke: "#0f766e", text: "text-teal-700", bar: "bg-teal-600" };
  if (pct >= 40)
    return { stroke: "#d97706", text: "text-amber-600", bar: "bg-amber-500" };
  return { stroke: "#e11d48", text: "text-rose-600", bar: "bg-rose-600" };
}

export function ConfidenceGauge({
  confidence,
}: {
  confidence: ConfidenceReport;
}) {
  const pct = Math.round(confidence.score * 100);
  const colors = tone(pct);
  const filled = Math.max(0.02, confidence.score) * ARC_LENGTH;
  return (
    <div>
      <div className="flex flex-col items-center">
        <svg
          viewBox="0 0 180 105"
          className="w-52"
          role="img"
          aria-label={`Probability of Medicare acceptance: ${pct} percent`}
        >
          <path
            d="M 15 95 A 75 75 0 0 1 165 95"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 15 95 A 75 75 0 0 1 165 95"
            fill="none"
            stroke={colors.stroke}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${ARC_LENGTH}`}
            className="transition-all duration-700"
          />
          <text
            x="90"
            y="78"
            textAnchor="middle"
            className={cn("fill-current text-3xl font-bold", colors.text)}
          >
            {pct}%
          </text>
          <text
            x="90"
            y="97"
            textAnchor="middle"
            className="fill-slate-500 text-[9px] font-semibold uppercase tracking-wider"
          >
            Medicare acceptance
          </text>
        </svg>
      </div>
      <div className="mt-3 space-y-2">
        {confidence.breakdown.map((b) => {
          const bPct = Math.round(b.score * 100);
          return (
            <div key={b.category}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">
                  {b.category}
                </span>
                <span className="font-mono text-slate-500">{bPct}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-500",
                    tone(bPct).bar,
                  )}
                  style={{ width: `${bPct}%` }}
                />
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{b.note}</p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-6 text-slate-600">
        {confidence.rationale}
      </p>
    </div>
  );
}
