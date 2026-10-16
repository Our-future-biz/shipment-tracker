"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled } from "@ant-design/icons";
import type { GateMovement } from "@/hooks/useGateLog";
import { formatDateTime } from "@/lib/date";
import { TERMS } from "../../_lib/glossary";
import { Badge } from "../../gate-log/_lib/gate";
import { PICKUP_PIN_GATE, containerHoldsRelease, isDomestic, leavesByRelease } from "../../gate-log/_lib/steps";
import { LifecycleStrip } from "../LifecycleStrip";
import { releaseState } from "../../gate-log/_components/job/ReleaseGatesPanel";
import { btnPrimary } from "../../gate-log/_components/job/fields";
import { Card } from "../tabs/shared";

// Block F — can the cargo go? The release gates with their reasons, the Pick-up PIN and the WH
// release time — read-only. The release itself is stamped on the gate job.

const ICON: Record<string, ReactNode> = {
  OK: <CheckCircleFilled className="text-emerald-500" />,
  Pending: <ClockCircleOutlined className="text-amber-500" />,
  Blocked: <CloseCircleFilled className="text-red-500" />,
};

export function ReleaseReadiness({ m }: { m: GateMovement | undefined }) {
  if (!m) {
    return (
      <Card title="Release readiness">
        <div className="text-xs text-slate-400">No gate record for this position yet.</div>
      </Card>
    );
  }
  // Outbound and Domestic cargo leave through the WH release (Domestic: right after its gate-in).
  const out = leavesByRelease(m);
  const state = releaseState(m);
  const pinLine = m.releaseGates.find((x) => x.g === PICKUP_PIN_GATE);
  const open = (
    <Link href={`/warehouse-concept/gate-log/${m.id}`} className={btnPrimary}>
      Open gate job to release
    </Link>
  );
  const held = containerHoldsRelease(m);
  // Where the position is now, and the container it leaves with / is received from.
  const lifecycle = (
    <div className="mb-3">
      <LifecycleStrip l={m.lifecycle} />
      {held && (
        <div className="mt-2 text-xs text-slate-700">
          {held.reason}
          {m.container && (
            <>
              {" — "}
              <Link href={`/warehouse-concept/containers/${m.container.id}`} className="font-semibold text-indigo-500 hover:underline">
                open container {m.container.number}
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (!out) {
    return (
      <Card title="Release readiness">
        {lifecycle}
        <div className="text-xs text-slate-600">
          {m.container?.kind === "export"
            ? `Inbound cargo leaves the warehouse with its export container: the container's gate-out stops the storage clock and sets the shipment's released date. `
            : "Inbound cargo has no WH release here. "}
          Its truck {TERMS.gateOut} is the delivering truck leaving — the cargo stays in the warehouse and its storage clock keeps running.
          {m.gateOut ? ` Truck ${TERMS.gateOut.toLowerCase()} stamped ${formatDateTime(m.gateOut)}.` : " Truck not gone out yet."}
        </div>
        {m.openExceptions > 0 && <div className="mt-2 text-xs text-red-600">On hold — resolve the open exception first.</div>}
        <div className="mt-3">{open}</div>
      </Card>
    );
  }

  return (
    <Card title="Release readiness">
      {lifecycle}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={state.tone} className="!text-[11.5px]">
          {state.label}
        </Badge>
        {state.detail && <span className="text-[11px] text-slate-500 break-words">{state.detail}</span>}
      </div>
      <ul className="list-none m-0 mt-3 p-0 border-t border-slate-100">
        {m.releaseGates.map((x) => (
          <li key={x.g} className="flex items-start gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
            <span className="pt-[1px]" title={x.s} aria-label={x.s}>
              {ICON[x.s]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-slate-800">{x.g}</div>
              <div className="text-[11px] text-slate-500 break-words">{x.note && x.note !== "—" ? x.note : x.s}</div>
            </div>
          </li>
        ))}
        {m.releaseGates.length === 0 && <li className="py-2 text-xs text-slate-400">No release gates on this movement.</li>}
      </ul>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{TERMS.pickupPin}</div>
          {m.pickup ? (
            <>
              <div>
                {m.pickup.locked ? (
                  <Badge tone="r">Locked — needs a new PIN in Shipments</Badge>
                ) : !m.pickup.pinSet ? (
                  <Badge tone="r">No PIN yet</Badge>
                ) : pinLine?.s === "OK" ? (
                  <Badge tone="g">Verified</Badge>
                ) : (
                  <Badge tone="a">Set — not verified yet</Badge>
                )}
              </div>
              {pinLine?.note && pinLine.note !== "—" && <div className="mt-1 text-[11px] text-slate-500">{pinLine.note}</div>}
              {m.pickup.rows.length > 0 && (
                <ul className="list-none m-0 mt-1.5 p-0 text-[11px] text-slate-600">
                  {m.pickup.rows.map((r, i) => (
                    <li key={i}>
                      {r.haulier || "—"} · <span className="font-mono">{r.licensePlate || "—"}</span> · {r.driver || "—"}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <span className="text-slate-400">
              {isDomestic(m) ? "Domestic cargo — no pick-up PIN" : m.shipmentId ? "No pick-up entered in Shipments" : "Not linked to a shipment — no pick-up PIN"}
            </span>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">{TERMS.whRelease}</div>
          {m.impRelease ? <span className="font-semibold text-emerald-700">{formatDateTime(m.impRelease)}</span> : <span className="text-slate-400">Not released yet</span>}
        </div>
      </div>
      {!m.impRelease && <div className="mt-3">{open}</div>}
    </Card>
  );
}
