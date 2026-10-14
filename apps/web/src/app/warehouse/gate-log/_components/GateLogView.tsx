"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tooltip } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useQueryClient } from "@tanstack/react-query";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/lib/toast";
import { api } from "@/lib/api";
import { useGateLog, type GateMovement, type GateStampKind } from "@/hooks/useGateLog";
import { getCellConditionalStyle } from "@/lib/columnConfig";
import { reportBulk, runBulk } from "@/app/warehouse/_components/tabs/shared";
import { DIRECTIONS, RELEASE_GATES_VALUES, TERMS, directionOfVisit, releaseGatesText } from "@/app/warehouse/_lib/glossary";
import { CUSTOMS_CLEARED, CUSTOMS_STATUSES, GATE_STATUSES, OPERATION_TYPES, PACKINGS, isFcl, isLcl, nf } from "../_lib/gate";
import { PrintLabelsModal } from "./PrintLabelsModal";
import { gateSteps } from "../_lib/steps";

type BubbleId = "attention" | "lcl" | "fcl";

// Cells render like the Shipments grid: plain slate text, a light "—" when empty, the
// reference in bold indigo mono, and status colour as a light cell tint (same rules).
const dim = (v: string) => (v ? <span className="text-slate-600">{v}</span> : <span className="text-slate-300">—</span>);
const num = (v: string) => <span className="text-slate-600 tabular-nums">{v}</span>;
const tint = (column: string, value: string) => {
  const bg = getCellConditionalStyle(column, value, {})?.backgroundColor;
  return bg ? { style: { backgroundImage: `linear-gradient(${bg}, ${bg})` } } : {};
};
// Same rule as the server's "Need attention": an MRN is only missing on outgoing cargo
// (výdej, outbound) whose customs status is not cleared yet and that has not left; anywhere else no MRN is fine.
const mrnMissing = (r: GateMovement) =>
  r.visit === "výdej" && !r.impRelease && !r.gateOut && r.customsStatus !== CUSTOMS_CLEARED && (!r.mrn.trim() || r.mrn === "—");
const RELEASE_TEXT_TONE: Record<string, string> = {
  [TERMS.clear]: "font-medium text-emerald-600",
  [TERMS.released]: "font-medium text-emerald-600",
  [TERMS.blocked]: "font-medium text-red-500",
};

