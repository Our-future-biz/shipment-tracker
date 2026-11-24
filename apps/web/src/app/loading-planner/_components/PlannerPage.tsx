"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { App, Checkbox, Input } from "antd";
import { CopyOutlined, DeleteOutlined, DisconnectOutlined, ExportOutlined, FilePdfOutlined, LinkOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { SectionCard } from "@/components/SectionCard";
import { JobNotFound, useLoadingPlanJob, type PlanJob } from "@/hooks/useLoadingPlanJob";
import { useLoadingPlan, useLoadingPlanWrites } from "@/hooks/useLoadingPlans";
import { usePlannerSettings } from "@/hooks/usePlannerSettings";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { businessToday, formatDate, formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { uuid } from "@/lib/uuid";
import { BTN, BTN_PRIMARY, HINT, LINK, PAGE_SUBTITLE, REF } from "@/styles/ui";
import { useUnsavedGuard } from "@/app/warehouse-concept/_lib/useUnsavedGuard";
import {
  cargoLinesOf,
  draftsOf,
  isBlank,
  limitProblem,
  lineNumbers,
  newDraftLine,
  planFingerprint,
  saveProblem,
  unplannedCount,
  type DraftLine,
  type JobLink,
} from "../_lib/cargoForm";
import { CONTAINERS } from "../_lib/containers";
import { JOB_KIND_LABEL, jobHref, plannerTypeOf } from "../_lib/jobCargo";
import { lineColour, planTotals } from "../_lib/loadStats";
import { planLoad, type LoadPlan } from "../_lib/plan";
import { linkAfterSave, linkOf, newerVersionStep, rememberedUnit, rememberUnit } from "../_lib/plannerScreen";
import type { DimUnit } from "../_lib/units";
import { CargoCard } from "./CargoCard";
import { CompareCard } from "./CompareCard";
import { dgWarning, PLAN_NOTE_MAX } from "../_lib/dangerous";
import { boxCargoDiffers, boxVerdict, cargoDiffers, colourIndexes, shipmentsOf } from "../_lib/cargoTools";
import { EquipmentCard } from "./EquipmentCard";
import { LinkJobModal } from "./LinkJobModal";
import { PlannerSettingsModal } from "./PlannerSettingsModal";
import { ReadCargoModal } from "./ReadCargoModal";
import { ResultPanel } from "./ResultPanel";

const newId = uuid;
const NO_PLAN: LoadPlan = { loads: [], notLoaded: [] };
/** What a linked job is read by: a quote by its reference, a shipment or a sailing by its id. */
const jobKeyOf = (link: JobLink) => (link.kind === "quote" ? link.ref : link.id);

// A loading plan's page, new (/loading-planner/new) or saved (/loading-planner/<id>). A new plan
// opened from a job (/loading-planner/new?shipment=<id>, ?quote=<reference> or ?sailing=<id>) starts
// linked to it, with the job's cargo. From a Co-Loading sailing that is its whole box (Council Outlay
// 14, C1): every counted shipment's cargo, coloured by shipment, in the sailing's own container type.
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
  // A saved plan fills the editor when it opens: the key gives each plan its own editor.
  return <PlanEditor key={plan?.id ?? "new"} saved={plan} />;
}

function PlanEditor({ saved }: { saved: interfaces.LoadingPlanItem | null }) {
  const router = useRouter();
  const message = useMessages();
  const { user, company } = useAuth();
  const { createPlan, updatePlan, deletePlan, isSaving, isDeleting } = useLoadingPlanWrites();
  const { readJob, isReading } = useLoadingPlanJob();
  const { modal } = App.useApp();
  // The company's rules, the same for every plan: clearance, heavy pieces, out-of-gauge warning limits.
  const { rules } = usePlannerSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [name, setName] = useState(saved?.name ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => (saved ? draftsOf(saved.lines) : [newDraftLine(newId())]));
  const [nominated, setNominated] = useState<string[] | null>(saved?.nominated ?? null);
  // A free note for the stuffing gang and the surveyor, printed on the plan (Council Outlay 14, P11).
  const [note, setNote] = useState(saved?.note ?? "");
  const [link, setLink] = useState<JobLink | null>(() => linkOf(saved));
  const [unit, setUnit] = useState<DimUnit>("mm");
  // What the server holds: the plan as opened, then as last saved.
  const [stored, setStored] = useState(saved);
  // A version a colleague saved while this one has unsaved changes.
  const [newer, setNewer] = useState<interfaces.LoadingPlanItem | null>(null);
  const [linking, setLinking] = useState(false);
  const [reading, setReading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Where the page goes once the guard below has let go: the saved plan's own address, or the list.
  const [goTo, setGoTo] = useState<string | null>(null);

  // The unit is read after the first paint: the server-rendered page cannot know it.
  useEffect(() => setUnit(rememberedUnit()), []);
  const handleUnit = (next: DimUnit) => {
    setUnit(next);
    rememberUnit(next);
  };

  const hasCargo = lines.some((line) => !isBlank(line));
  const dirty = stored ? planFingerprint(name, lines, nominated, link, note) !== planFingerprint(stored.name, draftsOf(stored.lines), stored.nominated, linkOf(stored), stored.note ?? "") : true;

  const adopt = (plan: interfaces.LoadingPlanItem) => {
    setName(plan.name);
    setLines(draftsOf(plan.lines));
    setNominated(plan.nominated);
    setNote(plan.note ?? "");
    setLink(linkOf(plan));
    setStored(plan);
    setNewer(null);
  };
  // The plan is read again whenever its page opens. A version newer than the one on screen is
  // taken over at once while nothing is unsaved here; otherwise the user is told and chooses.
  useEffect(() => {
    const step = newerVersionStep(saved, stored, dirty);
    if (step === "offer") setNewer(saved);
    else if (step === "adopt" && saved) adopt(saved);
    // Only a new version from the server sets this off, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.updatedAt]);

  // The linked job's cargo as it is now (Council Outlay 14, P3): read when a linked plan opens and whenever
  // the job is read, to say when the plan's cargo is no longer the job's. Null until it is known.
  const [jobCargo, setJobCargo] = useState<{ id: string; lines: DraftLine[] } | null>(null);
  // A sailing's containers, to judge the plan against: known once the sailing is read.
  const [sailingBox, setSailingBox] = useState<{ id: string; containerType: string; containerCount: number } | null>(null);
  const takeJob = (job: PlanJob, loadCargo: boolean) => {
    setJobCargo({ id: job.id, lines: job.lines });
    if (job.box) setSailingBox({ id: job.id, ...job.box });
    setLink({ kind: job.kind, id: job.id, ref: job.ref });
    if (!loadCargo) return;
    const jobName = `${JOB_KIND_LABEL[job.kind]} ${job.ref}`;
    if (job.lines.length === 0) {
      message.warning(`${jobName} has no cargo lines yet, so the plan's cargo was left as it is.`);
      return;
    }
    setLines(job.lines);
    setName((current) => current.trim() || jobName);
    const unfinished = unplannedCount(job.lines);
    if (unfinished > 0) message.warning(`${unfinished} of ${job.lines.length} cargo lines of ${jobName.toLowerCase()} have no sizes or weight yet. Fill them in to plan them.`);
  };

  // A new plan opened from a job takes that job once, when the page opens. Until it is read, the
  // page says so and the cargo table waits: nothing typed in that moment is lost to it.
  const search = useSearchParams();
  const fromJob = useRef(false);
  const startJob = useMemo(() => {
    const [shipment, quote, sailing] = [search.get("shipment"), search.get("quote"), search.get("sailing")];
    if (saved) return null;
    return shipment ? { kind: "shipment" as const, key: shipment } : quote ? { kind: "quote" as const, key: quote } : sailing ? { kind: "sailing" as const, key: sailing } : null;
  }, [saved, search]);
  const [readingJob, setReadingJob] = useState(startJob !== null);
  useEffect(() => {
    if (!startJob || fromJob.current) return;
    fromJob.current = true;
    readJob(startJob)
      .then(
        (found) => {
          takeJob(found, true);
          // A sailing's box is planned in the sailing's own container type, where the planner knows it.
          const type = found.box ? plannerTypeOf(found.box.containerType, CONTAINERS) : null;
          if (type) setNominated([type]);
        },
        (err) => message.error(err instanceof JobNotFound ? err.message : apiErrorMessage(err)),
      )
      .finally(() => setReadingJob(false));
    // Runs once, for the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A saved, linked plan asks its job once, quietly: a job that cannot be read simply gives no mark.
  const askedJob = useRef(false);
  useEffect(() => {
    const linked = linkOf(saved);
    if (!linked || askedJob.current || saved?.linkGone) return;
    askedJob.current = true;
    readJob({ kind: linked.kind, key: jobKeyOf(linked) }).then(
      (job) => {
        setJobCargo({ id: job.id, lines: job.lines });
        if (job.box) setSailingBox({ id: job.id, ...job.box });
      },
      () => undefined,
    );
    // Once, for the plan as it was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Only for the job the plan is linked to now, and only once that job has cargo lines to compare.
  const differsFromJob = link !== null && jobCargo !== null && jobCargo.id === link.id && jobCargo.lines.length > 0 && (link.kind === "sailing" ? boxCargoDiffers(lines, jobCargo.lines) : cargoDiffers(lines, jobCargo.lines));

  const handleReload = () => {
    if (!link) return;
    const reload = async () => {
      try {
        takeJob(await readJob({ kind: link.kind, key: jobKeyOf(link) }), true);
      } catch (err) {
        message.error(err instanceof JobNotFound ? err.message : apiErrorMessage(err));
      }
    };
    if (!hasCargo) return void reload();
    modal.confirm({
      title: `Reload the cargo from ${JOB_KIND_LABEL[link.kind].toLowerCase()} ${link.ref}?`,
      content: `The cargo lines now in the plan are replaced by the ${JOB_KIND_LABEL[link.kind].toLowerCase()}'s cargo as it is now. Nothing is saved until you save the plan.`,
      okText: "Reload cargo",
      cancelText: "Keep the plan's cargo",
      onOk: reload,
    });
  };

  // The plan follows the typing a moment behind. Cargo too large for one plan is not planned at all.
  const cargo = useMemo(() => cargoLinesOf(lines), [lines]);
  const tooMuch = useMemo(() => limitProblem(cargo), [cargo]);
  const plannedCargo = useDeferredValue(cargo);
  const plannedEquipment = useDeferredValue(nominated);
  const loadPlan = useMemo(
    () => (limitProblem(plannedCargo) ? NO_PLAN : planLoad(plannedCargo, plannedEquipment ?? undefined, rules)),
    [plannedCargo, plannedEquipment, rules],
  );
  const unplanned = unplannedCount(lines);
  // "Fits a standard container" is judged against the 45' only when one is nominated.
  const with45 = nominated?.some((id) => CONTAINERS.some((c) => c.id === id && c.group === "standard" && c.onRequest)) ?? false;
  const numbers = useMemo(() => lineNumbers(lines), [lines]);
  const numberOf = (lineId: string) => numbers.get(lineId) ?? 0;
  // A plan of a sailing's box is coloured by shipment, so each shipment's pieces are seen together; a tick turns it off.
  const shipments = useMemo(() => shipmentsOf(lines), [lines]);
  const [byShipment, setByShipment] = useState(true);
  const colours = useMemo(() => colourIndexes(lines, byShipment && shipments.length > 0), [lines, byShipment, shipments]);
  const colourOf = (lineId: string) => lineColour(colours.get(lineId) ?? 0);
  // What the plan says about the sailing's containers: only once every line is planned.
  const leftOut = loadPlan.notLoaded.reduce((n, entry) => n + entry.colli, 0);
  const boxOf = sailingBox && link?.kind === "sailing" && link.id === sailingBox.id && tooMuch === null && unplanned === 0 && loadPlan.loads.length > 0 ? sailingBox : null;
  const verdict = boxOf ? boxVerdict(loadPlan.loads, leftOut, boxOf) : null;

  // Leaving with unsaved work asks first: a link, the side menu, the Back button, closing or
  // reloading the page. A new plan nothing was typed into has nothing to lose.
  const unsaved = stored ? dirty : name.trim() !== "" || hasCargo || link !== null || note.trim() !== "";
  useUnsavedGuard(unsaved && !goTo, "loading-plan");
  // The guard takes its mark off the browser's history a moment after it lets go; only then does the page move.
  useEffect(() => {
    if (!goTo) return;
    const timer = setTimeout(() => router.replace(goTo), 150);
    return () => clearTimeout(timer);
  }, [goTo, router]);

  // The PDF shows the plan as it is on screen now, saved or not. Its library is fetched on the first use.
  const [printing, setPrinting] = useState(false);
  const makePdf = async () => {
    setPrinting(true);
    try {
      const { downloadPlanPdf } = await import("../_lib/planPdf");
      await downloadPlanPdf({
        name: name.trim() || "Loading plan",
        job: link ? `${JOB_KIND_LABEL[link.kind]} ${link.ref}` : "",
        company: company?.name ?? "",
        madeBy: user?.displayName || user?.email || "",
        lines: cargo,
        numberOf,
        colourIndexOf: (lineId) => colours.get(lineId) ?? 0,
        plan: planLoad(cargo, nominated ?? undefined, rules),
        rules,
        with45,
        nominated: nominated ? CONTAINERS.filter((c) => nominated.includes(c.id)).map((c) => c.name) : null,
        unit,
        unplanned,
        note: note.trim(),
        saved: !dirty,
        printedOn: formatDate(businessToday()),
      });
    } catch {
      message.error("The PDF could not be made.");
    } finally {
      setPrinting(false);
    }
  };
  const handlePdf = () => {
    // Pieces that found no place go out in the PDF in red: asked first, so a plan that does not hold all the cargo is not sent by oversight (P3).
    const left = loadPlan.notLoaded.reduce((n, entry) => n + entry.colli, 0);
    if (unplanned === 0 && left > 0) {
      modal.confirm({
        title: left === 1 ? "1 colli is not loaded in this plan" : `${left} colli are not loaded in this plan`,
        content: "The plan found no place for them. The PDF lists them in red under Not loaded. Make it anyway?",
        okText: "Make the PDF",
        cancelText: "Back to the plan",
        onOk: makePdf,
      });
      return;
    }
    if (unplanned === 0) return void makePdf();
    modal.confirm({
      title: unplanned === 1 ? "1 cargo line is not in the plan" : `${unplanned} cargo lines are not in the plan`,
      content: "A figure is missing on them, so they will not be in the PDF either. The PDF will say so. Make it anyway?",
      okText: "Make the PDF",
      cancelText: "Finish the lines first",
      onOk: makePdf,
    });
  };

  // The plan as it is saved, with what it came to (Council Outlay 14, P4): the lists show the equipment
  // and the colli left out without working every plan out again.
  const planInput = () => {
    const planned = cargoLinesOf(lines);
    const totals = limitProblem(planned) ? null : planTotals(planLoad(planned, nominated ?? undefined, rules));
    return {
      name,
      linkKind: link?.kind ?? null,
      linkId: link?.id ?? null,
      linkRef: link?.ref ?? "",
      lines: planned,
      nominated,
      result: totals ? { equipment: totals.equipment, notLoaded: totals.notLoaded } : null,
      note: note.trim(),
    };
  };

  // "Save as copy": what is on screen becomes a new plan and the page moves to it; the plan it was made from stays as it was last saved.
  const handleCopy = async () => {
    const problem = saveProblem(name, lines);
    if (problem) return void message.warning(problem);
    try {
      const created = await createPlan({ ...planInput(), name: `${name.trim().slice(0, 113)} (copy)` });
      message.success(`Saved as "${created.name}": you are in the copy now`);
      setGoTo(`/loading-planner/${created.id}`);
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  const handleSave = async () => {
    const problem = saveProblem(name, lines);
    if (problem) {
      message.warning(problem);
      return;
    }
    try {
      const input = planInput();
      if (stored) {
        // The server refuses the save when a colleague saved the plan after this version was opened.
        const savedNow = await updatePlan({ id: stored.id, updatedAt: stored.updatedAt, ...input });
        setStored(savedNow);
        // The job as it is called now; a link changed while the save was on its way stays changed.
        setLink((onScreen) => linkAfterSave(onScreen, savedNow));
        setNewer(null);
        message.success("Plan saved");
      } else {
        const created = await createPlan(input);
        message.success("Plan saved");
        setGoTo(`/loading-planner/${created.id}`);
      }
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!stored) return;
    try {
      await deletePlan(stored.id);
      message.success(`Plan "${stored.name}" deleted`);
      setDeleting(false);
      setGoTo("/loading-planner");
    } catch (err) {
      message.error(apiErrorMessage(err));
    }
  };

  const jobWord = link ? JOB_KIND_LABEL[link.kind].toLowerCase() : "";
  const leaving = goTo !== null;

  return (
    <div className="bg-slate-50 min-h-full px-4 py-6 sm:px-8">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-4">
        <BackLink href="/loading-planner">Loading Planner</BackLink>
        <h1 className="sr-only">{stored ? `Loading plan ${stored.name}` : "New loading plan"}</h1>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="Plan name"
            placeholder="Name the plan, e.g. Machines to Nhava Sheva"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="!w-[420px] max-w-full !text-[16px] !font-semibold"
          />
          {leaving || !dirty ? <Pill tone="green">Saved</Pill> : <Pill tone="amber">{stored ? "Unsaved changes" : "Not saved yet"}</Pill>}
          <span className="flex-1" />
          {stored && (
            <button type="button" className={BTN} onClick={() => setDeleting(true)} disabled={leaving}>
              <DeleteOutlined />
              Delete plan
            </button>
          )}
          {stored && (
            <button type="button" className={BTN} onClick={handleCopy} disabled={isSaving || leaving} title="Saves what is on screen as a new plan and opens it. This plan stays as it was last saved.">
              <CopyOutlined />
              Save as copy
            </button>
          )}
          <button type="button" className={BTN} onClick={handlePdf} disabled={printing || cargo.length === 0 || tooMuch !== null}>
            <FilePdfOutlined />
            {printing ? "Making the PDF…" : "PDF"}
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={handleSave} disabled={isSaving || leaving || !dirty}>
            <SaveOutlined />
            {isSaving ? "Saving…" : "Save plan"}
          </button>
        </div>
        <p className={`${PAGE_SUBTITLE} m-0 -mt-2`}>
          {stored ? `Made by ${stored.createdBy} · last saved ${formatDateTime(stored.updatedAt)} by ${stored.updatedBy} · ` : ""}
          The PDF holds a summary and a page per container{cargo.length === 0 ? "; fill in a cargo line first" : ""}.
        </p>

        {newer && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800" role="alert">
            <span>
              {newer.updatedBy} saved this plan on {formatDateTime(newer.updatedAt)}, after you opened it. Your changes cannot be saved over theirs.
            </span>
            <button type="button" className={BTN} onClick={() => adopt(newer)}>
              Load their version (drops your changes)
            </button>
          </div>
        )}

        {/* The shipment or quote the plan belongs to. A plan without one is a what-if plan. */}
        <div className="flex flex-wrap items-center gap-2">
          {readingJob ? (
            <span className="text-[13px] text-slate-700" role="status">
              Reading the cargo of the {startJob?.kind ?? "job"}…
            </span>
          ) : link ? (
            <>
              <span className="text-[13px] text-slate-700">
                Linked to {jobWord}{" "}
                <Link href={jobHref(link.kind, link.id, link.ref)} className={`${REF} ${LINK} font-semibold`}>
                  {link.ref || "(no job number yet)"}
                </Link>
              </span>
              {differsFromJob && (
                <Pill tone="amber" title={`The ${jobWord}'s cargo lines are not the same as this plan's: sizes, weights, colli or the lines themselves. Reload the cargo, or keep the plan as it is if you changed it on purpose.`}>
                  The {jobWord}&apos;s cargo differs from this plan&apos;s
                </Pill>
              )}
              {stored?.linkGone && linkOf(stored)?.id === link.id ? (
                <Pill tone="red">This {jobWord} was deleted</Pill>
              ) : (
                <button type="button" className={BTN} onClick={handleReload} disabled={isReading}>
                  <ReloadOutlined />
                  Reload cargo from the {jobWord}
                </button>
              )}
              {/* A plan linked to a quote offers its equipment to it (Council Outlay 14, P7): the quote's page shows old against new and asks. */}
              {link.kind === "quote" &&
                (stored && !dirty && loadPlan.loads.length > 0 ? (
                  <Link href={`/sales/quote/${encodeURIComponent(link.ref)}?plan=${stored.id}`} className={`${BTN} no-underline`}>
                    <ExportOutlined />
                    Put on the quote
                  </Link>
                ) : (
                  <button type="button" className={BTN} disabled title={loadPlan.loads.length === 0 ? "The plan loads no container yet." : "Save the plan first: the quote reads the saved plan."}>
                    <ExportOutlined />
                    Put on the quote
                  </button>
                ))}
              <button type="button" className={BTN} onClick={() => setLink(null)}>
                <DisconnectOutlined />
                Unlink
              </button>
            </>
          ) : (
            <>
              <span className={HINT}>Not linked to a shipment or quote.</span>
              <button type="button" className={BTN} onClick={() => setLinking(true)}>
                <LinkOutlined />
                Link to a shipment or quote
              </button>
            </>
          )}
        </div>

        {/* A sailing's box: does the cargo go into the containers the sailing has, and whose piece is whose. */}
        {(boxOf || shipments.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {boxOf &&
              (verdict ? (
                <Pill tone="amber">{verdict}</Pill>
              ) : (
                <Pill tone="green">
                  The cargo goes into the sailing&apos;s {boxOf.containerCount} × {boxOf.containerType}
                </Pill>
              ))}
            {shipments.length > 0 && (
              <Checkbox checked={byShipment} onChange={(e) => setByShipment(e.target.checked)}>
                Colour by shipment
              </Checkbox>
            )}
            {shipments.length > 0 &&
              byShipment &&
              shipments.map((job, index) => (
                <span key={job} className="inline-flex items-center gap-1.5 text-[12px] text-slate-700">
                  <span className={`h-3 w-3 shrink-0 rounded-sm border border-slate-700 ${lineColour(index).dot}`} aria-hidden />
                  {job}
                </span>
              ))}
          </div>
        )}

        <CargoCard
          lines={lines}
          unit={unit}
          onUnitChange={handleUnit}
          onChange={setLines}
          onAdd={() => setLines([...lines, newDraftLine(newId())])}
          newId={newId}
          onRead={() => setReading(true)}
          busy={readingJob}
          rules={rules}
          with45={with45}
          colourOf={colourOf}
        />
        {/* What the stuffing gang and the surveyor must know that no figure says: printed on the plan's first page. */}
        <SectionCard title="Note for the stuffing gang">
          <Input.TextArea
            aria-label="Note for the stuffing gang"
            rows={2}
            maxLength={PLAN_NOTE_MAX}
            showCount
            placeholder="Lashing, dunnage, what to mind: e.g. Timber under the tank, 4 chains to the lashing rings, no forklift on the roof side."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <p className={`${HINT} m-0 mt-2`}>Printed on the plan&apos;s PDF, with each line&apos;s own lashing note (a line&apos;s &quot;⋯&quot; menu, Dangerous goods and lashing).</p>
        </SectionCard>
        <EquipmentCard nominated={nominated} unit={unit} onChange={setNominated} rules={rules} onSettings={() => setSettingsOpen(true)} />
        {cargo.length > 0 && tooMuch === null && <CompareCard cargo={cargo} plan={loadPlan} nominated={nominated} rules={rules} onUse={setNominated} />}
        <ResultPanel
          plan={loadPlan}
          unit={unit}
          colourOf={colourOf}
          numberOf={numberOf}
          unplanned={unplanned}
          tooMuch={tooMuch}
          nothingNominated={nominated !== null && nominated.length === 0 && cargo.length > 0}
          planName={name}
          dgWarningOf={(load) => dgWarning(load, (lineId) => cargo.find((line) => line.id === lineId))}
        />
      </div>

      {/* Lines read from a document join the cargo list after the lines typed so far; blank lines give way. */}
      <ReadCargoModal
        open={reading}
        onClose={() => setReading(false)}
        unit={unit}
        existing={lines}
        onAdd={(read) => setLines([...lines.filter((line) => !isBlank(line)), ...read])}
      />
      <PlannerSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LinkJobModal open={linking} onClose={() => setLinking(false)} readJob={readJob} onLinked={takeJob} hasCargo={hasCargo} />
      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title={`Delete "${stored?.name ?? ""}"?`}
        description={`The plan disappears from the list for everyone.${link ? ` The ${jobWord} it is linked to is not changed.` : ""}`}
        confirmLabel="Delete plan"
        danger
        loading={isDeleting}
      />
    </div>
  );
}
