"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { Pill } from "@/components/Pill";
import { useLoadingPlan, useLoadingPlans } from "@/hooks/useLoadingPlans";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN_PRIMARY, HINT, PAGE_SUBTITLE, REF } from "@/styles/ui";
import { cargoLinesOf, draftsOf, isBlank, newDraftLine, saveProblem, type DraftLine } from "../_lib/cargoForm";
import { lineColour } from "../_lib/loadStats";
import { planLoad } from "../_lib/plan";
import type { DimUnit } from "../_lib/units";
import { CargoCard } from "./CargoCard";
import { EquipmentCard } from "./EquipmentCard";
import { ResultPanel } from "./ResultPanel";

const newId = () => crypto.randomUUID();

/** What of a plan is saved, as one string: two of them differ when there is something to save. */
const savedForm = (name: string, lines: DraftLine[], nominated: string[] | null) =>
  JSON.stringify([name.trim(), lines.filter((line) => !isBlank(line)), nominated]);

// A loading plan's page, new (/loading-planner/new) or saved (/loading-planner/<id>).
export function PlannerPage() {
  const { planId } = useParams<{ planId?: string }>();
  const { plan, isLoading, error } = useLoadingPlan(planId ?? null);

  if (planId && !plan) {
    let text = "Loading the plan…";
    if (!isLoading && error) text = isNotFound(error) ? "This plan does not exist, or it was deleted." : apiErrorMessage(error);
    return (
      <div className="bg-slate-50 min-h-full px-8 py-6">
        <BackLink href="/loading-planner">Loading Planner</BackLink>
        <p className={`${HINT} mt-4`}>{text}</p>
      </div>
    );
  }
  // A saved plan fills the editor once, when it opens: the key gives each plan its own editor.
  return <PlanEditor key={plan?.id ?? "new"} saved={plan} />;
}

function PlanEditor({ saved }: { saved: interfaces.LoadingPlanItem | null }) {
  const router = useRouter();
  const message = useMessages();
  const { createPlan, updatePlan, isSaving } = useLoadingPlans();

  const [name, setName] = useState(saved?.name ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => (saved ? draftsOf(saved.lines) : [newDraftLine(newId())]));
  const [nominated, setNominated] = useState<string[] | null>(saved?.nominated ?? null);
  const [unit, setUnit] = useState<DimUnit>("mm");
  // What the server holds: the plan as opened, then as last saved.
  const [stored, setStored] = useState(saved);

  // The plan follows the typing a moment behind, so a long cargo list never holds up a keystroke.
  const cargo = useMemo(() => cargoLinesOf(lines), [lines]);
  const plannedCargo = useDeferredValue(cargo);
  const plannedEquipment = useDeferredValue(nominated);
  const loadPlan = useMemo(() => planLoad(plannedCargo, plannedEquipment ?? undefined), [plannedCargo, plannedEquipment]);

  const colourOf = (lineId: string) => lineColour(lines.findIndex((line) => line.id === lineId));
  const dirty = stored ? savedForm(name, lines, nominated) !== savedForm(stored.name, draftsOf(stored.lines), stored.nominated) : true;

  const handleSave = async () => {
    const problem = saveProblem(name, lines);
    if (problem) {
      message.warning(problem);
      return;
    }
    const input = {
      name,
      linkKind: stored?.linkKind ?? null,
      linkId: stored?.linkId ?? null,
      linkRef: stored?.linkRef ?? "",
      lines: cargoLinesOf(lines),
      nominated,
    };
    try {
      if (stored) {
        setStored(await updatePlan({ id: stored.id, ...input }));
        message.success("Plan saved");
      } else {
        const created = await createPlan(input);
        message.success("Plan saved");
        router.replace(`/loading-planner/${created.id}`);
      }
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
        <BackLink href="/loading-planner">Loading Planner</BackLink>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Plan name"
            placeholder="Name the plan, e.g. Machines to Nhava Sheva"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="!w-[420px] max-w-full !text-[16px] !font-semibold"
          />
          {stored?.linkKind && (
            <Pill tone="indigo">
              {stored.linkKind === "shipment" ? "Shipment" : "Quote"} <span className={REF}>{stored.linkRef}</span>
            </Pill>
          )}
          {dirty ? <Pill tone="amber">{stored ? "Unsaved changes" : "Not saved yet"}</Pill> : <Pill tone="green">Saved</Pill>}
          <button type="button" className={`${BTN_PRIMARY} ml-auto`} onClick={handleSave} disabled={isSaving || !dirty}>
            <SaveOutlined />
            {isSaving ? "Saving…" : "Save plan"}
          </button>
        </div>
        {stored && (
          <p className={`${PAGE_SUBTITLE} m-0 -mt-2`}>
            Made by {stored.createdBy} · last saved {formatDateTime(stored.updatedAt)} by {stored.updatedBy}
          </p>
        )}

        <CargoCard lines={lines} unit={unit} onUnitChange={setUnit} onChange={setLines} onAdd={() => setLines([...lines, newDraftLine(newId())])} />
        <EquipmentCard nominated={nominated} unit={unit} onChange={setNominated} />
        <ResultPanel plan={loadPlan} unit={unit} colourOf={colourOf} />
      </div>
    </div>
  );
}
