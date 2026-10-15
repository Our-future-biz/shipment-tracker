"use client";

import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { Input, InputNumber, Tooltip } from "antd";
import Link from "next/link";
import {
  CarOutlined,
  CheckSquareOutlined,
  ContainerOutlined,
  FieldTimeOutlined,
  InboxOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import type { controllers, interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { tripLabel } from "@/lib/tripSource";
import { TERMS, directionOfHandling } from "@/app/warehouse/_lib/glossary";
import {
  Badge,
  CUSTOMS_MODES,
  CUSTOMS_STATUSES,
  FREIGHT_MODES,
  HANDLINGS,
  LOAD_TYPES,
  PACKINGS,
  STATUS_TONE,
} from "../../_lib/gate";
import { ReleaseGatesPanel, releaseState } from "./ReleaseGatesPanel";
import { PickupPinCheck } from "./PickupPinCheck";
import { ExceptionsPanel } from "./ExceptionsPanel";
import { StorageLine } from "@/app/warehouse/_lib/storageText";
import { CONTAINER_STATUS_TONE, KIND_LABEL, TALLY_LABEL, TALLY_TONE, containerKind } from "@/app/warehouse/_lib/containerPlan";
import { positionRemeasurementHref } from "@/app/warehouse/_components/remeasurementLinks";
import { ReweighSection, kgText } from "./ReweighSection";
import type { PinCheckResult } from "../../_lib/steps";
import {
  btnInline,
  FieldRow,
  InlineDate,
  InlineNumber,
  InlineSelect,
  InlineText,
  InlineTime,
  InlineTextarea,
  parseStamp,
  Section,
  YesNo,
} from "./fields";

type Save = (data: Omit<controllers.GateMovementUpdateRequest, "id">) => void;
type CheckKey = keyof GateMovement["checklist"];

// Gate checklist items shown on the overview (seal lives on the container interchange).
const CHECKS: { key: CheckKey; label: string; paths: string[] }[] = [
  {
    key: "ht",
    label: "HT",
    paths: ["M12 3.2s5.4 5.6 5.4 9a5.4 5.4 0 1 1-10.8 0c0-3.4 5.4-9 5.4-9z"],
  },
  {
    key: "photos",
    label: "Photos",
    paths: [
      "M4 8.5h3.2l1.3-2h7l1.3 2H20a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z",
      "M15.1 13.5a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0z",
    ],
  },
  {
    key: "measure",
    label: "Measure",
    paths: [
      "M3.6 14.2 14.2 3.6l6.2 6.2L9.8 20.4z",
      "M8 8.4l1.8 1.8M11 5.4l1.8 1.8M11.4 11.6l1.8 1.8M14.4 8.6l1.8 1.8",
    ],
  },
  { key: "vgm", label: "VGM", paths: ["M4 6.5h16v12H4z", "M8.5 12.5l2.4 2.4 4.6-4.6"] },
  {
    key: "dg",
    label: "DG/ADR",
    paths: ["M12 3.4 20.6 12 12 20.6 3.4 12z", "M12 8.4v4.2M12 15.6v.1"],
  },
];
// Click cycle: n/a → done → pending → problem.
const CHECK_CYCLE = ["n", "g", "a", "r"] as const;
const CHECK_TEXT: Record<string, string> = { n: "n/a", g: "done", a: "pending", r: "problem" };
const CHECK_STYLE: Record<string, { box: string; text: string }> = {
  n: { box: "border-slate-200 bg-slate-50 text-slate-400", text: "text-slate-400" },
  g: { box: "border-emerald-500 bg-emerald-50 text-emerald-600", text: "text-emerald-600" },
  a: { box: "border-amber-500 bg-amber-50 text-amber-600", text: "text-amber-600" },
  r: { box: "border-red-500 bg-red-50 text-red-600", text: "text-red-600" },
};

// Two columns on wide screens: main cards on the left, the gate checklist on the right.
const overviewGrid = "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-5 items-start";

const LEG_DOT: Record<string, string> = {
  IN: "bg-indigo-500",
  OUT: "bg-amber-500",
  CFS: "bg-slate-400",
};

export function OverviewTab({
  m,
  save,
  saving,
  requestRelease,
  requesting,
  requestMrn,
  requestingMrn,
  refuse,
  override,
  setReleaseGate,
  verifyPin,
}: {
  m: GateMovement;
  save: Save;
  saving: boolean;
  requestRelease: () => void;
  requesting: boolean;
  requestMrn: () => void;
  requestingMrn: boolean;
  refuse: (reason: string) => Promise<unknown>;
  override: (reason: string) => Promise<unknown>;
  setReleaseGate: (gate: string, ok: boolean) => Promise<unknown>;
  verifyPin: (pin: string) => Promise<{ result: PinCheckResult; tries: number }>;
}) {
  // Release follows the release gates (see the Release gates card); nothing here sets it by hand.
  const release = releaseState(m);

  // Last "Ask for …" on this movement, shown next to its button.
  const lastOf = (kind: string) => [...m.events].reverse().find((e) => e.kind === kind);
  const lastRequest = lastOf("releaseRequested");
  const lastMrnRequest = lastOf("mrnRequested");
  const askedAt = (e: { at: string; by: string } | undefined) =>
    e ? (
      <span className="text-[11px] text-slate-400">
        asked {formatDateTime(e.at)}
        {e.by ? ` · ${e.by}` : ""}
      </span>
    ) : null;

  const setLeg = (
    leg: interfaces.GateTransportLeg["leg"],
    patch: Partial<interfaces.GateTransportLeg>,
  ) =>
    save({ transportLegs: m.transportLegs.map((l) => (l.leg === leg ? { ...l, ...patch } : l)) });

  // Gate time falls back to the gate stamp of that direction.
  const gateTimeOf = (l: interfaces.GateTransportLeg) =>
    l.gateTime ||
    (l.leg === "IN" && m.gateIn
      ? formatDateTime(m.gateIn)
      : l.leg === "OUT" && m.gateOut
        ? formatDateTime(m.gateOut)
        : "");

  // Gate date and gate time edit the two halves of the same stamp: changing one keeps the
  // other (a time without a date lands on today, a date without a time at 00:00).
  const setLegStamp = (l: interfaces.GateTransportLeg, part: { date?: string; time?: string }) => {
    const current = parseStamp(gateTimeOf(l));
    if (part.date !== undefined && !part.date) return setLeg(l.leg, { gateTime: "" });
    if (part.time !== undefined && !part.time) {
      return setLeg(l.leg, { gateTime: current ? current.startOf("day").toISOString() : "" });
    }
    const date =
      part.date ?? (current ? current.format("YYYY-MM-DD") : dayjs().format("YYYY-MM-DD"));
    const time = part.time ?? (current ? current.format("HH:mm") : "00:00");
    return setLeg(l.leg, { gateTime: dayjs(`${date}T${time}`).toISOString() });
  };

  const cfs = m.transportLegs.find((l) => l.leg === "CFS");

  // The VGM icon is done once the cargo is re-weighed (the warehouse's re-weigh): then it is not
  // cycled by hand.
  const vgmLocked = !!m.reweigh;
  const cycleCheck = (key: CheckKey) => {
    if (key === "vgm" && vgmLocked) return;
    const next = CHECK_CYCLE[(CHECK_CYCLE.indexOf(m.checklist[key]) + 1) % CHECK_CYCLE.length];
    save({ checklist: { ...m.checklist, [key]: next } });
  };

  return (
    <div className="space-y-5">
      <div className={overviewGrid}>
        <div className="space-y-5 min-w-0">
          {/* ============ gate overview ============ */}
          <Section
            title="Gate overview"
            icon={<SafetyCertificateOutlined />}
            extra={
              saving
                ? "saving…"
                : `updated ${formatDateTime(m.updatedAt)}${m.updatedBy ? ` · ${m.updatedBy}` : ""}`
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                {/* This job is the position's page, so its reference is plain text. */}
                <FieldRow label={TERMS.warehouseRef}>
                  <span className="font-mono font-semibold text-slate-900">{m.gateRef}</span>
                </FieldRow>
                {/* Saves the stored handling (Import / Export / Domestic), shown as Outbound / Inbound / Domestic; the server
                    moves the gate visit with it. Locked once anything is stamped. */}
                <FieldRow label={TERMS.direction}>
                  {m.gateIn || m.gateOut || m.impRelease || m.expDraft || m.expReceipt || m.container ? (
                    <Tooltip title={m.container ? `Direction is locked while the position is a house of container ${m.container.number}` : "Direction is locked once a gate stamp is recorded"}>
                      <span className="text-xs font-medium text-slate-900">{directionOfHandling(m.handling)}</span>
                    </Tooltip>
                  ) : (
                    <InlineSelect
                      value={m.handling}
                      options={HANDLINGS}
                      labels={directionOfHandling}
                      clearable={false}
                      onSave={(v) => v && save({ handling: v })}
                    />
                  )}
                </FieldRow>
                <FieldRow label="Freight mode">
                  <InlineSelect
                    value={m.freightMode}
                    options={FREIGHT_MODES}
                    onSave={(v) => save({ freightMode: v })}
                  />
                </FieldRow>
                <FieldRow label="Load type">
                  <InlineSelect
                    value={m.loadType}
                    options={LOAD_TYPES}
                    onSave={(v) => save({ loadType: v })}
                  />
                </FieldRow>
                <FieldRow label="Free comments" tall>
                  <InlineTextarea
                    value={m.note}
                    placeholder="Add a comment…"
                    onSave={(v) => save({ note: v })}
                  />
                </FieldRow>
              </div>
              <div>
                {/* Status moves only through the stamps, Refuse and the supervisor override. */}
                <FieldRow label={TERMS.warehouseStatus}>
                  <Badge tone={STATUS_TONE[m.status] ?? ""}>{m.status || "—"}</Badge>
                </FieldRow>
                <FieldRow label="Customs status">
                  <InlineSelect
                    value={m.customsStatus}
                    options={CUSTOMS_STATUSES}
                    width={250}
                    clearable={false}
                    onSave={(v) => v && save({ customsStatus: v })}
                  />
                </FieldRow>
                <FieldRow label={TERMS.releaseGates}>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Badge tone={release.tone} className="self-start">
                      {release.label}
                    </Badge>
                    {release.detail && <span className="text-[11px] text-slate-500 break-words">{release.detail} · see {TERMS.releaseGates}</span>}
                  </div>
                </FieldRow>
                <FieldRow label="Ask for release">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className={btnInline}
                      disabled={requesting || !!m.impRelease}
                      onClick={requestRelease}
                    >
                      Ask for release
                    </button>
                    {askedAt(lastRequest)}
                  </div>
                </FieldRow>
                <FieldRow label="Shipment Owner">
                  <InlineText value={m.shipmentOwner} onSave={(v) => save({ shipmentOwner: v })} />
                </FieldRow>
                <FieldRow label="Customer Contact">
                  <InlineText
                    value={m.customerContact}
                    placeholder="email@company.com"
                    onSave={(v) => save({ customerContact: v })}
                  />
                </FieldRow>
                <FieldRow label="Customs procedure">
                  <InlineSelect
                    value={m.customsMode}
                    options={CUSTOMS_MODES}
                    clearable={false}
                    onSave={(v) => v && save({ customsMode: v })}
                  />
                </FieldRow>
                <FieldRow label="MRN Number">
                  <InlineText
                    value={m.mrn}
                    mono
                    placeholder="e.g. 26CZ5100001A2B3C"
                    onSave={(v) => save({ mrn: v })}
                  />
                </FieldRow>
                <FieldRow label="Ask for MRN number">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className={btnInline}
                      disabled={requestingMrn || !!m.mrn.trim()}
                      onClick={requestMrn}
                    >
                      Ask for MRN number
                    </button>
                    {askedAt(lastMrnRequest)}
                  </div>
                </FieldRow>
              </div>
            </div>
          </Section>

          {/* ============ cargo details ============ */}
          <Section title="Cargo details" icon={<InboxOutlined />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              <div>
                <FieldRow label={TERMS.pieces}>
                  <InlineNumber value={m.colli} onSave={(v) => save({ colli: v })} />
                </FieldRow>
                <FieldRow label="Type of packages">
                  <InlineSelect
                    value={m.packing}
                    options={PACKINGS}
                    onSave={(v) => save({ packing: v })}
                  />
                </FieldRow>
                <FieldRow label="Commodity">
                  <InlineText value={m.commodity} onSave={(v) => save({ commodity: v })} />
                </FieldRow>
                <FieldRow label="Stackable">
                  <YesNo
                    label="Stackable"
                    value={m.stackable}
                    neg="no"
                    onSave={(v) => save({ stackable: v })}
                  />
                </FieldRow>
              </div>
              <div>
                <FieldRow label={TERMS.weightKg}>
                  <InlineNumber value={m.weightKg} onSave={(v) => save({ weightKg: v })} />
                </FieldRow>
                <FieldRow label={TERMS.volumeCbm}>
                  <InlineNumber
                    value={m.measureCbm}
                    step={0.1}
                    suffix="cbm"
                    onSave={(v) => save({ measureCbm: v })}
                  />
                </FieldRow>
                <FieldRow label="IMO / DG">
                  <YesNo
                    label="IMO / DG"
                    value={m.dangerousGoods}
                    neg="yes"
                    onSave={(v) => save({ dangerousGoods: v })}
                  />
                </FieldRow>
                {m.dangerousGoods && (
                  <FieldRow label="UN Number">
                    <UnNumberInput value={m.unNumber} onSave={(v) => save({ unNumber: v })} />
                  </FieldRow>
                )}
              </div>
            </div>
          </Section>

          {/* ============ transport ============ */}
          <Section title="Transport" icon={<CarOutlined />} bodyClassName="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    "Leg",
                    "Transport company",
                    TERMS.plate,
                    TERMS.driver,
                    "Phone Number",
                    "Gate date",
                    "Gate time",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.transportLegs
                  .filter((l) => l.leg !== "CFS")
                  .map((l) => {
                    // Filled by a Trucking trip: read-only here, changed only by the trip.
                    const fromTrip = tripLabel(l);
                    if (fromTrip) {
                      const shown = (v: string, cls = "") => <span className={`block py-1 ${v ? "text-slate-900" : "text-slate-300"} ${cls}`}>{v || "—"}</span>;
                      const stamp = parseStamp(gateTimeOf(l));
                      return (
                        <tr key={l.leg} className="border-b border-slate-100 last:border-b-0 bg-sky-50/40">
                          <td className="px-4 py-1.5">
                            <span className="inline-flex items-center gap-2 font-bold tracking-wide text-slate-700">
                              <i className={`w-2 h-2 rounded-sm ${LEG_DOT[l.leg]}`} />
                              {l.leg}
                            </span>
                            <Tooltip title="Planned in Trucking — change it on the trip">
                              <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{fromTrip}</span>
                            </Tooltip>
                          </td>
                          <td className="px-4 py-1.5">{shown(l.company)}</td>
                          <td className="px-4 py-1.5">{shown(l.plate, "font-mono")}</td>
                          <td className="px-4 py-1.5">{shown(l.driver)}</td>
                          <td className="px-4 py-1.5">{shown(l.phone, "!text-slate-500")}</td>
                          <td className="px-4 py-1.5">{shown(stamp ? stamp.format("YYYY-MM-DD") : "", "!text-slate-500")}</td>
                          <td className="px-4 py-1.5">{shown(stamp ? stamp.format("HH:mm") : "", "!text-slate-500")}</td>
                        </tr>
                      );
                    }
                    return (
                    <tr key={l.leg} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-1.5">
                        <span className="inline-flex items-center gap-2 font-bold tracking-wide text-slate-700">
                          <i className={`w-2 h-2 rounded-sm ${LEG_DOT[l.leg]}`} />
                          {l.leg}
                        </span>
                      </td>
                      <td className="px-4 py-1.5">
                        <InlineText
                          value={l.company}
                          placeholder="not assigned"
                          className="placeholder:italic"
                          onSave={(v) => setLeg(l.leg, { company: v })}
                        />
                      </td>
                      <td className="px-4 py-1.5">
                        <InlineText
                          value={l.plate}
                          mono
                          onSave={(v) => setLeg(l.leg, { plate: v })}
                        />
                      </td>
                      <td className="px-4 py-1.5">
                        <InlineText value={l.driver} onSave={(v) => setLeg(l.leg, { driver: v })} />
                      </td>
                      <td className="px-4 py-1.5">
                        <InlineText
                          value={l.phone}
                          className="!text-slate-500"
                          onSave={(v) => setLeg(l.leg, { phone: v })}
                        />
                      </td>
                      <td className="px-4 py-1.5">
                        <InlineDate
                          value={gateTimeOf(l)}
                          className="!text-slate-500"
                          onSave={(v) => setLegStamp(l, { date: v })}
                        />
                      </td>
                      <td className="px-4 py-1.5">
                        <InlineTime
                          value={gateTimeOf(l)}
                          className="!text-slate-500"
                          onSave={(v) => setLegStamp(l, { time: v })}
                        />
                      </td>
                    </tr>
                    );
                  })}
              </tbody>
            </table>
          </Section>
        </div>

        <div className="space-y-5 min-w-0">
          {/* ============ pick-up PIN (linked outbound) ============ */}
          {m.pickup && !m.impRelease && <PickupPinCheck m={m} verifyPin={verifyPin} />}

          {/* ============ release gates ============ */}
          <ReleaseGatesPanel m={m} refuse={refuse} override={override} setReleaseGate={setReleaseGate} />

          {/* ============ damage / short / over ============ */}
          <ExceptionsPanel m={m} />

          {/* ============ container (one container, many positions) ============ */}
          {m.container && <ContainerCard m={m} />}

          {/* ============ re-weigh (LCL) ============ */}
          <ReweighSection m={m} informHref={m.warehouseTaskId ? positionRemeasurementHref(m.warehouseTaskId) : undefined} />

          {/* ============ storage clock ============ */}
          <StorageSection m={m} save={save} />

          {/* ============ gate checklist ============ */}
          <Section title="Gate checklist" icon={<CheckSquareOutlined />}>
            <div className="grid grid-cols-5 gap-2">
              {CHECKS.map((c) => {
                const locked = c.key === "vgm" && vgmLocked;
                const st = locked ? "g" : (m.checklist[c.key] ?? "n");
                const style = CHECK_STYLE[st]!;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => cycleCheck(c.key)}
                    aria-label={`${c.label} — ${CHECK_TEXT[st]}`}
                    title={
                      locked && m.reweigh
                        ? `Re-weighed ${kgText(m.reweigh.weighedKg)} ${formatDateTime(m.reweigh.weighedAt)}${m.reweigh.weighedBy ? ` by ${m.reweigh.weighedBy}` : ""}`
                        : "Click to change: n/a → done → pending → problem"
                    }
                    className={`flex flex-col items-center gap-1 bg-transparent border-0 p-1 rounded-lg ${locked ? "cursor-default" : "cursor-pointer hover:bg-slate-50"}`}
                  >
                    <span
                      className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${style.box}`}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {c.paths.map((d) => (
                          <path key={d} d={d} />
                        ))}
                      </svg>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {c.label}
                    </span>
                    <span className={`text-[11px] ${style.text}`}>{CHECK_TEXT[st]}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ============ CFS ============ */}
          {cfs && (
            <Section
              title="CFS information"
              icon={<CarOutlined />}
              bodyClassName="overflow-x-auto"
            >
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {[
                    {
                      label: "Transport company",
                      cell: (
                        <InlineText
                          value={cfs.company}
                          placeholder="not assigned"
                          className="placeholder:italic"
                          onSave={(v) => setLeg("CFS", { company: v })}
                        />
                      ),
                    },
                    {
                      label: TERMS.plate,
                      cell: (
                        <InlineText
                          value={cfs.plate}
                          mono
                          onSave={(v) => setLeg("CFS", { plate: v })}
                        />
                      ),
                    },
                    {
                      label: TERMS.driver,
                      cell: (
                        <InlineText
                          value={cfs.driver}
                          onSave={(v) => setLeg("CFS", { driver: v })}
                        />
                      ),
                    },
                    {
                      label: "Phone Number",
                      cell: (
                        <InlineText
                          value={cfs.phone}
                          className="!text-slate-500"
                          onSave={(v) => setLeg("CFS", { phone: v })}
                        />
                      ),
                    },
                    {
                      label: "Gate date",
                      cell: (
                        <InlineDate
                          value={gateTimeOf(cfs)}
                          className="!text-slate-500"
                          onSave={(v) => setLegStamp(cfs, { date: v })}
                        />
                      ),
                    },
                    {
                      label: "Gate time",
                      cell: (
                        <InlineTime
                          value={gateTimeOf(cfs)}
                          className="!text-slate-500"
                          onSave={(v) => setLegStamp(cfs, { time: v })}
                        />
                      ),
                    },
                    {
                      label: "CFS Customs Number",
                      cell: (
                        <InlineText
                          value={m.cfsCustomsNumber}
                          mono
                          onSave={(v) => save({ cfsCustomsNumber: v })}
                        />
                      ),
                    },
                    {
                      label: "CFS Customs Procedure",
                      cell: (
                        <InlineSelect
                          value={m.cfsCustomsProcedure}
                          options={CUSTOMS_MODES}
                          onSave={(v) => save({ cfsCustomsProcedure: v })}
                        />
                      ),
                    },
                  ].map((row) => (
                    <tr key={row.label} className="border-b border-slate-100 last:border-b-0">
                      <th className="text-left px-4 py-1.5 w-[170px] text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {row.label}
                      </th>
                      <td className="px-4 py-1.5">{row.cell}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// Opens focused when IMO / DG is switched to yes.
function UnNumberInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  return (
    <Input
      size="small"
      variant="borderless"
      autoFocus={!value}
      maxLength={12}
      defaultValue={value}
      placeholder="e.g. UN 1263"
      className="!text-xs -ml-[7px] hover:!bg-slate-50 font-mono font-medium w-[160px]"
      onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value.trim())}
      onPressEnter={(e) => e.currentTarget.blur()}
    />
  );
}

// The storage clock of this record (one calculation, made by the server): it starts at the
// receipt — the gate-in for inbound cargo; for outbound cargo the tick-off at the stripping tally
// of its container, or without a tally the "Received in warehouse" date (the truck's gate-in is the
// pick-up, never the receipt) — and stops at the WH release (outbound cargo also at its gate-out;
// inbound cargo stuffed in an export container at that container's gate-out; an inbound truck's
// gate-out is the delivering truck leaving). Free days: empty = the default (7). Each change is logged.
function StorageSection({ m, save }: { m: GateMovement; save: Save }) {
  const outbound = m.visit === "výdej";
  const s = m.storage;
  return (
    <Section title="Storage" icon={<FieldTimeOutlined />}>
      <FieldRow label="Clock">
        <span className="text-xs font-medium text-slate-900">
          <StorageLine s={s} />
        </span>
      </FieldRow>
      {outbound && (m.receivedAt || m.container?.tallyRequired) ? (
        // An import house is received by its tick-off at the stripping tally: the date follows it.
        <FieldRow label="Received in warehouse">
          <span className="text-xs text-slate-700">
            {m.receivedAt ? `${dayjs(m.receivedAt).format("DD.MM.YYYY HH:mm")} — ` : "Not yet — "}
            set by the stripping tally{m.container ? ` of container ${m.container.number}` : ""}
          </span>
        </FieldRow>
      ) : outbound ? (
        <FieldRow label="Received in warehouse">
          <InlineDate value={m.loadInDate} onSave={(v) => save({ loadInDate: v })} />
        </FieldRow>
      ) : (
        <FieldRow label="Received">
          <span className="text-xs text-slate-700">{s.startDate ? `${dayjs(s.startDate).format("DD.MM.YYYY")} — the gate-in` : "at the gate-in"}</span>
        </FieldRow>
      )}
      {m.leftAt && (
        <FieldRow label="Left">
          <span className="text-xs text-slate-700">
            {dayjs(m.leftAt).format("DD.MM.YYYY HH:mm")} — in container {m.container?.number ?? ""} (its gate-out stopped the clock)
          </span>
        </FieldRow>
      )}
      <FieldRow label="Free days">
        <FreeDaysInput value={m.freeDays} onSave={(v) => save({ freeDays: v })} />
      </FieldRow>
      {s.started && (
        <FieldRow label="Last free day">
          <span className="text-xs text-slate-700">{dayjs(s.lastFreeDay).format("DD.MM.YYYY")}</span>
        </FieldRow>
      )}
      <p className="text-[11px] text-slate-400 mt-2 mb-0">
        The receipt day is day 1; calendar days in Prague time. After the free days CZK 22 per W/M a day, at least CZK 120.
      </p>
    </Section>
  );
}

// Free days of this record; empty = the default (7). Saved on leaving the field.
function FreeDaysInput({ value, onSave }: { value: number | null; onSave: (v: number | null) => void }) {
  const [draft, setDraft] = useState<number | null>(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <span className="inline-flex items-center gap-1.5">
      <InputNumber
        size="small"
        variant="borderless"
        min={0}
        max={365}
        precision={0}
        controls={false}
        placeholder="7 (default)"
        aria-label="Free days"
        value={draft}
        className="!text-xs -ml-[7px] hover:!bg-slate-50 w-[110px] font-mono font-medium"
        onChange={(v) => setDraft(v == null ? null : Number(v))}
        onBlur={() => {
          if (draft !== value) onSave(draft);
        }}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
      />
      <span className="text-slate-400 text-xs">days</span>
    </span>
  );
}

// The container this position is a house of: which one, its state, and the house's own state in
// it (stuffed / the tally), with a link to the container page.
function ContainerCard({ m }: { m: GateMovement }) {
  const c = m.container!;
  const kind = containerKind(c.direction);
  return (
    <Section
      title="Container"
      icon={<ContainerOutlined />}
      extra={
        <Link href={`/warehouse/containers/${c.id}`} className="font-semibold text-indigo-500 hover:underline">
          Open container
        </Link>
      }
    >
      <FieldRow label="Container">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-slate-900">{c.number}</span>
          <Badge tone={kind === "export" ? "i" : "b"}>{KIND_LABEL[kind]}</Badge>
          <Badge tone={CONTAINER_STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>
        </span>
      </FieldRow>
      {(c.equipment || c.seal) && (
        <FieldRow label="Type · seal">
          <span className="text-xs text-slate-700">
            {c.equipment || "—"} · <span className="font-mono">{c.seal || "no seal yet"}</span>
          </span>
        </FieldRow>
      )}
      <FieldRow label={TERMS.containerGateIn}>
        <span className="text-xs text-slate-700">{c.gateInAt ? formatDateTime(c.gateInAt) : "Not yet"}</span>
      </FieldRow>
      {kind === "export" ? (
        <FieldRow label={TERMS.stuffed}>
          {c.stuffedAt ? (
            <span className="text-xs text-slate-700">
              <Badge tone="i">Stuffed</Badge> {formatDateTime(c.stuffedAt)}
              {c.stuffedBy ? ` · ${c.stuffedBy}` : ""}
            </span>
          ) : (
            <span className="text-xs text-slate-500">Planned — not stuffed yet</span>
          )}
        </FieldRow>
      ) : (
        <FieldRow label="Tally">
          {c.tallyOutcome ? (
            <span className="text-xs text-slate-700">
              <Badge tone={TALLY_TONE[c.tallyOutcome] ?? ""}>{TALLY_LABEL[c.tallyOutcome] ?? c.tallyOutcome}</Badge>
              {c.tallyPieces != null ? ` ${c.tallyPieces} of ${m.colli} pcs` : ""}
              {c.tickedAt ? ` · ${formatDateTime(c.tickedAt)}` : ""}
              {c.tickedBy ? ` · ${c.tickedBy}` : ""}
            </span>
          ) : (
            <span className="text-xs text-slate-500">{c.tallyRequired ? "Not tallied yet — received when ticked off at the stripping tally" : "Registered before the stripping tally — received by the date on Storage"}</span>
          )}
        </FieldRow>
      )}
      <FieldRow label={TERMS.containerGateOut}>
        <span className="text-xs text-slate-700">{c.gateOutAt ? formatDateTime(c.gateOutAt) : "Not yet"}</span>
      </FieldRow>
    </Section>
  );
}
