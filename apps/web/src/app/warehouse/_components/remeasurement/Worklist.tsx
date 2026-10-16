"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Segmented } from "antd";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useWarehouse } from "@/hooks/useWarehouse";
import { useGateLog, type GateMovement } from "@/hooks/useGateLog";
import { useWarehouseSectionSummary } from "@/hooks/useWarehouseSection";
import type { interfaces } from "@/lib/api/client";
import { TERMS, directionOf, releaseGatesText } from "../../_lib/glossary";
import { inWarehouse } from "../../_lib/worklist";
import { freeTimeSort, freeTimeText, freeTimeTone } from "../../_lib/storageText";
import { Badge } from "../../gate-log/_lib/gate";
import { isDomestic, isOutbound, leavesByRelease, waitingGates } from "../../gate-log/_lib/steps";
import { positionRemeasurementHref } from "../remeasurementLinks";

// Block G — when no position is open: the positions waiting for the warehouse here. Waiting for
// remeasurement = cargo in the warehouse with no remeasured lines saved; waiting for release =
// outbound or Domestic cargo not released yet (and not refused; Domestic once it has arrived).
// Click a row to open it.

type Reason = "remeasure" | "release";
type Item = { task: interfaces.WarehouseTaskItem; m: GateMovement; reasons: Reason[]; summary?: interfaces.WarehouseSectionSummaryItem };
type Filter = "all" | Reason;

const REASON_TEXT: Record<Reason, string> = { remeasure: "Remeasurement", release: "Release" };

export function Worklist() {
  const router = useRouter();
  const { tasks, isLoading: tasksLoading } = useWarehouse();
  const { movements, isLoading: movementsLoading } = useGateLog();
  const { positions, isLoading: summaryLoading } = useWarehouseSectionSummary();
  const [filter, setFilter] = useState<Filter>("all");

  const items = useMemo<Item[]>(() => {
    const byTask = new Map<string, GateMovement>();
    for (const mv of movements) if (mv.warehouseTaskId && !byTask.has(mv.warehouseTaskId)) byTask.set(mv.warehouseTaskId, mv);
    const summary = new Map(positions.map((p) => [p.taskId, p]));
    return tasks.flatMap((task) => {
      const m = byTask.get(task.id);
      if (!m) return [];
      const s = summary.get(task.id);
      const reasons: Reason[] = [];
      if (inWarehouse(m) && !s?.hasLines) reasons.push("remeasure");
      const releaseDue = isOutbound(m) || (isDomestic(m) && !!m.gateIn);
      if (releaseDue && !m.impRelease && !m.gateOut && m.status !== "Refused") reasons.push("release");
      return reasons.length ? [{ task, m, reasons, summary: s }] : [];
    });
  }, [tasks, movements, positions]);

  const rows = filter === "all" ? items : items.filter((i) => i.reasons.includes(filter));
  const count = (r: Reason) => items.filter((i) => i.reasons.includes(r)).length;

  const columns: AppGridColumn<Item>[] = [
    {
      key: "ref",
      title: TERMS.warehouseRef,
      width: 150,
      text: (r) => r.m.positionRef || r.task.taskId,
      sorter: (a, b) => (a.m.positionRef || a.task.taskId).localeCompare(b.m.positionRef || b.task.taskId),
      render: (_, r) => <span className="font-mono font-bold text-indigo-500">{r.m.positionRef || r.task.taskId}</span>,
    },
    { key: "jobNumber", title: TERMS.jobNo, width: 150, text: (r) => r.m.jobNumber, render: (_, r) => <span className="font-mono text-slate-600">{r.m.jobNumber || "—"}</span> },
    { key: "customer", title: "Customer", width: 200, text: (r) => r.m.customer, render: (_, r) => <span className="text-slate-600">{r.m.customer || "—"}</span> },
    { key: "direction", title: TERMS.direction, width: 110, text: (r) => directionOf(r.m) },
    {
      key: "waiting",
      title: "Waiting for",
      width: 200,
      text: (r) => r.reasons.map((x) => REASON_TEXT[x]).join(", "),
      render: (_, r) => (
        <span className="flex gap-1.5">
          {r.reasons.map((x) => (
            <Badge key={x} tone={x === "release" ? "i" : "a"}>
              {REASON_TEXT[x]}
            </Badge>
          ))}
          {r.m.openExceptions > 0 && <Badge tone="r">On hold</Badge>}
        </span>
      ),
    },
    {
      key: "days",
      title: "Days in WH",
      width: 100,
      align: "right",
      text: (r) => (r.m.storage.started ? String(r.m.storage.daysInWarehouse) : ""),
      sorter: (a, b) => a.m.storage.daysInWarehouse - b.m.storage.daysInWarehouse,
      render: (_, r) => (r.m.storage.started ? <span className="tabular-nums">{r.m.storage.daysInWarehouse}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: "freeTime",
      title: "Free time",
      width: 150,
      text: (r) => freeTimeText(r.m.storage),
      sorter: (a, b) => freeTimeSort(a.m.storage) - freeTimeSort(b.m.storage),
      render: (_, r) => <span className={freeTimeTone(r.m.storage)}>{freeTimeText(r.m.storage) || "—"}</span>,
    },
    {
      key: "release",
      title: TERMS.releaseGates,
      width: 260,
      text: (r) => releaseGatesText(r.m),
      render: (_, r) =>
        !leavesByRelease(r.m) ? (
          <span className="text-slate-300">n/a — inbound</span>
        ) : r.m.armed ? (
          <span className="font-medium text-emerald-600">{TERMS.clear}</span>
        ) : (
          <span className="text-red-500" title={waitingGates(r.m).join(", ")}>
            {TERMS.blocked} — {waitingGates(r.m).join(", ") || "—"}
          </span>
        ),
    },
  ];

  return (
    <AppGrid<Item>
      title="Waiting for remeasurement or release"
      headerExtra={
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: `All (${items.length})` },
            { value: "remeasure", label: `Remeasurement (${count("remeasure")})` },
            { value: "release", label: `Release (${count("release")})` },
          ]}
        />
      }
      searchPlaceholder="Search warehouse ref, job no., customer…"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.task.id}
      loading={tasksLoading || movementsLoading || summaryLoading}
      onRowClick={(r) => router.push(positionRemeasurementHref(r.task.id))}
      storageKey="warehouse:remeasure-worklist"
      exportFilePrefix="remeasure-worklist"
      emptyText="Nothing is waiting for remeasurement or release."
      resetKey={filter}
    />
  );
}
