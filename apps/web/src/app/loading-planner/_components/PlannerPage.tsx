"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { App, Input } from "antd";
import { DeleteOutlined, DisconnectOutlined, FilePdfOutlined, LinkOutlined, ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { BackLink } from "@/components/BackLink";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Pill } from "@/components/Pill";
import { JobNotFound, useLoadingPlanJob, type PlanJob } from "@/hooks/useLoadingPlanJob";
import { useLoadingPlan, useLoadingPlanWrites } from "@/hooks/useLoadingPlans";
import { usePlannerSettings } from "@/hooks/usePlannerSettings";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { businessToday, formatDate, formatDateTime } from "@/lib/date";
import { useMessages } from "@/lib/toast";
import { BTN, BTN_PRIMARY, HINT, PAGE_SUBTITLE, REF } from "@/styles/ui";
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
import { JOB_KIND_LABEL, jobHref } from "../_lib/jobCargo";
import { lineColour } from "../_lib/loadStats";
import { planLoad, type LoadPlan } from "../_lib/plan";
import { DIM_UNITS, type DimUnit } from "../_lib/units";
import { CargoCard } from "./CargoCard";
import { EquipmentCard } from "./EquipmentCard";
import { LinkJobModal } from "./LinkJobModal";
import { PlannerSettingsModal } from "./PlannerSettingsModal";
import { ReadCargoModal } from "./ReadCargoModal";
import { ResultPanel } from "./ResultPanel";

const newId = () => crypto.randomUUID();
const NO_PLAN: LoadPlan = { loads: [], notLoaded: [] };

const linkOf = (plan: interfaces.LoadingPlanItem | null): JobLink | null =>
  plan?.linkKind && plan.linkId ? { kind: plan.linkKind, id: plan.linkId, ref: plan.linkRef } : null;

// The unit a user last typed sizes in is kept in their browser: a convenience, so the page works without it.
const UNIT_KEY = "loading-planner-unit";
const rememberedUnit = (): DimUnit => {
  try {
    const unit = window.localStorage.getItem(UNIT_KEY);
    return DIM_UNITS.find((u) => u === unit) ?? "mm";
  } catch {
    return "mm";
  }
};
const rememberUnit = (unit: DimUnit) => {
  try {
    window.localStorage.setItem(UNIT_KEY, unit);
  } catch {
    // Private windows and blocked storage: the unit is simply not remembered.
  }
};

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
  // The clearance left free in standard containers: the company's setting, the same for every plan.
  const { clearance } = usePlannerSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [name, setName] = useState(saved?.name ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => (saved ? draftsOf(saved.lines) : [newDraftLine(newId())]));
  const [nominated, setNominated] = useState<string[] | null>(saved?.nominated ?? null);
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
  const dirty = stored ? planFingerprint(name, lines, nominated, link) !== planFingerprint(stored.name, draftsOf(stored.lines), stored.nominated, linkOf(stored)) : true;

  const adopt = (plan: interfaces.LoadingPlanItem) => {
    setName(plan.name);
    setLines(draftsOf(plan.lines));
    setNominated(plan.nominated);
    setLink(linkOf(plan));
    setStored(plan);
    setNewer(null);
  };
  // The plan is read again whenever its page opens. A version newer than the one on screen is
  // taken over at once while nothing is unsaved here; otherwise the user is told and chooses.
  useEffect(() => {
    if (!saved || !stored || saved.updatedAt <= stored.updatedAt) return;
    if (dirty) setNewer(saved);
    else adopt(saved);
    // Only a new version from the server sets this off, not every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.updatedAt]);

  const takeJob = (job: PlanJob, loadCargo: boolean) => {
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
    const [shipment, quote] = [search.get("shipment"), search.get("quote")];
    return saved ? null : shipment ? { kind: "shipment" as const, key: shipment } : quote ? { kind: "quote" as const, key: quote } : null;
  }, [saved, search]);
  const [readingJob, setReadingJob] = useState(startJob !== null);
  useEffect(() => {
    if (!startJob || fromJob.current) return;
    fromJob.current = true;
    readJob(startJob)
      .then(
        (found) => takeJob(found, true),
        (err) => message.error(err instanceof JobNotFound ? err.message : apiErrorMessage(err)),
      )
      .finally(() => setReadingJob(false));
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
    () => (limitProblem(plannedCargo) ? NO_PLAN : planLoad(plannedCargo, plannedEquipment ?? undefined, clearance)),
    [plannedCargo, plannedEquipment, clearance],
  );
  const unplanned = unplannedCount(lines);
  const numbers = useMemo(() => lineNumbers(lines), [lines]);
  const numberOf = (lineId: string) => numbers.get(lineId) ?? 0;
  const colourOf = (lineId: string) => lineColour(numberOf(lineId) - 1);

  // Leaving with unsaved work asks first: a link, the side menu, the Back button, closing or
  // reloading the page. A new plan nothing was typed into has nothing to lose.
  const unsaved = stored ? dirty : name.trim() !== "" || hasCargo || link !== null;
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
        plan: planLoad(cargo, nominated ?? undefined, clearance),
        clearance,
        nominated: nominated ? CONTAINERS.filter((c) => nominated.includes(c.id)).map((c) => c.name) : null,
        unit,
        unplanned,
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
    if (unplanned === 0) return void makePdf();
    modal.confirm({
      title: unplanned === 1 ? "1 cargo line is not in the plan" : `${unplanned} cargo lines are not in the plan`,
      content: "A figure is missing on them, so they will not be in the PDF either. The PDF will say so. Make it anyway?",
      okText: "Make the PDF",
      cancelText: "Finish the lines first",
      onOk: makePdf,
    });
  };

  const handleSave = async () => {
    const problem = saveProblem(name, lines);
    if (problem) {
      message.warning(problem);
      return;
    }
    const input = { name, linkKind: link?.kind ?? null, linkId: link?.id ?? null, linkRef: link?.ref ?? "", lines: cargoLinesOf(lines), nominated };
    try {
      if (stored) {
        // The server refuses the save when a colleague saved the plan after this version was opened.
        const savedNow = await updatePlan({ id: stored.id, updatedAt: stored.updatedAt, ...input });
        setStored(savedNow);
        setLink(linkOf(savedNow));
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
                <Link href={jobHref(link.kind, link.id, link.ref)} className={`${REF} font-semibold !text-indigo-600 hover:!underline`}>
                  {link.ref || "(no job number yet)"}
                </Link>
              </span>
              {stored?.linkGone && linkOf(stored)?.id === link.id ? (
                <Pill tone="red">This {jobWord} was deleted</Pill>
              ) : (
                <button type="button" className={BTN} onClick={handleReload} disabled={isReading}>
                  <ReloadOutlined />
                  Reload cargo from the {jobWord}
                </button>
              )}
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

        <CargoCard
          lines={lines}
          unit={unit}
          onUnitChange={handleUnit}
          onChange={setLines}
          onAdd={() => setLines([...lines, newDraftLine(newId())])}
          onRead={() => setReading(true)}
          busy={readingJob}
          clearance={clearance}
        />
        <EquipmentCard nominated={nominated} unit={unit} onChange={setNominated} clearance={clearance} onSettings={() => setSettingsOpen(true)} />
        <ResultPanel
          plan={loadPlan}
          unit={unit}
          colourOf={colourOf}
          numberOf={numberOf}
          unplanned={unplanned}
          tooMuch={tooMuch}
          nothingNominated={nominated !== null && nominated.length === 0 && cargo.length > 0}
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
