"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircleFilled, ClockCircleOutlined, RightOutlined } from "@ant-design/icons";
import { useGateLog, useGateMovement, useGateRowCache, type GateMovement, type GateStampKind } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { api } from "@/lib/api";
import { ConfirmModal } from "@/components/ConfirmModal";
import { TERMS, directionOfVisit } from "@/app/warehouse/_lib/glossary";
import { dockSlotText, exceptionText, isOnHold } from "@/app/warehouse/_lib/worklist";
import { useUrlParam } from "@/app/warehouse/_lib/useUrlParam";
import { Badge, CUSTOMS_STATUS_TONE, STATUS_TONE, errorMessage, hasSurvey, hhmm, nf, requiredSurveyPhase, surveyTargets } from "@/app/warehouse/gate-log/_lib/gate";
import { gateSteps, isOutbound, isQueueableStamp, stampConfirmText, stampPrecheck, type GateStep } from "@/app/warehouse/gate-log/_lib/steps";
import { useFloorQueue } from "../_lib/useFloorQueue";
import { applyPending, pendingStamps, uuid } from "../_lib/queue";
import { FloorCard, NeedsConnection, bigPrimary } from "./floorUi";
import { FloorSurvey } from "./FloorSurvey";
import { FloorException } from "./FloorException";
import { FloorPhotos } from "./FloorPhotos";
import { FloorPinCheck } from "./FloorPinCheck";
import { FloorReadiness } from "./FloorReadiness";
import { FloorReweigh } from "./FloorReweigh";
import { LifecycleChip } from "@/app/warehouse/_components/LifecycleStrip";
import { TALLY_LABEL } from "@/app/warehouse/_lib/containerPlan";

const VIEWS = ["main", "survey", "damage", "photos", "pin", "release", "reweigh"] as const;
type View = (typeof VIEWS)[number];

// The later of two copies of the same movement (the list and the detail are cached apart).
const newer = (a: GateMovement | undefined, b: GateMovement | undefined) => (!a ? b : !b ? a : a.updatedAt >= b.updatedAt ? a : b);

