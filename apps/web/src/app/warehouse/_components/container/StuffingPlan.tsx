"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Checkbox, Switch, Tooltip } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, HolderOutlined } from "@ant-design/icons";
import { useGateLog } from "@/hooks/useGateLog";
import type { useWarehouseContainer, WarehouseContainer, ContainerHouse } from "@/hooks/useWarehouseRecords";
import { useToast } from "@/lib/toast";
import { formatDate, formatDateTime } from "@/lib/date";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { dropHouse, moveHouse, planCandidates, planTotals } from "@/app/warehouse/_lib/containerPlan";
import { stageLabel, stageTone } from "@/app/warehouse/_lib/lifecycle";
import { Badge, errorMessage, nf } from "@/app/warehouse/gate-log/_lib/gate";
import { btnDefault, btnPrimary } from "@/app/warehouse/gate-log/_components/job/fields";
import { Card } from "../tabs/shared";
import { FillBar } from "./FillBar";

// The stuffing plan of an export container: which inbound positions go in, in order, with their
// pieces / weight / volume against the capacity of the container type (over capacity is a warning).
// Once the container is at the dock (gated in) each house is marked stuffed as it goes in; it can
// be taken back out until the close. At the gate-out every stuffed house leaves the warehouse;
// planned houses not stuffed stay.

type Api = ReturnType<typeof useWarehouseContainer>;

const th = "text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap";
const td = "px-3 py-1.5 align-middle";

