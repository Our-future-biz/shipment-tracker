"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown, Spin, Tabs, Tag, Tooltip } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, DownOutlined, PrinterOutlined, RightOutlined } from "@ant-design/icons";
import { useGateMovement, type GateMovement, type GateStampKind } from "@/hooks/useGateLog";
import { useToast } from "@/lib/toast";
import { formatDateTime } from "@/lib/date";
import { ConfirmModal } from "@/components/ConfirmModal";
import type { controllers } from "@/lib/api/client";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { useUrlParam } from "@/app/warehouse/_lib/useUrlParam";
import { remeasurementHref } from "@/app/warehouse/_components/remeasurementLinks";
import { errorMessage, freeDaysOver, hasSurvey, requiredSurveyPhase, surveyTargets } from "../../_lib/gate";
import { gateSteps, isOutbound, type GateStep } from "../../_lib/steps";
import { PrintLabelsModal } from "../PrintLabelsModal";
import { btnDefault, btnPrimary } from "./fields";
import { OverviewTab } from "./OverviewTab";
import { SurveyTab } from "./SurveyTab";
import { ShipmentManagementTab } from "./ShipmentManagementTab";

// The job's tab lives in the URL (?tab=survey), so refresh, Back and shared links keep it.
const TABS = ["overview", "survey", "shipman"] as const;
type Tab = (typeof TABS)[number];
// The Gate Log list, now a tab of the Warehouse page.
const GATE_LOG_HREF = "/warehouse?tab=gatelog";

const cardLabel = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

// Status cards under the header: customs status, storage (free days left) and the vehicle at the
// gate — the incoming truck (IN leg) for inbound cargo, the outgoing one (OUT leg) for outbound.
function StatusCards({ m }: { m: GateMovement }) {
  const over = freeDaysOver(m.loadInDate, m.freeDays);
  const storage =
    over == null
      ? { value: m.freeDays == null ? "—" : String(m.freeDays), tone: "text-slate-900", hint: "Free storage days — set the load-in date to count down" }
      : over > 0
        ? { value: `+${over}`, tone: "text-red-600", hint: `${over} chargeable day${over === 1 ? "" : "s"} past free storage` }
        : { value: String(-over), tone: -over <= 3 ? "text-amber-600" : "text-emerald-600", hint: `${-over} free storage day${over === -1 ? "" : "s"} left` };

  const out = isOutbound(m);
  const leg = m.transportLegs.find((l) => l.leg === (out ? "OUT" : "IN"));
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
        <div className={cardLabel}>Customs status</div>
        <div className="mt-1.5 text-[15px] font-bold leading-snug text-slate-900 break-words">{m.customsStatus || "Not set"}</div>
      </div>
      <Tooltip title={storage.hint}>
        <div className={card}>
          <div className={cardLabel}>Storage</div>
          <div className={`mt-1 text-[26px] leading-tight font-bold font-mono ${storage.tone}`}>{storage.value}</div>
        </div>
      </Tooltip>
      <div className={card}>
        <div className={cardLabel}>Vehicle · {out ? "outgoing truck" : "incoming truck"}</div>
        <div className="mt-1.5 flex flex-col gap-0.5">
          {line(TERMS.driver, driver)}
          {line(TERMS.plate, plate, true)}
          {line(out ? "Gate-out time" : "Gate-in time", gateTime, true)}
        </div>
      </div>
    </div>
  );
}