// One position on the phone: only what the floor needs — refs, direction, customs, pieces /
// weight / volume, the dock slot, the steps with the next one as one big button (same order,
// confirmations and words as the gate job), then the survey, photos, damage / short / over, the
// pick-up PIN and the release readiness each on a screen of its own.
export function FloorPosition({ id }: { id: string }) {
  const toast = useToast();
  const q = useFloorQueue();
  const writeRow = useGateRowCache();
  const { movements, isLoading } = useGateLog();
  const { movement: detail, isLoading: detailLoading } = useGateMovement(id);
  const base = newer(detail, movements.find((x) => x.id === id));
  const m = useMemo(() => (base ? applyPending(base, q.items) : undefined), [base, q.items]);
  const [view, setView] = useUrlParam<View>("view", VIEWS, "main");
  const [confirm, setConfirm] = useState<GateStep | null>(null);
  const [busy, setBusy] = useState(false);
  // The fixed next-step bar grows with its reason / "needs connection" text: the page keeps room
  // for all of it, so the last links can always be scrolled clear of it.
  const hasBar = !!m && !m.archivedAt;
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    ro.observe(el);
    setBarHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, [hasBar]);

  if (!m) {
    return (
      <div className="py-10 text-center text-[15px] text-slate-500">
        {isLoading || detailLoading ? "Loading…" : "Position not found (or not loaded while offline)."}
      </div>
    );
  }

  const archived = !!m.archivedAt;
  const queued = pendingStamps(q.items, m.id);
  const steps = gateSteps(m).filter((s) => !s.legacy);
  const next = steps.find((s) => s.state === "next" || s.state === "blocked");
  const out = isOutbound(m);
  const leg = m.transportLegs.find((l) => l.leg === (out ? "OUT" : "IN"));
  const phase = requiredSurveyPhase(m);
  const surveyDue = !!phase && surveyTargets(m).some((c) => !hasSurvey(m, c, phase));
  const releaseNeedsServer = (kind: GateStampKind) => !isQueueableStamp(m, kind);

  const pick = (step: GateStep) => {
    const info = stampPrecheck(m, step.kind, step.label, step.at, formatDateTime);
    if (info) return toast.info(info);
    if (step.state !== "next") return toast.info(step.reason);
    if (releaseNeedsServer(step.kind) && !q.online) return toast.warning(`${step.label} needs a connection — the release gates and the PIN are checked by the server`);
    setConfirm(step);
  };

  const doStamp = async (step: GateStep) => {
    setBusy(true);
    try {
      if (releaseNeedsServer(step.kind)) {
        // The WH release is the server's decision: sent now or not at all.
        try {
          const res = await api.warehouse.gateMovementStamp(m.id, { kind: step.kind, clientRequestId: uuid() });
          writeRow(res.movement);
          if (res.outcome === "stamped") toast.success(`${step.label} stamped`);
          else toast.info(res.notice || `${step.label} was already stamped`);
        } catch (e) {
          if (q.noteNetworkError(e)) toast.warning(`${step.label} needs a connection — not stamped. Try again when back online.`);
          else toast.error(errorMessage(e, `Failed to stamp ${step.label}`));
        }
        return;
      }
      const res = await q.submit({ kind: "stamp", movement: m, label: step.label, payload: { kind: step.kind } });
      if (res.type === "sent") {
        if (res.outcome === "stamped") toast.success(`${step.label} stamped`);
        else toast.info(res.notice || `${step.label} was already stamped`);
      } else if (res.type === "queued") toast.info(`${step.label} recorded at ${hhmm(res.recordedAt)} — waiting to send`);
      else toast.error(res.type === "refused" ? res.error : `Failed to stamp ${step.label}`);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const back = () => setView("main");
  if (view === "survey") return <FloorSurvey m={m} onBack={back} onRecordException={() => setView("damage")} />;
  if (view === "damage") return <FloorException m={m} onBack={back} />;
  if (view === "photos") return <FloorPhotos m={m} onBack={back} />;
  if (view === "pin") return <FloorPinCheck m={m} onBack={back} />;
  if (view === "release") return <FloorReadiness m={m} onBack={back} />;
  if (view === "reweigh") return <FloorReweigh m={m} onBack={back} />;

  const tile = (label: string, value: string) => (
    <div className="rounded-lg bg-slate-50 px-2 py-2 text-center">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-[18px] font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
  const reweighDue = m.needsReweigh && !m.reweigh;
  const menu: { key: View; label: string; hint?: string; alert?: boolean; show: boolean }[] = [
    {
      key: "reweigh",
      label: TERMS.reweigh,
      hint: m.reweigh
        ? `${nf(m.reweigh.weighedKg)} kg · ${formatDateTime(m.reweigh.weighedAt)}${m.reweigh.flagged ? " · variance" : ""}`
        : `Required before the ${out ? "tick-off" : "receipt"} (LCL)`,
      alert: reweighDue,
      show: m.needsReweigh || !!m.reweigh,
    },
    { key: "survey", label: "Survey", hint: phase ? `${phase === "release" ? "Release" : "Receipt"} pass${surveyDue ? " — missing" : " — done"}` : "After the gate-in", alert: surveyDue, show: true },
    { key: "photos", label: "Photos", show: true },
    { key: "damage", label: "Damage / short / over", hint: exceptionText(m) || undefined, alert: isOnHold(m), show: true },
    { key: "pin", label: TERMS.pickupPin, hint: m.pickup?.locked ? "Locked" : undefined, show: out && !!m.pickup },
    { key: "release", label: "Release readiness", show: out },
  ];

  return (
    <div className="flex flex-col gap-4">
      <FloorCard>
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{TERMS.warehouseRef}</div>
            <div className="break-all font-mono text-[22px] font-bold leading-tight text-slate-900">{m.positionRef || m.gateRef}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={STATUS_TONE[m.status] ?? ""} className="!text-[12px]">
              {m.status}
            </Badge>
            <LifecycleChip l={m.lifecycle} />
          </div>
        </div>
        <div className="mt-1 text-[15px] text-slate-800">{m.customer || "—"}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
          {m.jobNumber && (
            <span className="text-slate-600">
              {TERMS.jobNo} <span className="font-mono font-semibold text-slate-900">{m.jobNumber}</span>
            </span>
          )}
          <Badge tone={out ? "i" : "b"} className="!text-[12px]">
            {directionOfVisit(m.visit)}
          </Badge>
          <Badge tone={CUSTOMS_STATUS_TONE[m.customsStatus] ?? ""} className="!text-[12px]">
            {m.customsStatus || "Customs not set"}
          </Badge>
          {isOnHold(m) && (
            <Badge tone="r" className="!text-[12px]">
              {exceptionText(m)}
            </Badge>
          )}
          {archived && (
            <Badge tone="a" className="!text-[12px]">
              {TERMS.archived}
            </Badge>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {tile(TERMS.pieces, nf(m.colli))}
          {tile("Weight kg", nf(m.weightKg))}
          {tile("Volume cbm", nf(m.measureCbm, 1))}
        </div>
        <div className="mt-3 flex flex-col gap-1 text-[14px]">
          {m.dockSlots.length ? (
            m.dockSlots.map((s) => (
              <div key={s.id}>
                <span className="text-slate-500">Dock slot </span>
                <span className="font-semibold">{dockSlotText(s)}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-500">No dock slot booked</div>
          )}
          {(leg?.plate || m.plate) && (
            <div>
              <span className="text-slate-500">{TERMS.plate} </span>
              <span className="font-mono font-semibold">{leg?.plate || m.plate}</span>
              {(leg?.driver || m.driver) && <span className="text-slate-600"> · {leg?.driver || m.driver}</span>}
            </div>
          )}
        </div>
      </FloorCard>

      {m.container && (
        <Link
          href={`/warehouse/floor/container/${m.container.id}`}
          className="flex min-h-[56px] items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 active:bg-slate-50"
        >
          <span className="flex-1">
            <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Container · {m.container.status}</span>
            <span className="block font-mono text-[16px] font-bold text-slate-900">{m.container.number}</span>
            <span className="block text-[13px] text-slate-600">
              {m.container.kind === "export"
                ? m.container.stuffedAt
                  ? `Stuffed ${formatDateTime(m.container.stuffedAt)}`
                  : "Planned — not stuffed yet"
                : m.container.tallyOutcome
                  ? `${TALLY_LABEL[m.container.tallyOutcome] ?? m.container.tallyOutcome}${m.container.tickedAt ? ` ${formatDateTime(m.container.tickedAt)}` : ""}`
                  : "Not tallied yet"}
            </span>
          </span>
          <RightOutlined className="text-slate-400" />
        </Link>
      )}

      <FloorCard title="Gate steps">
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((s) => {
            const waiting = queued.includes(s.kind);
            return (
              <li key={s.kind} className="flex min-h-[44px] items-center gap-3">
                {s.state === "done" ? (
                  waiting ? (
                    <ClockCircleOutlined className="text-[20px] text-amber-500" />
                  ) : (
                    <CheckCircleFilled className="text-[20px] text-emerald-500" />
                  )
                ) : (
                  <span className={`h-5 w-5 rounded-full border-2 ${s.state === "next" ? "border-indigo-500" : "border-slate-300"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-[15px] font-semibold ${s.state === "later" ? "text-slate-400" : "text-slate-900"}`}>{s.label}</div>
                  {s.state === "done" && (
                    <div className="text-[13px] text-slate-500">
                      {formatDateTime(s.at)}
                      {waiting ? " · waiting to send" : s.by ? ` · ${s.by}` : ""}
                      {s.note ? ` · ${s.note}` : ""}
                    </div>
                  )}
                  {s.state === "blocked" && <div className="text-[13px] text-red-600">{s.reason}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      </FloorCard>

      <nav className="flex flex-col gap-2" aria-label="Position tasks">
        {menu
          .filter((x) => x.show)
          .map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => setView(x.key)}
              className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left cursor-pointer active:bg-slate-50"
            >
              <span className="flex-1">
                <span className={`block text-[16px] font-semibold ${x.alert ? "text-red-600" : "text-slate-900"}`}>
                  {x.label}
                  {x.alert ? " !" : ""}
                </span>
                {x.hint && <span className="block text-[13px] text-slate-500">{x.hint}</span>}
              </span>
              <RightOutlined className="text-slate-400" />
            </button>
          ))}
        <Link
          href={`/warehouse/gate-log/${m.id}`}
          className="flex min-h-[48px] items-center justify-center rounded-xl text-[15px] font-semibold text-indigo-600 underline"
        >
          Open full gate job
        </Link>
      </nav>

      {/* Room for the bar beyond the frame's own bottom padding (112 px). */}
      {!archived && barHeight > 96 && <div aria-hidden style={{ height: barHeight - 96 }} />}

      {/* The next step, at the thumb. */}
      {!archived && (
        <div ref={barRef} className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto max-w-[560px]">
            {next ? (
              <>
                {next.state === "blocked" && <div className="mb-2 text-[13px] font-semibold text-red-600">{next.reason}</div>}
                {next.state === "blocked" && next.needs === "reweigh" ? (
                  <button type="button" className={bigPrimary} onClick={() => setView("reweigh")}>
                    {TERMS.reweigh}
                  </button>
                ) : next.state === "blocked" && (next.needs === "tally" || next.needs === "container") && m.container ? (
                  <Link href={`/warehouse/floor/container/${m.container.id}`} className={`${bigPrimary} flex items-center justify-center`}>
                    Open container {m.container.number}
                  </Link>
                ) : (
                  <>
                    {next.state === "next" && releaseNeedsServer(next.kind) && !q.online && (
                      <div className="mb-2">
                        <NeedsConnection what={next.label} />
                      </div>
                    )}
                    <button
                      type="button"
                      className={bigPrimary}
                      disabled={next.state !== "next" || busy || (releaseNeedsServer(next.kind) && !q.online)}
                      onClick={() => pick(next)}
                    >
                      {next.label}
                    </button>
                  </>
                )}
              </>
            ) : (
              <div className="min-h-[56px] rounded-xl bg-emerald-50 px-4 py-4 text-center text-[16px] font-bold text-emerald-700">All gate steps done</div>
            )}
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmModal
          open
          onClose={() => setConfirm(null)}
          onConfirm={() => doStamp(confirm)}
          title={confirm.label}
          description={`${stampConfirmText(m, confirm.kind, confirm.label)}${
            q.online ? "" : ` No connection — it will be sent when the phone is back online, with the time now (${hhmm(new Date().toISOString())}).`
          }`}
          confirmLabel={confirm.label}
          loading={busy}
        />
      )}
    </div>
  );
}
