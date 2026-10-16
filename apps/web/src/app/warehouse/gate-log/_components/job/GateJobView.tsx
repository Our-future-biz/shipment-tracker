"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Dropdown, Spin, Tabs, Tag, Tooltip } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, DownOutlined, PrinterOutlined, ReloadOutlined, RightOutlined } from "@ant-design/icons";
import { useGateMovement, type GateMovement, type GateStampKind } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatDateTime } from "@/lib/date";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { controllers } from "@/lib/api/client";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { useUrlParam } from "@/app/warehouse/_lib/useUrlParam";
import { positionRemeasurementHref } from "@/app/warehouse/_components/remeasurementLinks";
import { freeTimeText, storageHint } from "@/app/warehouse/_lib/storageText";
import { CustomsDeadlineChip } from "@/app/warehouse/_lib/customsDeadline";
import { movementCustomsClock } from "@/app/warehouse/_lib/customsClock";
import { dockSlotText } from "@/app/warehouse/_lib/worklist";
import { errorMessage, hasAnyStamp, hasSurvey, isManager, nf, requiredSurveyPhase, surveyTargets } from "../../_lib/gate";
import { cargoLeg, gateSteps, isOutbound, stampConfirmText, stampPrecheck, voidBlocked, voidsGateOutToo, type GateStep } from "../../_lib/steps";
import { PrintLabelsModal } from "../PrintLabelsModal";
import { btnDefault, btnPrimary } from "./fields";
import { OverviewTab } from "./OverviewTab";
import { SurveyTab } from "./SurveyTab";
import { ShipmentManagementTab } from "./ShipmentManagementTab";
import { ReasonModal } from "./ReleaseGatesPanel";
import { HistoryTab } from "./HistoryTab";
import { ReweighModal } from "./ReweighSection";
import { LifecycleStrip } from "@/app/warehouse/_components/LifecycleStrip";

// The job's tab lives in the URL (?tab=survey), so refresh, Back and shared links keep it.
const TABS = ["overview", "survey", "shipman", "history"] as const;
type Tab = (typeof TABS)[number];
// The Gate Log list, now a tab of the Warehouse page.
const GATE_LOG_HREF = "/warehouse?tab=gatelog";

const cardLabel = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";
/** Dock & Yard → Dock Schedule with the booking form open for this position. */
export const dockBookingHref = (movementId: string) => `/warehouse?tab=dock&book=${encodeURIComponent(movementId)}`;

