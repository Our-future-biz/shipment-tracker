"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { App, Input } from "antd";
import { DisconnectOutlined, LinkOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { Pill } from "@/components/Pill";
import { JobNotFound, useLoadingPlanJob, type PlanJob } from "@/hooks/useLoadingPlanJob";
import { useLoadingPlan, useLoadingPlans } from "@/hooks/useLoadingPlans";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN, BTN_PRIMARY, HINT, PAGE_SUBTITLE, REF } from "@/styles/ui";
import { cargoLinesOf, draftsOf, isBlank, newDraftLine, saveProblem, type DraftLine } from "../_lib/cargoForm";
import { JOB_KIND_LABEL, jobHref } from "../_lib/jobCargo";
import { lineColour } from "../_lib/loadStats";
import { planLoad } from "../_lib/plan";
import type { DimUnit } from "../_lib/units";
import { CargoCard } from "./CargoCard";
import { EquipmentCard } from "./EquipmentCard";
import { LinkJobModal } from "./LinkJobModal";
import { ResultPanel } from "./ResultPanel";

const newId = () => crypto.randomUUID();

/** The job a plan is linked to. */
interface JobLink {
  kind: interfaces.PlanLinkKind;
  id: string;
  ref: string;
}

const linkOf = (plan: interfaces.LoadingPlanItem | null): JobLink | null =>
  plan?.linkKind && plan.linkId ? { kind: plan.linkKind, id: plan.linkId, ref: plan.linkRef } : null;

/** What of a plan is saved, as one string: two of them differ when there is something to save. */
const savedForm = (name: string, lines: DraftLine[], nominated: string[] | null, link: JobLink | null) =>
  JSON.stringify([name.trim(), lines.filter((line) => !isBlank(line)), nominated, link?.kind ?? null, link?.id ?? null]);

// A loading plan's page, new (/loading-planner/new) or saved (/loading-planner/<id>). A new plan
// opened from a job (/loading-planner/new?shipment=<id> or ?quote=<reference>) starts linked to it,
// with the job's cargo.
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
  const [link, setLink] = useState<JobLink | null>(() => linkOf(saved));
  const [unit, setUnit] = useState<DimUnit>("mm");
  // What the server holds: the plan as opened, then as last saved.
  const [stored, setStored] = useState(saved);
  const [linking, setLinking] = useState(false);
  const { readJob, isReading } = useLoadingPlanJob();
  const { modal } = App.useApp();

  const hasCargo = lines.some((line) => !isBlank(line));
  const takeJob = (job: PlanJob, loadCargo: boolean) => {
    setLink({ kind: job.kind, id: job.id, ref: job.ref });
    if (!loadCargo) return;
    if (job.lines.length === 0) {
      message.warning(`${JOB_KIND_LABEL[job.kind]} ${job.ref} has no cargo with sizes or weights yet, so the plan's cargo was left as it is.`);
      return;
    }
    setLines(job.lines);
    if (!name.trim()) setName(`${JOB_KIND_LABEL[job.kind]} ${job.ref}`);
  };

  // A new plan opened from a job takes that job once, when the page opens.
  const search = useSearchParams();
  const fromJob = useRef(false);
  useEffect(() => {
    if (saved || fromJob.current) return;
    fromJob.current = true;
    const shipment = search.get("shipment");
    const quote = search.get("quote");
    const job = shipment ? { kind: "shipment" as const, key: shipment } : quote ? { kind: "quote" as const, key: quote } : null;
    if (!job) return;
    readJob(job).then(
      (found) => takeJob(found, true),
      (err) => message.error(err instanceof JobNotFound ? err.message : apiErrorMessage(err)),
    );
    // Runs once, for the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReload = () => {
    if (!link) return;
    const reload = async () => {
      try {
        takeJob(await readJob({ kind: link.kind, key: link.kind === "shipment" ? link.id : link.ref }), true);
      } catch (err) {
        message.error(err instanceof JobNotFound ? err.message : apiErrorMessage(err));
      }
    };
    if (!hasCargo) return void reload();
    modal.confirm({
      title: `Reload the cargo from ${JOB_KIND_LABEL[link.kind].toLowerCase()} ${link.ref}?`,
      content: "The cargo lines now in the plan are replaced by the job's cargo as it is now. Nothing is saved until you save the plan.",
      okText: "Reload cargo",
      cancelText: "Keep the plan's cargo",
      onOk: reload,
    });
  };

  // The plan follows the typing a moment behind, so a long cargo list never holds up a keystroke.
  const cargo = useMemo(() => cargoLinesOf(lines), [lines]);
  const plannedCargo = useDeferredValue(cargo);
  const plannedEquipment = useDeferredValue(nominated);
  const loadPlan = useMemo(() => planLoad(plannedCargo, plannedEquipment ?? undefined), [plannedCargo, plannedEquipment]);

  const colourOf = (lineId: string) => lineColour(lines.findIndex((line) => line.id === lineId));
  const dirty = stored ? savedForm(name, lines, nominated, link) !== savedForm(stored.name, draftsOf(stored.lines), stored.nominated, linkOf(stored)) : true;

  const handleSave = async () => {
    const problem = saveProblem(name, lines);
    if (problem) {
      message.warning(problem);
      return;
    }
    const input = {
      name,
      linkKind: link?.kind ?? null,
      linkId: link?.id ?? null,
      linkRef: link?.ref ?? "",
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

        {/* The job the plan belongs to. A plan without one is a what-if plan. */}
        <div className="flex flex-wrap items-center gap-2">
          {link ? (
            <>
              <span className="text-[13px] text-slate-700">
                Linked to {JOB_KIND_LABEL[link.kind].toLowerCase()}{" "}
                <Link href={jobHref(link.kind, link.id, link.ref)} className={`${REF} font-semibold !text-indigo-600 hover:!underline`}>
                  {link.ref || "(no number yet)"}
                </Link>
              </span>
              <button type="button" className={BTN} onClick={handleReload} disabled={isReading}>
                <ReloadOutlined />
                Reload cargo from job
              </button>
              <button type="button" className={BTN} onClick={() => setLink(null)}>
                <DisconnectOutlined />
                Unlink
              </button>
            </>
          ) : (
            <>
              <span className={HINT}>A what-if plan, not linked to a shipment or quote.</span>
              <button type="button" className={BTN} onClick={() => setLinking(true)}>
                <LinkOutlined />
                Link to a job
              </button>
            </>
          )}
        </div>

        <CargoCard lines={lines} unit={unit} onUnitChange={setUnit} onChange={setLines} onAdd={() => setLines([...lines, newDraftLine(newId())])} />
        <EquipmentCard nominated={nominated} unit={unit} onChange={setNominated} />
        <ResultPanel plan={loadPlan} unit={unit} colourOf={colourOf} />
      </div>

      <LinkJobModal open={linking} onClose={() => setLinking(false)} readJob={readJob} onLinked={takeJob} hasCargo={hasCargo} />
    </div>
  );
}