// Default columns in the order of the gate desk sketch; the rest are behind Columns.
// Widths follow the Shipments column config for comparable fields. Column keys stay as they
// were (e.g. "handling" for Direction), so saved column choices keep working.
const COLUMNS: AppGridColumn<GateMovement>[] = [
  { key: "gateRef", title: TERMS.warehouseRef, width: 160, text: (r) => r.gateRef, render: (_, r) => <span className="font-mono font-bold text-indigo-500">{r.gateRef}</span> },
  // Direction follows the visit (příjem / výdej), which the stamps and release rules use.
  {
    key: "handling",
    title: TERMS.direction,
    width: 120,
    text: (r) => directionOfVisit(r.visit),
    filterOptions: [...DIRECTIONS],
    render: (_, r) => dim(directionOfVisit(r.visit)),
  },
  { key: "operationType", title: "Operation", width: 180, text: (r) => r.operationType, filterOptions: OPERATION_TYPES, render: (_, r) => dim(r.operationType) },
  { key: "packing", title: "Packing", width: 150, text: (r) => r.packing, filterOptions: PACKINGS, render: (_, r) => dim(r.packing) },
  { key: "weightKg", title: "Weight kg", width: 110, align: "right", text: (r) => String(r.weightKg), render: (_, r) => num(nf(r.weightKg)) },
  { key: "measureCbm", title: TERMS.volumeCbm, width: 120, align: "right", text: (r) => String(r.measureCbm), render: (_, r) => num(nf(r.measureCbm, 1)) },
  { key: "customer", title: "Customer", width: 180, text: (r) => r.customer, render: (_, r) => dim(r.customer) },
  { key: "customerContact", title: "Customer contact", width: 170, text: (r) => r.customerContact, render: (_, r) => dim(r.customerContact) },
  { key: "shipmentOwner", title: "Shipment owner", width: 160, text: (r) => r.shipmentOwner, render: (_, r) => dim(r.shipmentOwner) },
  { key: "customsDocs", title: "Customs docs", width: 180, text: (r) => r.customsDocs, render: (_, r) => dim(r.customsDocs) },
  {
    key: "mrn",
    title: "MRN",
    width: 170,
   
    text: (r) => r.mrn,
    render: (_, r) =>
      r.mrn.trim() && r.mrn !== "—" ? (
        <span className="text-slate-600 font-mono">{r.mrn}</span>
      ) : mrnMissing(r) ? (
        <span className="text-red-500 font-medium">missing</span>
      ) : (
        dim("")
      ),
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
    title: TERMS.releaseGates,
    width: 140,
    text: releaseGatesText,
    filterOptions: RELEASE_GATES_VALUES,
    render: (_, r) => <span className={RELEASE_TEXT_TONE[releaseGatesText(r)] ?? "text-slate-300"}>{releaseGatesText(r)}</span>,
  },
  { key: "pin", title: "PIN", width: 90, text: (r) => (r.hasPin ? "set" : ""), render: (_, r) => (r.hasPin ? <span className="font-mono tracking-[2px] text-slate-400">••••</span> : dim("")) },
  { key: "colli", title: TERMS.pieces, width: 90, defaultVisible: false, align: "right", text: (r) => String(r.colli), render: (_, r) => num(String(r.colli)) },
  { key: "status", title: TERMS.warehouseStatus, width: 150, defaultVisible: false, text: (r) => r.status, filterOptions: GATE_STATUSES, render: (_, r) => dim(r.status) },
  { key: "slot", title: "Slot", width: 150, defaultVisible: false, text: (r) => r.slot, render: (_, r) => dim(r.slot) },
  { key: "carrier", title: "Carrier", width: 180, defaultVisible: false, text: (r) => r.carrier, render: (_, r) => dim(r.carrier) },
  { key: "driver", title: TERMS.driver, width: 150, defaultVisible: false, text: (r) => r.driver, render: (_, r) => dim(r.driver) },
  { key: "plate", title: "Plate", width: 120, defaultVisible: false, text: (r) => r.plate, render: (_, r) => dim(r.plate) },
];

// Overview bubbles in the title row, in the same format as the Shipments overview tiles.
const BUBBLES: { id: BubbleId; label: string; hint: string; danger?: boolean; match: (m: GateMovement) => boolean }[] = [
  { id: "attention", label: "Need attention", hint: "Outbound: release gates blocked · MRN missing while customs not cleared", danger: true, match: (m) => m.needsAttention },
  { id: "lcl", label: "Consol shipments", hint: "LCL consolidation movements", match: (m) => isLcl(m.operationType) },
  { id: "fcl", label: "FCL shipments", hint: "FCL stuffing · stripping · transload", match: (m) => isFcl(m.operationType) },
];

// Bulk stamps follow the same step order as the gate job (see _lib/steps): a movement is
// stamped only when this stamp is its next step — inbound: Gate-in, Draft receipt, Receipt,
// Gate-out; outbound: Gate-in (truck), WH release (once the release gates are clear), Gate-out.
// Everything else is skipped, with the reason. `shipment` says what the stamp writes to the
// linked shipment.
type StampAction = { kind: GateStampKind; label: string; primary?: boolean; skipHint: string; shipment?: string };

const STAMP_ACTIONS: StampAction[] = [
  { kind: "gateIn", label: TERMS.gateIn, skipHint: "already gated in", shipment: "received date (inbound cargo only)" },
  { kind: "expDraft", label: TERMS.draftReceipt, skipHint: "outbound, already stamped, or not gated in yet" },
  { kind: "expReceipt", label: TERMS.receipt, skipHint: "outbound, already stamped, or without a draft receipt" },
  {
    kind: "impRelease",
    label: TERMS.whRelease,
    primary: true,
    skipHint: "inbound, already released, not gated in yet, or release gates blocked",
    shipment: "released date and plate",
  },
  { kind: "gateOut", label: TERMS.gateOut, skipHint: "already gated out, or an earlier step is not stamped yet" },
];