// Status cards under the header: customs status, storage (the warehouse's one storage clock:
// days in the warehouse, free days left or chargeable, estimated charge) and the vehicle at the
// gate — the incoming truck (IN leg) for inbound cargo, the outgoing one (OUT leg) for outbound.
function StatusCards({ m, onRefreshCustoms, refreshing }: { m: GateMovement; onRefreshCustoms?: () => void; refreshing?: boolean }) {
  const s = m.storage;
  const storage = !s.started
    ? {
        value: "—",
        tone: "text-slate-400",
        sub: !isOutbound(m)
          ? "Not started — starts at the gate-in"
          : m.container?.tallyRequired
            ? `Not started — starts at the tick-off in container ${m.container.number}`
            : "Not started — set “Received in warehouse” on Overview",
      }
    : s.chargeableDays > 0
      ? { value: `+${s.chargeableDays}`, tone: "text-red-600", sub: `Day ${s.daysInWarehouse} · ${freeTimeText(s)} · est. CZK ${nf(s.estimatedCzk)}` }
      : { value: String(s.freeDaysLeft), tone: s.state === "Expiring" ? "text-amber-600" : "text-emerald-600", sub: `Day ${s.daysInWarehouse} · ${freeTimeText(s)}` };

  // The truck the cargo moves on now: Domestic cargo leaves on its OUT leg once it has arrived.
  const out = cargoLeg(m) === "OUT";
  const leg = m.transportLegs.find((l) => l.leg === cargoLeg(m));
  const driver = leg?.driver || m.driver;
  const plate = leg?.plate || m.plate;
  const stampAt = out ? m.gateOut : m.gateIn;
  const gateTime = leg?.gateTime ? formatDateTime(leg.gateTime) : stampAt ? formatDateTime(stampAt) : "";

  const card = "bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 min-w-0";
  const line = (k: string, v: string, mono = false) => (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-slate-500 shrink-0">{k}</span>
      <span className={`ml-auto text-right font-semibold text-slate-900 break-words ${mono ? "font-mono" : ""}`}>{v || "—"}</span>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
      <div className={card}>
        <div className="flex items-center gap-2">
          <span className={cardLabel}>Customs status</span>
          {onRefreshCustoms && (
            <Tooltip title="Read the customs status from the shipment now">
              <button
                type="button"
                aria-label="Read the customs status from the shipment now"
                className="ml-auto text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-0"
                onClick={onRefreshCustoms}
                disabled={refreshing}
              >
                <ReloadOutlined spin={refreshing} />
              </button>
            </Tooltip>
          )}
        </div>
        <div className="mt-1.5 text-[15px] font-bold leading-snug text-slate-900 break-words">{m.customsStatus || "Not set"}</div>
        {/* Under customs control: days since the receipt and the 90-day deadline (UCC art. 149). */}
        {movementCustomsClock(m).state !== "none" && (
          <div className="mt-1">
            <CustomsDeadlineChip clock={movementCustomsClock(m)} empty="" />
          </div>
        )}
        {/* A linked record follows its shipment's customs status until the cargo is released. */}
        {m.shipmentId && !m.impRelease && (
          <div className="mt-0.5 text-[11px] text-slate-500">
            Follows the shipment{m.shipmentCheckedAt ? ` · read ${formatDateTime(m.shipmentCheckedAt)}` : ""}
          </div>
        )}
      </div>
      <Tooltip title={storageHint(s)}>
        <div className={card}>
          <div className={cardLabel}>Storage{s.stopped ? " · stopped" : ""}</div>
          <div className={`mt-1 text-[26px] leading-tight font-bold font-mono ${storage.tone}`}>{storage.value}</div>
          <div className="text-[11px] text-slate-500">{storage.sub}</div>
        </div>
      </Tooltip>
      <div className={card}>
        <div className={cardLabel}>Vehicle · {out ? "outgoing truck" : "incoming truck"}</div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {line(TERMS.driver, driver)}
          {line(TERMS.plate, plate, true)}
          {line(out ? "Gate-out time" : "Gate-in time", gateTime, true)}
          {/* Dock slots booked for this position in Dock & Yard. */}
          {m.dockSlots.map((d) => (
            <Fragment key={d.id}>{line("Dock slot", dockSlotText(d))}</Fragment>
          ))}
          {!m.archivedAt && (
            <Link href={dockBookingHref(m.id)} className="self-end text-[11px] font-semibold text-indigo-500 hover:underline">
              {m.dockSlots.length ? "Book another dock slot" : "Book dock slot"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// One step of the gate action bar: a green tag (time + user) once stamped; otherwise a button,
// primary for the next step and disabled with the reason for the others.
// Managers can void a done step (with a reason) from its menu; `voidReason` says why not, when blocked.
function StepItem({ step, onPick, onVoid, voidReason }: { step: GateStep; onPick: () => void; onVoid?: () => void; voidReason?: string | null }) {
  if (step.state === "done") {
    const tag = (
      <Tag
        color={step.legacy ? "default" : "success"}
        icon={step.legacy ? undefined : <CheckCircleOutlined />}
        className={`m-0 !px-2 !py-1 !text-[12px] ${step.legacy ? "opacity-70" : ""} ${onVoid ? "cursor-pointer" : ""}`}
      >
        <span className="font-semibold">{step.label}</span> <span className="font-mono">{formatDateTime(step.at)}</span>
        {step.by ? ` · ${step.by}` : ""}
        {onVoid && <DownOutlined className="ml-1 text-[9px]" />}
      </Tag>
    );
    if (!onVoid) return <Tooltip title={step.note}>{tag}</Tooltip>;
    return (
      <Dropdown
        trigger={["click"]}
        menu={{
          items: [
            {
              key: "void",
              danger: true,
              disabled: !!voidReason,
              label: voidReason ? <Tooltip title={voidReason}>Void this stamp…</Tooltip> : "Void this stamp…",
              onClick: onVoid,
            },
          ],
        }}
      >
        <span className="inline-flex" title={step.note}>
          {tag}
        </span>
      </Dropdown>
    );
  }
  const next = step.state === "next";
  return (
    <Tooltip title={next ? undefined : step.reason}>
      {/* A disabled button gets no mouse events; the wrapper keeps the tooltip working. */}
      <span className="inline-flex">
        <button
          type="button"
          className={next ? btnPrimary : btnDefault}
          disabled={!next}
          aria-label={next ? undefined : `${step.label} — ${step.reason}`}
          onClick={onPick}
        >
          {step.label}
        </button>
      </span>
    </Tooltip>
  );
}

// Gate log job — the one page of a position: header with the gate steps, status cards, and the
// Overview, Survey and Shipment Management tabs. Fields save as you leave them.
export function GateJobView({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const {
    movement: m,
    isLoading,
    update,
    stamp,
    requestRelease,
    requestMrn,
    refuse,
    override,
    setReleaseGate,
    verifyPin,
    saveSurvey,
    remove,
    archive,
    restore,
    voidStamp,
    refreshCustoms,
    refreshFromShipment,
    retryShipmentUpdate,
    dismissShipmentUpdate,
  } = useGateMovement(id);
  const { user } = useAuth();
  const manager = isManager(user);
  const [tab, setTab] = useUrlParam<Tab>("tab", TABS, "overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dialog, setDialog] = useState<"archive" | "restore" | null>(null);
  const [voidStep, setVoidStep] = useState<GateStep | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmStamp, setConfirmStamp] = useState<{ kind: GateStampKind; label: string } | null>(null);
  const [reweighOpen, setReweighOpen] = useState(false);
  const [linkChange, setLinkChange] = useState<controllers.GateMovementUpdateRequest | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!m) {
    return (
      <div className="p-10 text-center text-slate-500">
        Movement not found.{" "}
        <Link href={GATE_LOG_HREF} className="text-indigo-500">
          Back to Gate Log
        </Link>
      </div>
    );
  }

  // The direction (visit / handling) or the position link of a record linked to a shipment decides
  // the pick-up PIN and what the shipment is told: the server takes a change only from a manager,
  // with a logged reason.
  const changesLink = (data: controllers.GateMovementUpdateRequest) =>
    !!m.shipmentId &&
    ((data.visit !== undefined && data.visit !== m.visit) ||
      (data.handling !== undefined && data.handling !== m.handling) ||
      (data.warehouseTaskId !== undefined && data.warehouseTaskId !== m.warehouseTaskId));
  const save = (data: controllers.GateMovementUpdateRequest) => {
    if (changesLink(data)) {
      if (!manager) {
        toast.error("This record is linked to a shipment — only a manager can change its direction or position, with a reason.");
        return Promise.resolve();
      }
      setLinkChange(data);
      return Promise.resolve();
    }
    return update.mutateAsync(data).catch((e) => toast.error(errorMessage(e, "Failed to save")));
  };

  // Stamps are final, so each one is confirmed first (as in the Gate Log bulk bar).
  const pickStamp = (kind: GateStampKind, label: string, at: string | null) => {
    // An already stamped movement is not an error — the stamp is final, so just say so.
    const info = stampPrecheck(m, kind, label, at, formatDateTime);
    if (info) {
      toast.info(info);
      return;
    }
    setConfirmStamp({ kind, label });
  };
  const doStamp = async (kind: GateStampKind, label: string) => {
    try {
      await stamp.mutateAsync(kind);
      toast.success(`${label} stamped`);
    } catch (e) {
      toast.error(errorMessage(e, `Failed to stamp ${label}`));
    } finally {
      setConfirmStamp(null);
    }
  };

  // Survey is flagged red while a container (or the position) still lacks the survey pass due
  // now, and ticked green once all are done; nothing is shown before the cargo arrives.
  const surveyPhase = requiredSurveyPhase(m);
  const surveyDone = surveyPhase ? surveyTargets(m).every((c) => hasSurvey(m, c, surveyPhase)) : null;
  const tabs: { key: Tab; label: string; count?: number; alert?: boolean; done?: boolean }[] = [
    { key: "overview", label: "Overview" },
    { key: "survey", label: "Survey", count: m.containers.length || undefined, alert: surveyDone === false, done: surveyDone === true },
    { key: "shipman", label: "Shipment Management" },
    { key: "history", label: "History", count: m.events.length || undefined },
  ];

  const archived = !!m.archivedAt;
  const stamped = hasAnyStamp(m);
  const doVoid = async (step: GateStep, reason: string) => {
    try {
      const res = await voidStamp.mutateAsync({ kind: step.kind, reason });
      toast.success(`${step.label} voided — logged on the movement`);
      if (res.notice) toast.notify({ type: "warning", title: "Shipment may need correcting", description: res.notice });
    } catch (e) {
      toast.error(errorMessage(e, "Failed to void the stamp"));
      throw e;
    }
  };
  const doRefreshFromShipment = async () => {
    try {
      const res = await refreshFromShipment.mutateAsync();
      if (res.changed.length) toast.success(`Refreshed from the shipment: ${res.changed.join(", ")}`);
      else if (!res.differs.length) toast.info("Already the same as the shipment — nothing changed");
      // Values the gate may have corrected are kept on a stamped record; the user sees the difference.
      if (res.differs.length) toast.warning(`Kept the gate's values (they differ from the shipment): ${res.differs.join("; ")}`);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to refresh from the shipment"));
    }
  };
  const actionItems = [
    ...(m.shipmentId ? [{ key: "refresh", label: "Refresh from shipment", onClick: doRefreshFromShipment }] : []),
    stamped
      ? {
          key: "archive",
          danger: true,
          disabled: !manager,
          label: manager ? "Archive…" : <Tooltip title="This record has gate stamps — only a manager can archive it, with a reason">Archive…</Tooltip>,
          onClick: () => setDialog("archive"),
        }
      : { key: "delete", label: "Delete", danger: true, onClick: () => setDeleteOpen(true) },
  ];
  const upd = m.shipmentUpdate;

  const steps = gateSteps(m);
  // An archived record shows only what was stamped; nothing is stamped on it.
  const mainSteps = steps.filter((x) => !x.legacy && (!archived || x.state === "done"));
  const legacySteps = steps.filter((x) => x.legacy);

  return (
    <div className="bg-slate-50 min-h-full">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-6 pt-4 pb-0">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex items-start gap-2 flex-1 min-w-[240px]">
            <button
              onClick={() => router.push(GATE_LOG_HREF)}
              aria-label="Back to Gate Log"
              className="mt-1 text-slate-400 hover:text-indigo-500 cursor-pointer bg-transparent border-none p-1"
            >
              <ArrowLeftOutlined />
            </button>
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold text-slate-800 m-0 font-mono">{m.gateRef}</h1>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-slate-500 mt-0.5">
                <span>
                  Customer <span className="font-semibold text-slate-800">{m.customer || "—"}</span>
                </span>
                {/* The shipment it came from: its job, and its warehouse part (Remeasurement / Release). */}
                {m.jobNumber && (
                  <span>
                    {TERMS.jobNo}{" "}
                    {m.shipmentId ? (
                      <Link href={`/shipments/${m.shipmentId}`} className="font-mono font-semibold text-indigo-500 hover:underline">
                        {m.jobNumber}
                      </Link>
                    ) : (
                      <span className="font-mono font-semibold text-slate-800">{m.jobNumber}</span>
                    )}
                  </span>
                )}
                {/* Every position — linked or stand-alone — has its Shipment Details (Remeasurement / Release). */}
                {m.warehouseTaskId && (
                  <Link href={positionRemeasurementHref(m.warehouseTaskId)} className="font-semibold text-indigo-500 hover:underline">
                    Shipment Details
                  </Link>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            {/* Gate steps in process order for this direction; only the next one is primary. */}
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Gate steps">
              {mainSteps.map((x, i) => (
                <Fragment key={x.kind}>
                  {i > 0 && <RightOutlined className="text-[10px] text-slate-300" aria-hidden />}
                  <StepItem
                    step={x}
                    onPick={() => (archived ? undefined : pickStamp(x.kind, x.label, x.at))}
                    onVoid={manager && !archived ? () => setVoidStep(x) : undefined}
                    voidReason={voidBlocked(m, x.kind)}
                  />
                </Fragment>
              ))}
              {/* LCL cargo is re-weighed before the receipt: offered right where the step waits for it. */}
              {!archived && mainSteps.some((x) => x.state === "blocked" && x.needs === "reweigh") && (
                <button type="button" className={btnPrimary} onClick={() => setReweighOpen(true)}>
                  Re-weigh
                </button>
              )}
              {!archived && m.container && mainSteps.some((x) => x.state === "blocked" && (x.needs === "tally" || x.needs === "container")) && (
                <Link href={`/warehouse/containers/${m.container.id}`} className={btnDefault}>
                  Container {m.container.number}
                </Link>
              )}
              {legacySteps.map((x) => (
                <StepItem
                  key={x.kind}
                  step={x}
                  onPick={() => undefined}
                  onVoid={manager && !archived ? () => setVoidStep(x) : undefined}
                  voidReason={voidBlocked(m, x.kind)}
                />
              ))}
            </div>
            <button type="button" className={btnDefault} onClick={() => setPrintOpen(true)}>
              <PrinterOutlined /> Print labels
            </button>
            {archived ? (
              manager && (
                <button type="button" className={btnDefault} onClick={() => setDialog("restore")}>
                  Restore…
                </button>
              )
            ) : (
              <Dropdown trigger={["click"]} menu={{ items: actionItems }}>
                <button type="button" className={btnDefault}>
                  Actions <DownOutlined className="text-[10px]" />
                </button>
              </Dropdown>
            )}
          </div>
        </div>

        {archived && (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={
              m.archiveReason
                ? `Archived ${formatDateTime(m.archivedAt)}${m.archivedBy ? ` by ${m.archivedBy}` : ""} — ${m.archiveReason}`
                : `Deleted ${formatDateTime(m.archivedAt)}, before archiving existed`
            }
            description={manager ? "Archived records are kept and can be restored. Nothing can be changed here until then." : "Archived records are kept; a manager can restore it. Nothing can be changed here."}
          />
        )}
        {!archived && upd && (
          <Alert
            className="mt-3"
            type={upd.state === "failed" ? "error" : "warning"}
            showIcon
            message={
              upd.state === "pending"
                ? `Shipment not updated yet — retrying (${upd.what.join(", ") || "warehouse dates"})`
                : `Shipment not updated (${upd.what.join(", ") || "warehouse dates"}) — set it in Shipments by hand`
            }
            description={
              [
                upd.lastError ? `Last error: ${upd.lastError}` : "",
                upd.state === "pending" && upd.nextAttemptAt ? `Next try ${formatDateTime(upd.nextAttemptAt)}` : "",
                upd.attempts ? `${upd.attempts} ${upd.attempts === 1 ? "try" : "tries"} so far` : "",
              ]
                .filter(Boolean)
                .join(" · ") || undefined
            }
            action={
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  className={btnDefault}
                  disabled={retryShipmentUpdate.isPending}
                  onClick={() =>
                    retryShipmentUpdate
                      .mutateAsync()
                      .then((res) => (res.movement.shipmentUpdate ? toast.info("Still not updated — it keeps retrying") : toast.success("Shipment updated")))
                      .catch((e) => toast.error(errorMessage(e, "Failed to retry")))
                  }
                >
                  Retry now
                </button>
                {upd.state === "failed" && (
                  <button
                    type="button"
                    className={btnDefault}
                    disabled={dismissShipmentUpdate.isPending}
                    title="Use once the shipment was set in Shipments by hand"
                    onClick={() =>
                      dismissShipmentUpdate
                        .mutateAsync()
                        .then(() => toast.success("Dismissed — logged on the movement"))
                        .catch((e) => toast.error(errorMessage(e, "Failed to dismiss")))
                    }
                  >
                    Set by hand — dismiss
                  </button>
                )}
              </div>
            }
          />
        )}

        <div className="mt-3">
          <LifecycleStrip l={m.lifecycle} />
        </div>

        <StatusCards
          m={m}
          refreshing={refreshCustoms.isPending}
          onRefreshCustoms={
            m.shipmentId && !m.impRelease && !archived
              ? () => refreshCustoms.mutateAsync().catch((e) => toast.error(errorMessage(e, "Failed to read the shipment")))
              : undefined
          }
        />

        {/* Tabs */}
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          className="mt-4 [&_.ant-tabs-nav::before]:!border-b-0"
          tabBarStyle={{ marginBottom: 0 }}
          items={tabs.map((t) => ({
            key: t.key,
            label: (
              <span className={t.alert ? "text-red-600" : undefined}>
                {t.label}
                {t.alert && (
                  <span className="ml-1 font-bold text-red-600" title="Survey missing" aria-label="Survey missing">
                    !
                  </span>
                )}
                {t.done && (
                  <span className="ml-1 font-bold text-emerald-600" title="Surveys done" aria-label="Surveys done">
                    ✓
                  </span>
                )}
                {t.count ? (
                  <span className={`ml-1.5 rounded-full px-1.5 text-[11px] font-semibold ${tab === t.key ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-500"}`}>
                    {t.count}
                  </span>
                ) : null}
              </span>
            ),
          }))}
        />
      </div>

      {/* ── Tab content ── */}
      {/* An archived record is shown as it was; nothing on it can be changed until it is restored. */}
      {/* History stays readable and filterable on an archived record. */}
      <div className={`p-6 ${archived && tab !== "history" ? "opacity-70" : ""}`} inert={archived && tab !== "history"}>
        {tab === "overview" && (
          <OverviewTab
            m={m}
            save={save}
            saving={update.isPending}
            requestRelease={() =>
              requestRelease
                .mutateAsync()
                .then(() => toast.success("Release requested — logged on the movement"))
                .catch((e) => toast.error(errorMessage(e, "Failed to ask for release")))
            }
            requesting={requestRelease.isPending}
            requestMrn={() =>
              requestMrn
                .mutateAsync()
                .then(() => toast.success("MRN requested — logged on the movement"))
                .catch((e) => toast.error(errorMessage(e, "Failed to ask for the MRN")))
            }
            requestingMrn={requestMrn.isPending}
            refuse={(reason) =>
              refuse
                .mutateAsync(reason)
                .then(() => toast.success("Refused — logged on the movement"))
                .catch((e) => {
                  toast.error(errorMessage(e, "Failed to refuse"));
                  throw e;
                })
            }
            override={(reason) =>
              override
                .mutateAsync(reason)
                .then(() => toast.success(`${TERMS.releaseGates} cleared by supervisor override — logged on the movement`))
                .catch((e) => {
                  toast.error(errorMessage(e, "Failed to override"));
                  throw e;
                })
            }
            setReleaseGate={(gate, ok) =>
              setReleaseGate
                .mutateAsync({ gate, ok })
                .then(() => toast.success(ok ? `${gate}: OK — logged on the movement` : `${gate}: back to Pending — logged on the movement`))
                .catch((e) => toast.error(errorMessage(e, "Failed to change the release gate")))
            }
            verifyPin={(pin) =>
              verifyPin.mutateAsync(pin).catch((e) => {
                toast.error(errorMessage(e, "Failed to check the PIN"));
                throw e;
              })
            }
          />
        )}
        {tab === "survey" && <SurveyTab m={m} saveSurvey={(survey) => saveSurvey.mutateAsync(survey)} />}
        {tab === "shipman" && <ShipmentManagementTab m={m} save={save} />}
        {tab === "history" && <HistoryTab m={m} onVoid={manager && !archived ? setVoidStep : undefined} />}
      </div>

      {confirmStamp && (
        <ConfirmModal
          open
          onClose={() => setConfirmStamp(null)}
          onConfirm={() => doStamp(confirmStamp.kind, confirmStamp.label)}
          title={confirmStamp.label}
          description={stampConfirmText(m, confirmStamp.kind, confirmStamp.label)}
          confirmLabel={confirmStamp.label}
          loading={stamp.isPending}
        />
      )}

      <PrintLabelsModal open={printOpen} movements={[m]} onClose={() => setPrintOpen(false)} />
      <ReweighModal open={reweighOpen} movementId={m.id} label={m.gateRef} declaredKg={m.weightKg} onClose={() => setReweighOpen(false)} />

      <ReasonModal
        open={!!linkChange}
        title="Change a shipment-linked record"
        hint={`${m.gateRef} is linked to shipment ${m.jobNumber || ""}. Changing its direction or position changes the pick-up PIN check and what the shipment is told. Who, when and the reason are logged.`}
        okText="Change"
        danger
        onClose={() => setLinkChange(null)}
        onSubmit={(reason) =>
          update
            .mutateAsync({ ...linkChange!, linkChangeReason: reason })
            .then(() => setLinkChange(null))
            .catch((e) => toast.error(errorMessage(e, "Failed to save")))
        }
      />
      <ReasonModal
        open={!!voidStep}
        title={`Void ${voidStep?.label ?? "stamp"}`}
        hint={`Clears the ${voidStep?.label ?? ""} stamp on ${m.gateRef}; the status follows the stamps that remain. Who, when, the old stamp and the reason are logged.`}
        okText="Void stamp"
        danger
        onClose={() => setVoidStep(null)}
        onSubmit={(reason) => doVoid(voidStep!, reason)}
      >
        {voidStep && voidsGateOutToo(m, voidStep.kind) && (
          <p className="text-xs text-amber-700 mt-0">The {TERMS.gateOut} stamped with it is voided too.</p>
        )}
        {m.shipmentId && (
          <p className="text-xs text-amber-700 mt-0">The shipment is not changed back — correct it in Shipments if needed.</p>
        )}
      </ReasonModal>
      <ReasonModal
        open={dialog === "archive"}
        title="Archive record"
        hint={`${m.gateRef} leaves the Gate Log but is kept, with who, when and the reason; a manager can restore it. Its position is not removed.`}
        okText="Archive"
        danger
        onClose={() => setDialog(null)}
        onSubmit={(reason) =>
          archive
            .mutateAsync(reason)
            .then(() => toast.success("Archived — logged on the movement"))
            .catch((e) => {
              toast.error(errorMessage(e, "Failed to archive"));
              throw e;
            })
        }
      />
      <ReasonModal
        open={dialog === "restore"}
        title="Restore record"
        hint={`${m.gateRef} comes back to the Gate Log (with its position, if that was removed with it). The reason is logged.`}
        okText="Restore"
        onClose={() => setDialog(null)}
        onSubmit={(reason) =>
          restore
            .mutateAsync(reason)
            .then(() => toast.success("Restored — logged on the movement"))
            .catch((e) => {
              toast.error(errorMessage(e, "Failed to restore"));
              throw e;
            })
        }
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          try {
            await remove.mutateAsync();
            toast.success("Movement deleted");
            router.push(GATE_LOG_HREF);
          } catch (e) {
            toast.error(errorMessage(e, "Failed to delete"));
          }
        }}
        title="Delete movement"
        description={`Delete gate movement ${m.gateRef}? It has no gate stamps. It is archived, not erased, and a manager can restore it.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
