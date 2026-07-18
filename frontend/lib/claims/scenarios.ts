// Client-safe error-injection catalog. Pure transforms over Claim837P.
import type { Claim837P } from "./types";

export type Scenario = {
  id: string;
  label: string;
  description: string;
  expected: string[];
  apply: (c: Claim837P) => Claim837P;
};

function clone(c: Claim837P): Claim837P {
  return JSON.parse(JSON.stringify(c)) as Claim837P;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// SV102 is the full line charge; CLM02 must equal the sum of line charges.
function lineSum(c: Claim837P): number {
  return round2(c.service_lines.reduce((sum, l) => sum + l.charge, 0));
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const SCENARIOS: Scenario[] = [
  {
    id: "missing-subscriber-id",
    label: "Missing subscriber ID",
    description:
      "Blanks the subscriber member ID so the payer cannot identify the beneficiary.",
    expected: ["Rejection at 2010BA NM109"],
    apply: (c) => {
      const next = clone(c);
      next.subscriber.member_id = "";
      return next;
    },
  },
  {
    id: "invalid-pos",
    label: "Invalid place of service",
    description:
      "Sets place of service to 21 (Inpatient Hospital) on an office claim.",
    expected: ["POS / setting mismatch"],
    apply: (c) => {
      const next = clone(c);
      next.place_of_service = "21";
      return next;
    },
  },
  {
    id: "missing-rendering-npi",
    label: "Missing rendering NPI",
    description: "Removes the rendering provider's NPI from loop 2310B.",
    expected: ["Rejection at 2310B NM109"],
    apply: (c) => {
      const next = clone(c);
      next.rendering_provider.npi = "";
      return next;
    },
  },
  {
    id: "unbalanced-total",
    label: "Unbalanced claim total",
    description:
      "Inflates the claim total charge by $50 without touching the service lines.",
    expected: ["CLM02 ≠ Σ SV102"],
    apply: (c) => {
      const next = clone(c);
      next.total_charge = round2(next.total_charge + 50);
      return next;
    },
  },
  {
    id: "invalid-dx-pointer",
    label: "Invalid diagnosis pointer",
    description:
      "Points the first service line at diagnosis K, past the end of the diagnosis list.",
    expected: ["Invalid SV107 pointer"],
    apply: (c) => {
      const next = clone(c);
      if (next.service_lines[0]) {
        next.service_lines[0].diagnosis_pointers = [11];
      }
      return next;
    },
  },
  {
    id: "dos-outside-encounter",
    label: "DOS outside encounter",
    description:
      "Shifts the first line's date of service two weeks after the documented visit.",
    expected: ["DOS outside encounter period"],
    apply: (c) => {
      const next = clone(c);
      const line = next.service_lines[0];
      if (line) {
        line.dos_from = shiftDate(line.dos_from, 14);
        if (line.dos_to) line.dos_to = shiftDate(line.dos_to, 14);
      }
      return next;
    },
  },
  {
    id: "duplicate-line",
    label: "Duplicate service line",
    description:
      "Repeats the last service line with the same CPT and date of service.",
    expected: ["Duplicate 2400 line"],
    apply: (c) => {
      const next = clone(c);
      const last = next.service_lines[next.service_lines.length - 1];
      if (last) {
        const copy = JSON.parse(JSON.stringify(last)) as typeof last;
        copy.line_number = next.service_lines.length + 1;
        next.service_lines.push(copy);
        next.total_charge = lineSum(next);
      }
      return next;
    },
  },
  {
    id: "unsupported-procedure",
    label: "Undocumented procedure",
    description:
      "Adds an arthrocentesis line (20610) that appears nowhere in the note or transcript.",
    expected: ["Clinical layer — no documentation of joint injection"],
    apply: (c) => {
      const next = clone(c);
      const first = next.service_lines[0];
      next.service_lines.push({
        line_number: next.service_lines.length + 1,
        cpt: "20610",
        modifiers: [],
        description: "Arthrocentesis, major joint",
        charge: 95,
        units: 1,
        dos_from: first ? first.dos_from : "",
        diagnosis_pointers: [1],
      });
      next.total_charge = round2(next.total_charge + 95);
      return next;
    },
  },
  {
    id: "unsupported-diagnosis",
    label: "Undocumented diagnosis",
    description:
      "Adds CKD stage 3 (N18.3) to the diagnosis list and points line 1 at it.",
    expected: ["Clinical layer — CKD not documented"],
    apply: (c) => {
      const next = clone(c);
      next.diagnoses.push({
        code: "N18.3",
        description: "Chronic kidney disease, stage 3",
      });
      const line = next.service_lines[0];
      if (line) {
        line.diagnosis_pointers = [
          ...line.diagnosis_pointers,
          next.diagnoses.length,
        ];
      }
      return next;
    },
  },
  {
    id: "upcoded-em",
    label: "Upcoded E/M level",
    description:
      "Raises the visit to a level-5 E/M (99205) beyond the documented time and complexity.",
    expected: ["Clinical layer — E/M level unsupported"],
    apply: (c) => {
      const next = clone(c);
      const line = next.service_lines[0];
      if (line) {
        const delta = round2(220 - line.charge);
        line.cpt = "99205";
        line.description = "Office visit, new patient, level 5";
        line.charge = 220;
        next.total_charge = round2(next.total_charge + delta);
      }
      return next;
    },
  },
];

export function findScenario(id: string | null): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
