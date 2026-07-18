"use client";
import { useState } from "react";
import { FlaskConical, RotateCcw, Syringe } from "lucide-react";
import { SCENARIOS } from "@/lib/claims/scenarios";
import { Badge, Button, Card } from "@/components/ui";

export function ScenarioBar({
  activeScenario,
  disabled,
  onInject,
  onReset,
}: {
  activeScenario: string | null;
  disabled: boolean;
  onInject: (scenarioId: string) => void;
  onReset: () => void;
}) {
  const [selected, setSelected] = useState(SCENARIOS[0].id);
  const scenario = SCENARIOS.find((s) => s.id === selected) ?? SCENARIOS[0];
  const active = SCENARIOS.find((s) => s.id === activeScenario);
  return (
    <Card className="border-dashed p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <p className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-700">
          <FlaskConical size={16} className="text-teal-700" />
          Error injection
        </p>
        <select
          aria-label="Select error scenario"
          className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm lg:w-64"
          value={selected}
          disabled={disabled}
          onChange={(e) => setSelected(e.target.value)}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onInject(scenario.id)}
          >
            <Syringe size={15} />
            Inject
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={onReset}>
            <RotateCcw size={15} />
            Reset to draft
          </Button>
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500">{scenario.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">
          Expected failure:
        </span>
        {scenario.expected.map((e) => (
          <Badge key={e} tone="amber">
            {e}
          </Badge>
        ))}
        {active && (
          <span className="ml-auto">
            <Badge tone="rose">Injected: {active.label}</Badge>
          </span>
        )}
      </div>
    </Card>
  );
}
