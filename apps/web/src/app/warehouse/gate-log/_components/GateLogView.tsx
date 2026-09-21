"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
import { useGateLog, type GateMovement } from "@/hooks/useGateLog";
import { getCellConditionalStyle } from "@/lib/columnConfig";
import {
  errorMessage,
  CUSTOMS_STATUSES,
  GATE_STATUSES,
  HANDLINGS,
  OPERATION_TYPES,
  PACKINGS,
  VISITS,
  isFcl,
  isLcl,
  nf,
} from "../_lib/gate";

type BubbleId = "attention" | "lcl" | "fcl";

// Cells render like the Shipments grid: plain slate text, a light "—" when empty, the
// reference in bold indigo mono, and status colour as a light cell tint (same rules).
const dim = (v: string) => (v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-300">—</span>);
const num = (v: string) => <span className="text-slate-600 tabular-nums">{v}</span>;
const tint = (column: string, value: string) => {
  const bg = getCellConditionalStyle(column, value, {})?.backgroundColor;
  return bg ? { style: { backgroundImage: `linear-gradient(${bg}, ${bg})` } } : {};
};
const releaseText = (r: GateMovement) => (r.visit !== "výdej" ? "n/a — příjem" : r.armed ? "ARMED" : "NOT armed");

// Default columns in the order of the gate desk sketch; the rest are behind Columns.
// Widths follow the Shipments column config for comparable fields.
const COLUMNS: AppGridColumn<GateMovement>[] = [
  { key: "gateRef", title: "Gate ref", width: 160, text: (r) => r.gateRef, render: (_, r) => <span className="font-mono font-bold text-indigo-500">{r.gateRef}</span> },
  { key: "handling", title: "Handling", width: 120, text: (r) => r.handling, filterOptions: [...HANDLINGS], render: (_, r) => dim(r.handling) },
  { key: "operationType", title: "Operation", width: 180, text: (r) => r.operationType, filterOptions: OPERATION_TYPES, render: (_, r) => dim(r.operationType) },
  { key: "packing", title: "Packing", width: 150, text: (r) => r.packing, filterOptions: PACKINGS, render: (_, r) => dim(r.packing) },
  { key: "weightKg", title: "Weight kg", width: 110, align: "right", text: (r) => String(r.weightKg), render: (_, r) => num(nf(r.weightKg)) },
  { key: "measureCbm", title: "Measure cbm", width: 120, align: "right", text: (r) => String(r.measureCbm), render: (_, r) => num(nf(r.measureCbm, 1)) },
  { key: "customer", title: "Customer", width: 180, text: (r) => r.customer, render: (_, r) => dim(r.customer) },
  { key: "customerContact", title: "Customer contact", width: 170, text: (r) => r.customerContact, render: (_, r) => dim(r.customerContact) },
  { key: "shipmentOwner", title: "Shipment owner", width: 160, text: (r) => r.shipmentOwner, render: (_, r) => dim(r.shipmentOwner) },
  { key: "customsDocs", title: "Customs docs", width: 180, text: (r) => r.customsDocs, render: (_, r) => dim(r.customsDocs) },
  {
    key: "mrn",
    title: "MRN",
    width: 170,
   
    text: (r) => r.mrn,
    render: (_, r) => (r.mrn && r.mrn !== "—" ? <span className="text-slate-600 font-mono">{r.mrn}</span> : <span className="text-red-500 font-medium">missing</span>),
  },
  {
    key: "customsStatus",
    title: "Customs status",
    width: 210,
   
    text: (r) => r.customsStatus,
    filterOptions: CUSTOMS_STATUSES,
    onCell: (r) => tint("customsStatus", r.customsStatus),
    render: (_, r) => dim(r.customsStatus),
  },
  {
    key: "armed",
    title: "Release",
    width: 130,
    text: releaseText,
    filterOptions: ["ARMED", "NOT armed", "n/a — příjem"],
    render: (_, r) =>
      r.visit !== "výdej" ? (
        <span className="text-slate-300">n/a — příjem</span>
      ) : (
        <span className={`font-medium ${r.armed ? "text-emerald-600" : "text-red-500"}`}>{r.armed ? "ARMED" : "NOT armed"}</span>
      ),
  },
  { key: "pin", title: "PIN", width: 90, text: (r) => (r.hasPin ? "set" : ""), render: (_, r) => (r.hasPin ? <span className="font-mono tracking-[2px] text-slate-400">••••</span> : dim("")) },
  { key: "visit", title: "Příjem / výdej", width: 130, defaultVisible: false, text: (r) => r.visit, filterOptions: [...VISITS], render: (_, r) => dim(r.visit) },
  { key: "colli", title: "Colli", width: 90, defaultVisible: false, align: "right", text: (r) => String(r.colli), render: (_, r) => num(String(r.colli)) },
  { key: "status", title: "Status", width: 130, defaultVisible: false, text: (r) => r.status, filterOptions: GATE_STATUSES, render: (_, r) => dim(r.status) },
  { key: "slot", title: "Slot", width: 150, defaultVisible: false, text: (r) => r.slot, render: (_, r) => dim(r.slot) },
  { key: "carrier", title: "Carrier", width: 180, defaultVisible: false, text: (r) => r.carrier, render: (_, r) => dim(r.carrier) },
  { key: "driver", title: "Driver", width: 150, defaultVisible: false, text: (r) => r.driver, render: (_, r) => dim(r.driver) },
  { key: "plate", title: "Plate", width: 120, defaultVisible: false, text: (r) => r.plate, render: (_, r) => dim(r.plate) },
];

// Overview bubbles in the title row, in the same format as the Shipments overview tiles.
const BUBBLES: { id: BubbleId; label: string; hint: string; danger?: boolean; match: (m: GateMovement) => boolean }[] = [
  { id: "attention", label: "Need attention", hint: "Missing release · missing MRN", danger: true, match: (m) => m.needsAttention },
  { id: "lcl", label: "Consol shipments", hint: "LCL consolidation movements", match: (m) => isLcl(m.operationType) },
  { id: "fcl", label: "FCL shipments", hint: "FCL stuffing · stripping · transload", match: (m) => isFcl(m.operationType) },
];

// The toolbar stamp buttons: the same stamps as the buttons in the gate job header, applied to the
// rows selected in the grid. A movement already stamped is skipped, and the release also
// needs the movement to be armed (every release gate OK, or overridden on its job).
type StampAction = { kind: "expReceipt" | "expDraft" | "impRelease"; label: string; needsArmed?: boolean; primary?: boolean; skipHint: string };

const STAMP_ACTIONS: StampAction[] = [
  { kind: "expReceipt", label: "WH receipt", skipHint: "already stamped" },
  { kind: "expDraft", label: "WH Draft Receipt", skipHint: "already stamped" },
  { kind: "impRelease", label: "WH release", needsArmed: true, primary: true, skipHint: "already released or not armed" },
];

// The gate clerk's workstation: one row per expected movement, on the app's standard grid.
export function GateLogView() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { movements, isLoading } = useGateLog();
  const [selection, setSelection] = useState<{ rows: GateMovement[]; clear: () => void }>({ rows: [], clear: () => {} });
  const [stampAction, setStampAction] = useState<StampAction | null>(null);
  const [stamping, setStamping] = useState(false);

  const [bubble, setBubble] = useState<BubbleId | null>(null);

  const rows = useMemo(() => {
    const b = BUBBLES.find((x) => x.id === bubble);
    return b ? movements.filter(b.match) : movements;
  }, [movements, bubble]);

  const onSelectionChange = useCallback((rows: GateMovement[], clear: () => void) => setSelection({ rows, clear }), []);

  // Each action stamps the selected movements, the same stamp as the button in the job header.
  const eligible = (a: StampAction) => selection.rows.filter((m) => !m[a.kind] && (!a.needsArmed || m.armed));
  const runStamp = async (a: StampAction) => {
    const rows = eligible(a);
    setStamping(true);
    try {
      await Promise.all(rows.map((m) => api.warehouse.gateMovementStamp(m.id, { kind: a.kind })));
      await queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
      toast.success(`${a.label} stamped on ${rows.length} movement${rows.length === 1 ? "" : "s"} — filed to Documents`);
      selection.clear();
      setStampAction(null);
    } catch (e) {
      toast.error(errorMessage(e, `Failed to stamp ${a.label}`));
    } finally {
      setStamping(false);
    }
  };

  const pick = (a: StampAction) => {
    if (selection.rows.length === 0) {
      toast.info("Tick the movements in the grid first, then pick the stamp.");
      return;
    }
    if (eligible(a).length === 0) {
      toast.info(`Nothing to stamp — every selected movement is ${a.skipHint}.`);
      return;
    }
    setStampAction(a);
  };

  // One button per stamp, in the same order and style as the gate job header.
  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      {STAMP_ACTIONS.map((a) => (
        <button
          key={a.kind}
          type="button"
          onClick={() => pick(a)}
          className={[
            "flex items-center shrink-0 rounded-lg px-3 h-8 text-[13px] transition-colors",
            a.primary
              ? "bg-indigo-600 text-white font-semibold hover:bg-indigo-700 border-none"
              : "border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50",
          ].join(" ")}
        >
          {a.label}
        </button>
      ))}
    </div>
  );

  // Filter tiles across the page width, in the same card layout as the status cards inside
  // a warehouse job: small uppercase label, big number.
  const bubbles = (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
      {BUBBLES.map((b) => {
        const on = bubble === b.id;
        const count = movements.filter(b.match).length;
        return (
          <Tooltip key={b.id} title={b.hint} mouseEnterDelay={0.4}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setBubble(on ? null : b.id)}
              className={[
                "text-left rounded-xl border shadow-sm px-4 py-3 min-w-0 transition-colors cursor-pointer",
                on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <div className={`text-[11px] font-bold uppercase tracking-wide ${on ? "text-indigo-600" : "text-slate-500"}`}>{b.label}</div>
              <div
                className={`mt-1 text-[26px] leading-tight font-bold tabular-nums ${
                  b.danger && count > 0 ? "text-red-600" : on ? "text-indigo-700" : "text-slate-900"
                }`}
              >
                {count}
              </div>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );

  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">
        <AppGrid<GateMovement>
          title="Gate Log"
          subHeader={bubbles}
          actions={actions}
          searchPlaceholder="Search gate ref, customer, MRN…"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => router.push(`/warehouse/gate-log/${r.id}`)}
          storageKey="warehouse:gate-log"
          exportFilePrefix="gate-log"
          hideExport
          emptyText={movements.length ? "No movements match this filter." : "No gate movements yet."}
          resetKey={bubble ?? ""}
          onSelectionChange={onSelectionChange}
        />

        {stampAction && (
          <ConfirmModal
            open
            onClose={() => setStampAction(null)}
            onConfirm={() => runStamp(stampAction)}
            title={stampAction.label}
            description={`Stamp the ${stampAction.label} on ${eligible(stampAction).length} selected movement${
              eligible(stampAction).length === 1 ? "" : "s"
            }?${
              selection.rows.length - eligible(stampAction).length > 0
                ? ` ${selection.rows.length - eligible(stampAction).length} selected movement(s) are skipped (${stampAction.skipHint}).`
                : ""
            } The stamp is filed to Documents and cannot be taken back.`}
            confirmLabel={stampAction.label}
            loading={stamping}
          />
        )}
      </div>
    </div>
  );
}