// One step of the gate action bar: a green tag (time + user) once stamped; otherwise a button,
// primary for the next step and disabled with the reason for the others.
function StepItem({ step, onPick }: { step: GateStep; onPick: () => void }) {
  if (step.state === "done") {
    return (
      <Tooltip title={step.note}>
        <Tag
          color={step.legacy ? "default" : "success"}
          icon={step.legacy ? undefined : <CheckCircleOutlined />}
          className={`m-0 !px-2 !py-1 !text-[12px] ${step.legacy ? "opacity-70" : ""}`}
        >
          <span className="font-semibold">{step.label}</span> <span className="font-mono">{formatDateTime(step.at)}</span>
          {step.by ? ` · ${step.by}` : ""}
        </Tag>
      </Tooltip>
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
  const { movement: m, isLoading, update, stamp, requestRelease, requestMrn, refuse, override, setReleaseGate, verifyPin, saveSurvey, remove } = useGateMovement(id);
  const [tab, setTab] = useUrlParam<Tab>("tab", TABS, "overview");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [confirmStamp, setConfirmStamp] = useState<{ kind: GateStampKind; label: string } | null>(null);

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

  const save = (data: Omit<controllers.GateMovementUpdateRequest, "id">) =>
    update.mutateAsync(data).catch((e) => toast.error(errorMessage(e, "Failed to save")));

  // Stamps are final, so each one is confirmed first (as in the Gate Log bulk bar).
  const pickStamp = (kind: GateStampKind, label: string, at: string | null) => {
    // An already stamped movement is not an error — the stamp is final, so just say so.
    if (at) {
      toast.info(`${label} was already stamped ${formatDateTime(at)}`);
      return;
    }
    if (kind === "gateOut" && isOutbound(m) && !m.impRelease) {
      toast.info(`Outbound cargo leaves through ${TERMS.whRelease} — it stamps the gate-out too.`);
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
  // What the stamp writes to the linked shipment, for the confirmation text.
  // Only inbound arrival is a receipt; an outbound gate-in is the pickup truck.
  const writesBack = (kind: GateStampKind) =>
    !isOutbound(m) && (kind === "gateIn" || ((kind === "expDraft" || kind === "expReceipt") && !m.gateIn))
      ? "received date"
      : kind === "impRelease" || (kind === "gateOut" && isOutbound(m))
        ? "released date and plate"
        : null;

  // Survey is flagged red while a container (or the position) still lacks the survey pass due
  // now, and ticked green once all are done; nothing is shown before the cargo arrives.
  const surveyPhase = requiredSurveyPhase(m);
  const surveyDone = surveyPhase ? surveyTargets(m).every((c) => hasSurvey(m, c, surveyPhase)) : null;
  const tabs: { key: Tab; label: string; count?: number; alert?: boolean; done?: boolean }[] = [
    { key: "overview", label: "Overview" },
    { key: "survey", label: "Survey", count: m.containers.length || undefined, alert: surveyDone === false, done: surveyDone === true },
    { key: "shipman", label: "Shipment Management" },
  ];

  const steps = gateSteps(m);
  const mainSteps = steps.filter((x) => !x.legacy);
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
                {m.shipmentId && (
                  <Link href={remeasurementHref(m.shipmentId)} className="font-semibold text-indigo-500 hover:underline">
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
                  <StepItem step={x} onPick={() => pickStamp(x.kind, x.label, x.at)} />
                </Fragment>
              ))}
              {legacySteps.map((x) => (
                <StepItem key={x.kind} step={x} onPick={() => undefined} />
              ))}
            </div>
            <button type="button" className={btnDefault} onClick={() => setPrintOpen(true)}>
              <PrinterOutlined /> Print labels
            </button>
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "delete", label: "Delete", danger: true, onClick: () => setDeleteOpen(true) },
                ],
              }}
            >
              <button type="button" className={btnDefault}>
                Actions <DownOutlined className="text-[10px]" />
              </button>
            </Dropdown>
          </div>
        </div>

        <StatusCards m={m} />

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
      <div className="p-6">
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
      </div>

      {confirmStamp && (
        <ConfirmModal
          open
          onClose={() => setConfirmStamp(null)}
          onConfirm={() => doStamp(confirmStamp.kind, confirmStamp.label)}
          title={confirmStamp.label}
          description={`Stamp the ${confirmStamp.label} on ${m.gateRef}? The stamp cannot be taken back${
            writesBack(confirmStamp.kind) ? ` and sets the linked shipment's ${writesBack(confirmStamp.kind)} (if any)` : ""
          }.`}
          confirmLabel={confirmStamp.label}
          loading={stamp.isPending}
        />
      )}

      <PrintLabelsModal open={printOpen} movements={[m]} onClose={() => setPrintOpen(false)} />

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
        description={`Delete gate movement ${m.gateRef}? It is archived, not erased.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}
