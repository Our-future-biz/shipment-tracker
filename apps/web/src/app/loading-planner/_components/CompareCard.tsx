"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Select } from "antd";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { BTN_BAR, HINT, TD, TH } from "@/styles/ui";
import { compareFigures, equipmentWords, FIRST_ALTERNATIVES, MAX_ALTERNATIVES, sameEquipment, type CompareFigures } from "../_lib/compare";
import { CONTAINERS, GROUP_ORDER, type PlanRules } from "../_lib/containers";
import type { CargoLine } from "../_lib/gauge";
import { planLoad, type LoadPlan } from "../_lib/plan";

const GROUP_TITLE = { standard: "Standard", "open-top": "Open top and hard-top", "flat-rack": "Flat rack" } as const;
const TYPE_OPTIONS = GROUP_ORDER.map((group) => ({ label: GROUP_TITLE[group], options: CONTAINERS.filter((c) => c.group === group).map((c) => ({ value: c.id, label: c.name })) }));
const pct = (value: number) => `${Math.round(value)}%`;

interface CompareCardProps {
  /** The planned cargo lines, and the plan they make with the equipment on screen. */
  cargo: CargoLine[];
  plan: LoadPlan;
  nominated: string[] | null;
  rules: PlanRules;
  /** Takes an alternative's equipment as the plan's own. */
  onUse: (nominated: string[]) => void;
}

function Figures({ figures }: { figures: CompareFigures }) {
  const gauge = [figures.outOfGauge > 0 ? `${figures.outOfGauge} out of gauge` : "", figures.linerConfirm > 0 ? `${figures.linerConfirm} liner to confirm` : ""].filter(Boolean).join(", ");
  return (
    <>
      <td className={`${TD} font-medium text-slate-900`}>{figures.containers || "None"}</td>
      <td className={`${TD} text-right tabular-nums ${figures.notLoaded > 0 ? "font-semibold text-red-600" : ""}`}>{figures.notLoaded}</td>
      <td className={`${TD} text-right tabular-nums`}>{figures.count > 0 ? pct(figures.floorPct) : "—"}</td>
      <td className={`${TD} text-right tabular-nums`}>{figures.count > 0 ? pct(figures.payloadPct) : "—"}</td>
      <td className={`${TD} ${gauge ? "text-amber-700" : "text-slate-500"}`}>{figures.count === 0 ? "—" : gauge || "In gauge"}</td>
    </>
  );
}

// "Compare alternatives" (Council Outlay 14, P6): the cargo on screen planned into other equipment,
// up to three alternatives beside the plan - what each needs, what it leaves out, how full it is,
// in gauge or not. "Use" takes an alternative's equipment as the plan's own nomination. Nothing here
// is saved with the plan: it is worked out anew from the cargo. Closed until asked for, so a plan
// that needs no comparison is not worked out four times.
export function CompareCard({ cargo, plan, nominated, rules, onUse }: CompareCardProps) {
  const [open, setOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<string[][]>(FIRST_ALTERNATIVES);
  const planned = useDeferredValue(cargo);
  const rows = useMemo(
    () => (open ? alternatives.map((ids) => (ids.length > 0 ? compareFigures(planLoad(planned, ids, rules)) : null)) : []),
    [open, alternatives, planned, rules],
  );
  const setAt = (index: number, ids: string[]) => setAlternatives((all) => all.map((a, i) => (i === index ? ids : a)));

  return (
    <SectionCard
      title="Compare alternatives"
      bodyClassName={open ? "p-0" : undefined}
      extra={
        <button type="button" className={BTN_BAR} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Compare"}
        </button>
      }
    >
      {!open ? (
        <p className={`${HINT} m-0`}>The same cargo planned into other equipment, side by side with this plan: 20&apos; boxes against a 40&apos; high cube, a flat rack against an open top.</p>
      ) : (
        <>
          <div className="overflow-x-auto px-4 py-3">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} w-[300px]`}>Equipment allowed</th>
                  <th className={TH}>Containers needed</th>
                  <th className={`${TH} w-[110px] text-right`}>Colli not loaded</th>
                  <th className={`${TH} w-[90px] text-right`}>Floor used</th>
                  <th className={`${TH} w-[100px] text-right`}>Payload used</th>
                  <th className={`${TH} w-[170px]`}>Gauge</th>
                  <th className={`${TH} w-[120px]`} aria-label="Use" />
                </tr>
              </thead>
              <tbody>
                <tr className="bg-indigo-50/60">
                  <td className={TD}>
                    <span className="font-semibold text-slate-900">This plan</span> <span className="text-slate-500">· {equipmentWords(nominated)}</span>
                  </td>
                  <Figures figures={compareFigures(plan)} />
                  <td className={TD} />
                </tr>
                {alternatives.map((ids, index) => {
                  const figures = rows[index];
                  return (
                    <tr key={index}>
                      <td className={TD}>
                        <Select
                          mode="multiple"
                          aria-label={`Equipment of alternative ${index + 1}`}
                          className="w-full"
                          placeholder="Choose the container types"
                          value={ids}
                          options={TYPE_OPTIONS}
                          onChange={(next: string[]) => setAt(index, next)}
                          maxTagCount="responsive"
                        />
                      </td>
                      {figures ? <Figures figures={figures} /> : <td className={`${TD} text-slate-500`} colSpan={5}>Choose the container types to plan into.</td>}
                      <td className={TD}>
                        <span className="flex items-center justify-end gap-1.5">
                          <button type="button" className={BTN_BAR} disabled={ids.length === 0 || sameEquipment(ids, nominated)} onClick={() => onUse(ids)} title="Nominates this equipment for the plan. Nothing is saved until you save the plan.">
                            Use
                          </button>
                          <button type="button" className={BTN_BAR} aria-label={`Remove alternative ${index + 1}`} onClick={() => setAlternatives((all) => all.filter((_, i) => i !== index))}>
                            <CloseOutlined />
                          </button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2.5">
            {alternatives.length < MAX_ALTERNATIVES && (
              <button type="button" className={BTN_BAR} onClick={() => setAlternatives((all) => [...all, []])}>
                <PlusOutlined />
                Add an alternative
              </button>
            )}
            <span className={HINT}>
              Each alternative is the planner&apos;s own plan with only those types allowed, worked out with the same rules. An alternative says how many containers the cargo needs; it
              cannot be held to a fixed number.
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}