// True when `kind` is the movement's next step in the job's step bar.
const isNextStep = (m: GateMovement, kind: GateStampKind) => gateSteps(m).some((s) => s.kind === kind && s.state === "next");

// The gate clerk's workstation: one row per expected movement, on the app's standard grid.
// `embedded` shows it as the Warehouse page's Gate Log tab, under the module tabs (`header`).
export function GateLogView({ embedded, header }: { embedded?: boolean; header?: ReactNode } = {}) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { movements, isLoading } = useGateLog();
  const [selection, setSelection] = useState<{ rows: GateMovement[]; clear: () => void }>({ rows: [], clear: () => {} });
  const [stampAction, setStampAction] = useState<StampAction | null>(null);
  const [stamping, setStamping] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const [bubble, setBubble] = useState<BubbleId | null>(null);

  const rows = useMemo(() => {
    const b = BUBBLES.find((x) => x.id === bubble);
    return b ? movements.filter(b.match) : movements;
  }, [movements, bubble]);

  const onSelectionChange = useCallback((rows: GateMovement[], clear: () => void) => setSelection({ rows, clear }), []);

  // Each action stamps the selected movements, the same stamp as the button in the job header.
  const eligible = (a: StampAction) => selection.rows.filter((m) => isNextStep(m, a.kind));
  // Stamps row by row: one rejected movement does not stop the others, and the toast reports
  // how many were stamped and why the rest were not. Failed rows stay ticked to retry.
  const runStamp = async (a: StampAction) => {
    setStamping(true);
    const result = await runBulk(eligible(a), (m) => api.warehouse.gateMovementStamp(m.id, { kind: a.kind }));
    await queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] });
    setStamping(false);
    setStampAction(null);
    reportBulk(toast, result, { verb: `${a.label} stamped on`, nouns: ["movement", "movements"], label: (m) => m.gateRef });
    if (result.failed.length === 0) selection.clear();
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
      <button
        type="button"
        onClick={() => (selection.rows.length ? setPrintOpen(true) : toast.info("Tick the movements in the grid first, then print their labels."))}
        className="flex items-center gap-1.5 shrink-0 rounded-lg px-3 h-8 text-[13px] border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <PrinterOutlined /> Print labels
      </button>
    </div>
  );

  // Filter tiles across the page width, in the card style of the warehouse job: the label
  // with its count beside it ("NEED ATTENTION: 1").
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
                "w-full text-left rounded-xl border shadow-sm px-4 py-3 min-w-0 transition-colors cursor-pointer",
                on ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="flex items-baseline gap-2">
                <span className={`text-[15px] font-bold uppercase tracking-wide ${on ? "text-indigo-600" : "text-slate-500"}`}>{b.label}:</span>
                <span
                  className={`text-[22px] leading-tight font-bold tabular-nums ${
                    b.danger && count > 0 ? "text-red-600" : on ? "text-indigo-700" : "text-slate-900"
                  }`}
                >
                  {count}
                </span>
              </div>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );

  const content = (
    <>
      <AppGrid<GateMovement>
        title={embedded ? "Warehouse" : "Gate Log"}
        subHeader={
          embedded ? (
            <>
              {header}
              {bubbles}
            </>
          ) : (
            bubbles
          )
        }
        actions={actions}
        searchPlaceholder="Search warehouse ref, customer, MRN…"
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
          } The stamp cannot be taken back${stampAction.shipment ? ` and sets the linked shipment's ${stampAction.shipment} (if any)` : ""}.`}
          confirmLabel={stampAction.label}
          loading={stamping}
        />
      )}

      <PrintLabelsModal open={printOpen} movements={selection.rows} onClose={() => setPrintOpen(false)} />
    </>
  );
  if (embedded) return content;
  return (
    <div className="bg-slate-50 min-h-full px-8 py-6">
      <div className="max-w-[1400px] mx-auto">{content}</div>
    </div>
  );
}
