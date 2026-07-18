"use client";
import {
  Building2,
  FileDigit,
  HeartPulse,
  Landmark,
  ListOrdered,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import type { Claim837P } from "@/lib/claims/types";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const POS_OPTIONS = [
  { code: "11", label: "11 — Office" },
  { code: "12", label: "12 — Home" },
  { code: "21", label: "21 — Inpatient Hospital" },
  { code: "22", label: "22 — On-Campus Outpatient Hospital" },
  { code: "31", label: "31 — Skilled Nursing Facility" },
  { code: "32", label: "32 — Nursing Facility" },
  { code: "49", label: "49 — Independent Clinic" },
];

const FREQUENCY_OPTIONS = [
  { code: "1", label: "1 — Original claim" },
  { code: "7", label: "7 — Replacement of prior claim" },
  { code: "8", label: "8 — Void / cancel of prior claim" },
];

export const dxLetter = (n: number) => String.fromCharCode(64 + n);

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computedLineTotal(claim: Claim837P) {
  return round2(claim.service_lines.reduce((s, l) => s + (l.charge || 0), 0));
}

function usd(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SectionCard({
  title,
  loop,
  box,
  icon: Icon,
  children,
}: {
  title: string;
  loop: string;
  box?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon size={17} className="text-teal-700" />
          {title}
        </h3>
        <div className="flex items-center gap-1.5">
          {box && (
            <span
              className="rounded bg-teal-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-teal-700"
              title={`CMS-1500 Box ${box}`}
            >
              Box {box}
            </span>
          )}
          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
            {loop}
          </span>
        </div>
      </div>
      {children}
    </Card>
  );
}

const inputCls =
  "h-9 w-full rounded-lg border border-slate-300 px-2.5 text-sm disabled:bg-slate-50 disabled:text-slate-400";

// A left-hand chip carrying the CMS-1500 box number for one-to-one mapping with
// the paper form. Pass box="—" (with boxNote) for fields whose 837P loop has no
// numbered CMS-1500 box — the chip still renders (muted) so inputs stay aligned.
function BoxChip({ box, boxNote }: { box: string; boxNote?: string }) {
  const numbered = box !== "—";
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center self-end rounded-lg font-mono text-[11px] font-bold",
        numbered ? "bg-slate-100 text-slate-600" : "bg-slate-50 text-slate-300",
      )}
      title={boxNote ?? (numbered ? `CMS-1500 Box ${box}` : "No CMS-1500 box")}
    >
      {box}
    </span>
  );
}

function Field({
  label,
  box,
  boxNote,
  className,
  children,
}: {
  label: string;
  box?: string;
  boxNote?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <div className="flex items-end gap-2">
        {box !== undefined && <BoxChip box={box} boxNote={boxNote} />}
        <div className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold text-slate-500">
            {label}
          </span>
          {children}
        </div>
      </div>
    </label>
  );
}