export function StuffingPlan({ c, api }: { c: WarehouseContainer; api: Api }) {
  const toast = useToast();
  const { movements } = useGateLog();
  const [picked, setPicked] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const closed = !!c.closedAt || !!c.gateOutAt;
  const order = c.positions.map((h) => h.movementId);

  const candidates = useMemo(() => (closed ? [] : planCandidates(movements, c.direction, c.id)), [movements, c.direction, c.id, closed]);
  const pickedRows = candidates.filter((m) => picked.includes(m.id));
  const projected = planTotals(c.equipment, [
    ...c.positions.map((h) => ({ pieces: h.pieces, kg: h.weightKg, cbm: h.cbm })),
    ...pickedRows.map((m) => ({ pieces: m.colli, kg: m.weightKg, cbm: m.measureCbm })),
  ]);

  const stuffBlocked = !c.gateInAt ? "Stamp the container gate-in first — the container must be at the dock" : closed ? "The stuffing is closed" : null;

  const add = async () => {
    try {
      await api.addPositions.mutateAsync(picked);
      toast.success(`${picked.length} position${picked.length === 1 ? "" : "s"} added to the plan`);
      setPicked([]);
    } catch (e) {
      toast.error(errorMessage(e, "Failed to add the positions"));
    }
  };
  const reorder = (next: string[]) => {
    if (next.join() === order.join()) return;
    api.reorder.mutateAsync(next).catch((e) => toast.error(errorMessage(e, "Failed to change the order")));
  };
  const toggle = (h: ContainerHouse, stuffed: boolean) =>
    api.setStuffed
      .mutateAsync({ movementId: h.movementId, stuffed })
      .then((res) => (res.outcome === "done" ? toast.success(`${h.positionRef || h.gateRef} ${stuffed ? "stuffed" : "taken back out"}`) : toast.info(res.notice)))
      .catch((e) => toast.error(errorMessage(e, "Failed to change the house")));
  const removeHouse = (h: ContainerHouse) =>
    api.removePosition
      .mutateAsync(h.movementId)
      .then(() => toast.success(`${h.positionRef || h.gateRef} taken out of the plan`))
      .catch((e) => toast.error(errorMessage(e, "Failed to take the house out")));

  const stuffedCount = c.positions.filter((h) => h.stuffedAt).length;

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
      <Card title={TERMS.stuffingPlan} extra={`${stuffedCount} of ${c.positions.length} stuffed`} bodyClassName="p-0">
        {c.positions.length === 0 ? (
          <div className="p-4 text-xs text-slate-400">No houses planned yet — add positions in the warehouse from the list.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className={th} aria-label="Order" />
                  <th className={th}>{TERMS.warehouseRef}</th>
                  <th className={th}>Customer</th>
                  <th className={th}>POD · ETD</th>
                  <th className={`${th} !text-right`}>{TERMS.pieces}</th>
                  <th className={`${th} !text-right`}>kg</th>
                  <th className={`${th} !text-right`}>cbm</th>
                  <th className={th}>{TERMS.reweigh}</th>
                  <th className={th}>{TERMS.lifecycle}</th>
                  <th className={th}>{TERMS.stuffed}</th>
                  <th className={th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {c.positions.map((h, i) => (
                  <tr
                    key={h.id}
                    draggable={!closed}
                    onDragStart={(e) => {
                      setDragging(h.movementId);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => dragging && e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragging) reorder(dropHouse(order, dragging, h.movementId));
                      setDragging(null);
                    }}
                    onDragEnd={() => setDragging(null)}
                    className={`border-b border-slate-100 last:border-b-0 ${dragging === h.movementId ? "opacity-50" : ""} ${h.stuffedAt ? "bg-emerald-50/40" : ""}`}
                  >
                    <td className={`${td} text-slate-400 whitespace-nowrap`}>
                      {!closed && <HolderOutlined className="cursor-grab mr-1" aria-hidden />}
                      <span className="tabular-nums">{i + 1}</span>
                    </td>
                    <td className={td}>
                      <Link href={`/warehouse/gate-log/${h.movementId}`} className="font-mono font-bold text-indigo-500 hover:underline">
                        {h.positionRef || h.gateRef}
                      </Link>
                      {h.addedBy === "migration" && <div className="text-[10px] text-slate-400">from the old register</div>}
                    </td>
                    <td className={`${td} text-slate-700`}>{h.customer || "—"}</td>
                    <td className={`${td} text-slate-600 whitespace-nowrap`}>
                      {h.pod || "—"} · {formatDate(h.etd) || "—"}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{nf(h.pieces)}</td>
                    <td className={`${td} text-right tabular-nums`}>{nf(h.weightKg)}</td>
                    <td className={`${td} text-right tabular-nums`}>{nf(h.cbm, 2)}</td>
                    <td className={td}>
                      {h.reweighKg != null ? (
                        <Badge tone={h.reweighFlagged ? "a" : "g"}>{nf(h.reweighKg)} kg{h.reweighFlagged ? " · variance" : ""}</Badge>
                      ) : h.needsReweigh ? (
                        <Badge tone="r">Missing</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <Badge tone={stageTone(h.stage)}>{stageLabel(h.stage, h.stageLabel)}</Badge>
                      {h.openExceptions > 0 && !h.overridden && (
                        <Badge tone="r" className="ml-1">
                          On hold
                        </Badge>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <Tooltip title={stuffBlocked ?? undefined}>
                        <span className="inline-flex items-center gap-2">
                          <Switch
                            size="small"
                            checked={!!h.stuffedAt}
                            disabled={!!stuffBlocked || api.setStuffed.isPending}
                            onChange={(on) => toggle(h, on)}
                            aria-label={`${h.positionRef || h.gateRef} stuffed`}
                          />
                          {h.stuffedAt && (
                            <span className="text-[11px] text-slate-500">
                              {formatDateTime(h.stuffedAt)}
                              {h.stuffedBy ? ` · ${h.stuffedBy}` : ""}
                            </span>
                          )}
                        </span>
                      </Tooltip>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {!closed && (
                        <span className="inline-flex items-center gap-1">
                          <button type="button" className={btnDefault} aria-label="Move up" disabled={i === 0 || api.reorder.isPending} onClick={() => reorder(moveHouse(order, h.movementId, -1))}>
                            <ArrowUpOutlined />
                          </button>
                          <button
                            type="button"
                            className={btnDefault}
                            aria-label="Move down"
                            disabled={i === c.positions.length - 1 || api.reorder.isPending}
                            onClick={() => reorder(moveHouse(order, h.movementId, 1))}
                          >
                            <ArrowDownOutlined />
                          </button>
                          <Tooltip title={h.stuffedAt ? "Stuffed — take it back out first" : "Take out of the plan"}>
                            <span className="inline-flex">
                              <button type="button" className={btnDefault} aria-label="Take out of the plan" disabled={!!h.stuffedAt || api.removePosition.isPending} onClick={() => removeHouse(h)}>
                                <DeleteOutlined />
                              </button>
                            </span>
                          </Tooltip>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {c.gateOutAt && <div className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">Gone out {formatDateTime(c.gateOutAt)} — the stuffed houses left the warehouse with it.</div>}
      </Card>

      {!closed && (
        <Card title="Add positions in the warehouse" extra={`${candidates.length} available`} bodyClassName="p-0">
          <p className="m-0 px-4 pt-3 text-[11px] text-slate-500">
            Inbound positions received in the warehouse, not on hold and not in another container — by POD, then ETD.
          </p>
          {candidates.length === 0 ? (
            <div className="p-4 text-xs text-slate-400">Nothing to add right now.</div>
          ) : (
            <ul className="list-none m-0 mt-2 p-0 max-h-[420px] overflow-y-auto">
              {candidates.map((m) => (
                <li key={m.id} className="border-t border-slate-100 px-4 py-1.5">
                  <Checkbox
                    checked={picked.includes(m.id)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                    className="!text-xs w-full"
                  >
                    <span className="font-mono font-semibold text-slate-800">{m.positionRef || m.gateRef}</span>
                    <span className="text-slate-500"> · {m.customer || "—"}</span>
                    <span className="block text-[11px] text-slate-500 tabular-nums">
                      {m.pod || "—"} · ETD {formatDate(m.etd) || "—"} · {nf(m.colli)} pcs · {nf(m.weightKg)} kg · {nf(m.measureCbm, 2)} cbm
                      {m.needsReweigh && !m.reweigh ? " · not re-weighed" : ""}
                    </span>
                  </Checkbox>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-slate-200 px-4 py-3 flex flex-col gap-2">
            <div className="text-[11px] text-slate-500">With the chosen positions</div>
            <FillBar totals={projected} />
            <div className="text-[11px] text-slate-600 tabular-nums">
              {nf(projected.pieces)} pcs · {nf(projected.kg)} kg · {nf(projected.cbm, 2)} cbm
            </div>
            {projected.overCapacity && <div className="text-[11px] font-semibold text-red-600">Over the capacity of a {c.equipment || "container of this type"} — check before stuffing.</div>}
            <button type="button" className={`${btnPrimary} self-start`} disabled={!picked.length || api.addPositions.isPending} onClick={add}>
              Add {picked.length || ""} to the plan
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