export function ClaimForm({
  claim,
  onChange,
  disabled,
}: {
  claim: Claim837P;
  onChange: (next: Claim837P) => void;
  disabled: boolean;
}) {
  function mutate(mutator: (draft: Claim837P) => void) {
    const next = structuredClone(claim);
    mutator(next);
    onChange(next);
  }
  const lineTotal = computedLineTotal(claim);
  const mismatch = Math.abs(lineTotal - claim.total_charge) > 0.005;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Billing Provider"
        loop="Loop 2010AA"
        icon={Building2}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Organization name" box="33" className="md:col-span-2">
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.billing_provider.organization_name}
              onChange={(e) =>
                mutate((d) => {
                  d.billing_provider.organization_name = e.target.value;
                })
              }
            />
          </Field>
          <Field label="NPI (NM109)" box="33a">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.billing_provider.npi}
              onChange={(e) =>
                mutate((d) => {
                  d.billing_provider.npi = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Federal Tax ID (REF*EI)" box="25">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.billing_provider.tin}
              onChange={(e) =>
                mutate((d) => {
                  d.billing_provider.tin = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Taxonomy (PRV03)" box="33b">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.billing_provider.taxonomy}
              onChange={(e) =>
                mutate((d) => {
                  d.billing_provider.taxonomy = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Address line 1" box="33">
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.billing_provider.address.line1}
              onChange={(e) =>
                mutate((d) => {
                  d.billing_provider.address.line1 = e.target.value;
                })
              }
            />
          </Field>
          <Field label="City" box="33">
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.billing_provider.address.city}
              onChange={(e) =>
                mutate((d) => {
                  d.billing_provider.address.city = e.target.value;
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State" box="33">
              <input
                className={inputCls}
                disabled={disabled}
                value={claim.billing_provider.address.state}
                onChange={(e) =>
                  mutate((d) => {
                    d.billing_provider.address.state = e.target.value;
                  })
                }
              />
            </Field>
            <Field label="ZIP" box="33">
              <input
                className={cn(inputCls, "font-mono")}
                disabled={disabled}
                value={claim.billing_provider.address.zip}
                onChange={(e) =>
                  mutate((d) => {
                    d.billing_provider.address.zip = e.target.value;
                  })
                }
              />
            </Field>
          </div>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Rendering Provider — Loop 2310B
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="NPI (NM109)" box="24J">
              <input
                className={cn(inputCls, "font-mono")}
                disabled={disabled}
                value={claim.rendering_provider.npi}
                onChange={(e) =>
                  mutate((d) => {
                    d.rendering_provider.npi = e.target.value;
                  })
                }
              />
            </Field>
            <Field
              label="First name"
              box="—"
              boxNote="No CMS-1500 box — 837P Loop 2310B (rendering provider)"
            >
              <input
                className={inputCls}
                disabled={disabled}
                value={claim.rendering_provider.first_name}
                onChange={(e) =>
                  mutate((d) => {
                    d.rendering_provider.first_name = e.target.value;
                  })
                }
              />
            </Field>
            <Field
              label="Last name"
              box="—"
              boxNote="No CMS-1500 box — 837P Loop 2310B (rendering provider)"
            >
              <input
                className={inputCls}
                disabled={disabled}
                value={claim.rendering_provider.last_name}
                onChange={(e) =>
                  mutate((d) => {
                    d.rendering_provider.last_name = e.target.value;
                  })
                }
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Subscriber" loop="Loop 2010BA" icon={UserRound}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Insured's ID number / MBI (NM109)" box="1a">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.subscriber.member_id}
              onChange={(e) =>
                mutate((d) => {
                  d.subscriber.member_id = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Insured's group number" box="11">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.subscriber.group_number}
              onChange={(e) =>
                mutate((d) => {
                  d.subscriber.group_number = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Patient first name" box="2">
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.subscriber.first_name}
              onChange={(e) =>
                mutate((d) => {
                  d.subscriber.first_name = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Patient last name" box="2">
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.subscriber.last_name}
              onChange={(e) =>
                mutate((d) => {
                  d.subscriber.last_name = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Date of birth" box="3">
            <input
              type="date"
              className={inputCls}
              disabled={disabled}
              value={claim.subscriber.dob}
              onChange={(e) =>
                mutate((d) => {
                  d.subscriber.dob = e.target.value;
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sex" box="3">
              <select
                className={inputCls}
                disabled={disabled}
                value={claim.subscriber.gender}
                onChange={(e) =>
                  mutate((d) => {
                    d.subscriber.gender = e.target.value as "M" | "F" | "U";
                  })
                }
              >
                <option value="M">M</option>
                <option value="F">F</option>
                <option value="U">U</option>
              </select>
            </Field>
            <Field label="Relationship" box="6">
              <input
                className={inputCls}
                disabled
                readOnly
                value="18 — Self"
              />
            </Field>
          </div>
          <Field label="City" box="5">
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.subscriber.address.city}
              onChange={(e) =>
                mutate((d) => {
                  d.subscriber.address.city = e.target.value;
                })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State" box="5">
              <input
                className={inputCls}
                disabled={disabled}
                value={claim.subscriber.address.state}
                onChange={(e) =>
                  mutate((d) => {
                    d.subscriber.address.state = e.target.value;
                  })
                }
              />
            </Field>
            <Field label="ZIP" box="5">
              <input
                className={cn(inputCls, "font-mono")}
                disabled={disabled}
                value={claim.subscriber.address.zip}
                onChange={(e) =>
                  mutate((d) => {
                    d.subscriber.address.zip = e.target.value;
                  })
                }
              />
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Payer" loop="Loop 2010BB" icon={Landmark}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field
            label="Payer ID (NM109)"
            box="—"
            boxNote="No CMS-1500 box — 837P Loop 2010BB (payer / carrier block)"
          >
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.payer.payer_id}
              onChange={(e) =>
                mutate((d) => {
                  d.payer.payer_id = e.target.value;
                })
              }
            />
          </Field>
          <Field
            label="Payer name"
            box="—"
            boxNote="No CMS-1500 box — carrier name/address block (top of form)"
          >
            <input
              className={inputCls}
              disabled={disabled}
              value={claim.payer.name}
              onChange={(e) =>
                mutate((d) => {
                  d.payer.name = e.target.value;
                })
              }
            />
          </Field>
          <Field label="Insurance type / filing indicator (SBR09)" box="1">
            <input
              className={cn(inputCls, "font-mono")}
              disabled
              readOnly
              value={`${claim.payer.claim_filing_indicator} — Medicare Part B`}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Claim Information" loop="Loop 2300" icon={FileDigit}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Patient account number (CLM01)" box="26">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.patient_control_number}
              onChange={(e) =>
                mutate((d) => {
                  d.patient_control_number = e.target.value;
                })
              }
            />
          </Field>
          <Field
            label="Place of service — default (CLM05-1)"
            box="24B"
            boxNote="CMS-1500 Box 24B is per service line; this is the claim default applied to each line"
          >
            <select
              className={inputCls}
              disabled={disabled}
              value={claim.place_of_service}
              onChange={(e) =>
                mutate((d) => {
                  d.place_of_service = e.target.value;
                })
              }
            >
              {!POS_OPTIONS.some((o) => o.code === claim.place_of_service) && (
                <option value={claim.place_of_service}>
                  {claim.place_of_service || "— select —"}
                </option>
              )}
              {POS_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resubmission code (CLM05-3)" box="22">
            <select
              className={inputCls}
              disabled={disabled}
              value={claim.frequency_code}
              onChange={(e) =>
                mutate((d) => {
                  d.frequency_code = e.target.value;
                })
              }
            >
              {FREQUENCY_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {(claim.frequency_code === "7" || claim.frequency_code === "8") && (
            <Field label="Original ref. # (REF*F8)" box="22">
              <input
                className={cn(inputCls, "font-mono")}
                disabled={disabled}
                value={claim.original_claim_number ?? ""}
                onChange={(e) =>
                  mutate((d) => {
                    d.original_claim_number = e.target.value;
                  })
                }
              />
            </Field>
          )}
          <Field label="Prior authorization (REF*G1)" box="23">
            <input
              className={cn(inputCls, "font-mono")}
              disabled={disabled}
              value={claim.prior_authorization ?? ""}
              onChange={(e) =>
                mutate((d) => {
                  d.prior_authorization = e.target.value || undefined;
                })
              }
            />
          </Field>
          <Field label="Date of current illness / onset" box="14">
            <input
              type="date"
              className={inputCls}
              disabled={disabled}
              value={claim.onset_date ?? ""}
              onChange={(e) =>
                mutate((d) => {
                  d.onset_date = e.target.value || undefined;
                })
              }
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Diagnosis Codes"
        loop="HI segment"
        box="21"
        icon={HeartPulse}
      >
        <div className="space-y-2">
          {claim.diagnoses.map((dx, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 font-mono text-xs font-bold text-slate-600">
                {dxLetter(i + 1)}
              </span>
              <input
                aria-label={`Diagnosis ${dxLetter(i + 1)} code`}
                className={cn(inputCls, "w-28 shrink-0 font-mono")}
                placeholder="ICD-10"
                disabled={disabled}
                value={dx.code}
                onChange={(e) =>
                  mutate((d) => {
                    d.diagnoses[i].code = e.target.value.toUpperCase();
                  })
                }
              />
              <input
                aria-label={`Diagnosis ${dxLetter(i + 1)} description`}
                className={inputCls}
                placeholder="Description"
                disabled={disabled}
                value={dx.description}
                onChange={(e) =>
                  mutate((d) => {
                    d.diagnoses[i].description = e.target.value;
                  })
                }
              />
              <button
                type="button"
                aria-label={`Remove diagnosis ${dxLetter(i + 1)}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                disabled={disabled}
                onClick={() =>
                  mutate((d) => {
                    d.diagnoses.splice(i, 1);
                    // Repair pointers: drop references to the removed dx, shift the rest.
                    for (const line of d.service_lines) {
                      line.diagnosis_pointers = line.diagnosis_pointers
                        .filter((p) => p !== i + 1)
                        .map((p) => (p > i + 1 ? p - 1 : p));
                    }
                  })
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {claim.diagnoses.length < 12 && (
          <Button
            variant="secondary"
            className="mt-3"
            disabled={disabled}
            onClick={() =>
              mutate((d) => {
                d.diagnoses.push({ code: "", description: "" });
              })
            }
          >
            <Plus size={15} />
            Add diagnosis
          </Button>
        )}
      </SectionCard>

      <SectionCard
        title="Service Lines"
        loop="Loop 2400"
        box="24"
        icon={ListOrdered}
      >
        <div className="space-y-4">
          {claim.service_lines.map((line, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-500">
                  LX {String(i + 1).padStart(2, "0")}
                </span>
                <button
                  type="button"
                  aria-label={`Remove service line ${i + 1}`}
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  disabled={disabled}
                  onClick={() =>
                    mutate((d) => {
                      d.service_lines.splice(i, 1);
                      d.service_lines.forEach((l, idx) => {
                        l.line_number = idx + 1;
                      });
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="CPT / HCPCS (SV101)" box="24D">
                  <input
                    className={cn(inputCls, "font-mono")}
                    disabled={disabled}
                    value={line.cpt}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].cpt = e.target.value.toUpperCase();
                      })
                    }
                  />
                </Field>
                <Field label="Modifiers" box="24D">
                  <input
                    className={cn(inputCls, "font-mono")}
                    placeholder="25, 59"
                    disabled={disabled}
                    value={line.modifiers.join(", ")}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].modifiers = e.target.value
                          .split(",")
                          .map((m) => m.trim().toUpperCase())
                          .filter(Boolean);
                      })
                    }
                  />
                </Field>
                <Field label="Charge $ (SV102)" box="24F">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={inputCls}
                    disabled={disabled}
                    value={Number.isFinite(line.charge) ? line.charge : ""}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].charge =
                          parseFloat(e.target.value) || 0;
                      })
                    }
                  />
                </Field>
                <Field label="Days / units (SV104)" box="24G">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputCls}
                    disabled={disabled}
                    value={Number.isFinite(line.units) ? line.units : ""}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].units =
                          parseInt(e.target.value, 10) || 0;
                      })
                    }
                  />
                </Field>
                <Field
                  label="Description"
                  box="—"
                  boxNote="Not a CMS-1500 box — supplemental narrative for the code"
                  className="md:col-span-2"
                >
                  <input
                    className={inputCls}
                    disabled={disabled}
                    value={line.description}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].description = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Date(s) of service (DTP*472)" box="24A">
                  <input
                    type="date"
                    className={inputCls}
                    disabled={disabled}
                    value={line.dos_from}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].dos_from = e.target.value;
                      })
                    }
                  />
                </Field>
                <Field label="Place of service" box="24B">
                  <select
                    className={inputCls}
                    disabled={disabled}
                    value={line.place_of_service ?? ""}
                    onChange={(e) =>
                      mutate((d) => {
                        d.service_lines[i].place_of_service =
                          e.target.value || undefined;
                      })
                    }
                  >
                    <option value="">Claim default</option>
                    {POS_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <span
                    className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600"
                    title="CMS-1500 Box 24E"
                  >
                    24E
                  </span>
                  Diagnosis pointers (SV107)
                </span>
                <div className="flex flex-wrap gap-2">
                  {claim.diagnoses.map((dx, di) => {
                    const pointer = di + 1;
                    const checked = line.diagnosis_pointers.includes(pointer);
                    return (
                      <label
                        key={di}
                        className={cn(
                          "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold",
                          checked
                            ? "border-teal-600 bg-teal-50 text-teal-800"
                            : "border-slate-200 bg-white text-slate-500",
                          disabled && "cursor-default opacity-60",
                        )}
                        title={`${dx.code} ${dx.description}`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          disabled={disabled}
                          checked={checked}
                          onChange={() =>
                            mutate((d) => {
                              const ptrs =
                                d.service_lines[i].diagnosis_pointers;
                              d.service_lines[i].diagnosis_pointers = checked
                                ? ptrs.filter((p) => p !== pointer)
                                : [...ptrs, pointer].sort((a, b) => a - b);
                            })
                          }
                        />
                        <span className="font-mono">{dxLetter(pointer)}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {dx.code || "—"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() =>
              mutate((d) => {
                const first = d.service_lines[0];
                d.service_lines.push({
                  line_number: d.service_lines.length + 1,
                  cpt: "",
                  modifiers: [],
                  description: "",
                  charge: 0,
                  units: 1,
                  dos_from: first ? first.dos_from : "",
                  diagnosis_pointers: [],
                });
              })
            }
          >
            <Plus size={15} />
            Add service line
          </Button>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-semibold text-slate-500">
                  Line sum (Σ SV102)
                </p>
                <p className="font-mono font-semibold">{usd(lineTotal)}</p>
              </div>
              <div>
                <Field label="Total charge (CLM02)" box="28">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    aria-label="Claim total charge"
                    className={cn(
                      inputCls,
                      "w-32 font-mono",
                      mismatch && "border-amber-400 bg-amber-50",
                    )}
                    disabled={disabled}
                    value={
                      Number.isFinite(claim.total_charge)
                        ? claim.total_charge
                        : ""
                    }
                    onChange={(e) =>
                      mutate((d) => {
                        d.total_charge = parseFloat(e.target.value) || 0;
                      })
                    }
                  />
                </Field>
              </div>
            </div>
            {mismatch && (
              <p className="mt-2 text-xs font-semibold text-amber-600">
                Claim total does not match the line sum — CLM02 must equal Σ
                SV102.
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
