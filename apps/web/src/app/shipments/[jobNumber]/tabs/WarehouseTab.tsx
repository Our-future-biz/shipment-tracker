"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { replaceSearchParams } from "@/lib/urlParams";
import { WAREHOUSE_SUB_PARAM, warehouseSubTabOf } from "./warehouse/subTab";
import { Input, Button, Modal, Tooltip } from "antd";
import { useMessages, type Messages } from "@/lib/toast";
import { CheckCircleFilled, PlusOutlined, WarningOutlined } from "@ant-design/icons";
import { buildRowData, getFieldValue, type ShipmentItem } from "@/hooks/useShipments";
import type { interfaces } from "@/lib/api/client";
import { formatDateTime } from "@/lib/date";
import { loadTypeLabel } from "@/lib/enums";
import { NOT_STACKABLE, STACKABLE, adrUnText, dimensionLineVolume, dimensionTotals, hasAdr, isDangerousShipment, numberInput, shipmentStackability } from "@/lib/cargo";
import { SectionChangedError, useWarehouseSection } from "@/hooks/useWarehouseSection";
import { apiErrorMessage } from "@/lib/api";
import { informedText } from "@/lib/informOperations";
import { SectionCard as Card, PillTabs } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { ADD_BTN, BTN_BAR, HINT, TD, TH } from "@/styles/ui";
import { COLS2, EMPTY, LABEL, ROW, VALUE } from "../_components/detailStyles";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { TD_CELL, TH_CELL, TOTAL_CELL, rowLine } from "./warehouse/warehouseUi";
import { PickupSection } from "./warehouse/PickupSection";
import { JobNotes, ActionPushButtons } from "./warehouse/JobExtras";
import { RemeasureCompare, figuresCompared, figuresDiffer, noFigures } from "./warehouse/RemeasureCompare";
import { roundedFigures, shipmentCargoFigures, tidyNumber } from "./warehouse/remeasuredLines";

interface JobSectionData {
  inform_operations_sent?: string;
  // The warehouse's own remeasured lines (JSON of DimensionRow[]), kept apart from the
  // shipment's cargo dimensions.
  remeasure_rows?: string;
  [key: string]: string | undefined;
}
function asJobSection(data: unknown): JobSectionData {
  return data && typeof data === "object" ? (data as JobSectionData) : {};
}

// W/M (weight or measure) = the greater of weight in tons vs volume in CBM
function computeWM(weightTons?: string | null, volumeCbm?: string | null): string {
  const w = parseFloat(String(weightTons ?? "")) || 0;
  const v = parseFloat(String(volumeCbm ?? "")) || 0;
  if (w === 0 && v === 0) return "—";
  return Math.max(w, v).toFixed(3);
}

// Label/value row, the same shape the detail cards use (detailStyles).
function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className={value ? VALUE : `flex-1 min-w-0 ${EMPTY}`}>{value || "—"}</span>
    </div>
  );
}

const SUB_TABS = [
  { key: "details", label: "Shipment Details" },
  { key: "pickup", label: "Pick-up" },
];

export function WarehouseTab({ shipment }: { shipment: ShipmentItem }) {
  // A link may open the Pick-up straight away (`sub=pickup`, mock council S10-5); a click keeps the
  // URL in step, so a reload stays where the user is.
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [subTab, setSubTabState] = useState<string>(() => warehouseSubTabOf(searchParams.get(WAREHOUSE_SUB_PARAM)));
  const setSubTab = (key: string) => {
    setSubTabState(key);
    replaceSearchParams(pathname, { [WAREHOUSE_SUB_PARAM]: key === "pickup" ? "pickup" : null });
  };
  // The app's own toasts, so a save that ends after the tab is left still says how it went.
  const messageApi = useMessages();
  const rowData = buildRowData(shipment);
  // Weight and volume of the cargo as Cargo Details holds it (its lines' totals); a shipment with
  // no cargo lines falls back to its own totals.
  const cargo = dimensionTotals(shipment.cargoDimensions ?? []);
  const ownKg = (parseFloat(String(shipment.totalWeightTons ?? "")) || 0) * 1000;
  const ownCbm = parseFloat(String(shipment.totalVolumeCbm ?? "")) || 0;
  const weightKg = cargo.kg > 0 ? cargo.kg : ownKg;
  const volumeCbm = cargo.m3 > 0 ? cargo.m3 : ownCbm;

  return (
    <div className="flex flex-col gap-4">
      <PillTabs tabs={SUB_TABS} active={subTab} onChange={setSubTab} />

      {subTab === "details" && (
        <>
          {/* The rows of the shipment's own detail cards */}
          <Card title="Shipment details" extra={<ShipmentBadges shipment={shipment} />} bodyClassName="px-4 py-1.5">
            <div className={COLS2}>
              <div>
                <Row label="Container #" value={shipment.containerNumber} />
                <Row label="Colli / PCS" value={shipment.pcs} />
                <Row label="Load type" value={loadTypeLabel(shipment.loadType, shipment.freightMode)} />
                <Row label="Customs procedure" value={rowData["customsProcedure"]} />
              </div>
              <div>
                <Row label="Weight (kg)" value={weightKg > 0 ? weightKg.toFixed(1) : ""} />
                <Row label="Volume (CBM)" value={volumeCbm > 0 ? volumeCbm.toFixed(3) : ""} />
                <Row label="W/M" value={computeWM(String(weightKg / 1000), String(volumeCbm))} />
                {/* The Pick-up's plates when it has any (several: "1AB 2345, 3CD 4567"), else the shipment's own. Display only. */}
                <Row label="Plate number" value={shipment.licensePlate?.trim() || shipment.plateNumber} />
                <Row label="Dimensions" value={getFieldValue(shipment, "dimensionsSummary")} />
              </div>
            </div>
          </Card>

          {/* the warehouse's own work first, then its notes and what it sent, side by side */}
          <DimensionsEditor shipment={shipment} messageApi={messageApi} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <JobNotes ownerId={shipment.id} messageApi={messageApi} />
            <ActionPushButtons ownerId={shipment.id} messageApi={messageApi} />
          </div>
        </>
      )}

      {subTab === "pickup" && (
        <Card title="Pick-up">
          <PickupSection ownerId={shipment.id} messageApi={messageApi} />
        </Card>
      )}
    </div>
  );
}

// ─── Stackability Badge ─────────────────────────────────────────

function StackabilityBadge({ shipment }: { shipment: ShipmentItem }) {
  const value = shipmentStackability(shipment.cargoDimensions ?? []);
  const stackability = value === STACKABLE ? "stackable" : value === NOT_STACKABLE ? "not_stackable" : "unknown";
  const tone = stackability === "stackable" ? "green" : stackability === "not_stackable" ? "red" : "slate";
  const label = stackability === "stackable" ? "Stackable" : stackability === "not_stackable" ? "Not stackable" : "Unknown stackability";
  return <Pill tone={tone}>{label}</Pill>;
}

// What the warehouse has to know of the cargo at a glance: dangerous goods only when it is, and a
// click on that shows what was filled in.
function ShipmentBadges({ shipment }: { shipment: ShipmentItem }) {
  const [dangerousOpen, setDangerousOpen] = useState(false);
  return (
    <span className="flex items-center gap-2">
      {isDangerousShipment(shipment) && (
        <button type="button" aria-haspopup="dialog" className="bg-transparent border-none p-0 cursor-pointer" onClick={() => setDangerousOpen(true)}>
          <Pill tone="red">Dangerous goods</Pill>
        </button>
      )}
      <StackabilityBadge shipment={shipment} />
      <DangerousGoodsDialog shipment={shipment} open={dangerousOpen} onClose={() => setDangerousOpen(false)} />
    </span>
  );
}

function DangerousGoodsDialog({ shipment, open, onClose }: { shipment: ShipmentItem; open: boolean; onClose: () => void }) {
  const lines = (shipment.cargoDimensions ?? []).filter(hasAdr);
  const containerOf = (id: string | null | undefined) => shipment.containers?.find((c) => c.id === id)?.containerNumber || "\u2014";
  const inContainers = lines.some((l) => l.containerId);
  const text = (value: string | null | undefined) => value?.trim() || "\u2014";
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={720} title="Dangerous goods" destroyOnHidden>
      {lines.length ? (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {inContainers && <th scope="col" className={TH}>Container</th>}
              <th scope="col" className={TH}>Pieces</th>
              <th scope="col" className={TH}>Package</th>
              <th scope="col" className={TH}>UN number</th>
              <th scope="col" className={TH}>Class</th>
              <th scope="col" className={TH}>Packing group</th>
              <th scope="col" className={TH}>Limited quantity</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                {inContainers && <td className={TD}>{containerOf(l.containerId)}</td>}
                <td className={TD}>{text(l.pieces)}</td>
                <td className={TD}>{text(l.packageType)}</td>
                <td className={TD}>{text(adrUnText(l))}</td>
                <td className={TD}>{text(l.adrClass)}</td>
                <td className={TD}>{text(l.adrPackingGroup)}</td>
                <td className={TD}>{l.adrLimitedQuantity ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className={HINT}>Marked as dangerous goods, but no details have been filled in under Cargo Details.</p>
      )}
    </Modal>
  );
}

// ─── Dimensions / Remeasurement Editor (shipment-specific) ──────
// The warehouse's own remeasured lines, kept in its job section (remeasure_rows, the same
// JSON as in Warehouse Concept) and compared with the shipment's cargo dimensions, which
// stay as Cargo Details holds them: the difference is what the customer is told about.

const DIM_FIELDS = ["pieces", "lengthCm", "widthCm", "heightCm", "weightPerPcKg"] as const;
type DimField = (typeof DIM_FIELDS)[number];
type DimensionRow = Record<DimField, string>;

const EMPTY_DIM: DimensionRow = { pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" };

function parseRemeasure(json: string | undefined): DimensionRow[] {
  try {
    const arr: unknown = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr.map((r) => ({ ...EMPTY_DIM, ...(r as Partial<DimensionRow>) })) : [];
  } catch {
    return [];
  }
}

// The lines as stored: only the filled ones, each figure tidied - "120." as 120, ".5" as 0.5
// (council finding m7), as Cargo Details and the server read them.
const serializeRows = (rows: DimensionRow[]) =>
  JSON.stringify(rows.filter((r) => DIM_FIELDS.some((f) => r[f].trim())).map((r) => Object.fromEntries(DIM_FIELDS.map((f) => [f, tidyNumber(r[f])]))));

// A copy of a line: its figures only, so it gets a row key of its own.
const copyOf = (r: DimensionRow): DimensionRow => ({ pieces: r.pieces, lengthCm: r.lengthCm, widthCm: r.widthCm, heightCm: r.heightCm, weightPerPcKg: r.weightPerPcKg });

const FIELD_NAMES: Record<DimField, string> = { pieces: "Qty", lengthCm: "Length", widthCm: "Width", heightCm: "Height", weightPerPcKg: "Weight per piece" };

// A remeasured line counted as a cargo dimension line (lib/cargo): its volume from its sizes.
const asLine = (r: DimensionRow): interfaces.CargoDimensionLine => ({ containerId: null, packageType: "", stackable: "", volumePerPcM3: "", ...r });

function DimensionsEditor({ shipment, messageApi }: { shipment: ShipmentItem; messageApi: Messages }) {
  const { data: jobSectionData, saveKeys, isSaving, informOperations: inform, isInforming } = useWarehouseSection(shipment.id, "job");
  const jobSection = asJobSection(jobSectionData);
  const informedAt = jobSection.inform_operations_sent;
  const saved = jobSection.remeasure_rows;

  // Each line keeps its own key (rowKey), so a delete or an open line always means the line it was
  // asked for, also after the lines changed meanwhile.
  const [rows, setRows] = useState<DimensionRow[]>([{ ...EMPTY_DIM }]);
  // Typed but not saved yet: the saved lines then don't replace what is on screen. A line just
  // added is empty, so nothing yet.
  const [dirty, setDirty] = useState(false);
  // The last save was refused (not by somebody else's save): the lines stay unsaved, with a Retry.
  const [failed, setFailed] = useState(false);
  // The saved lines the edit started from: a save replaces exactly those, or is refused.
  const baseRef = useRef(saved ?? "");
  // The saved lines fill the table while it holds no unsaved edit. A screen that already shows them
  // (its own save come back) stays as it is, with a line just added and every line's key.
  useEffect(() => {
    if (dirty) return;
    baseRef.current = saved ?? "";
    const parsed = parseRemeasure(saved);
    setRows((prev) => (serializeRows(prev) === serializeRows(parsed) ? prev : parsed.length > 0 ? parsed : [{ ...EMPTY_DIM }]));
  }, [saved, dirty]);
  // The lines as they are now, for the click-outside handler.
  const rowsRef = useRef(rows);
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    rowsRef.current = rows;
    dirtyRef.current = dirty;
  }, [rows, dirty]);

  // Saved by itself, with no Save button: when a line is left (a click outside it, Tab out of it,
  // Enter), and at once after a copy or a delete. Saves run one after another, each replacing
  // exactly the lines the one before wrote; only the lines of the warehouse's job section are
  // written (notes saved meanwhile stay), and the shipment's cargo dimensions are not touched.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const persist = (next: DimensionRow[]) => {
    const value = serializeRows(next);
    chainRef.current = chainRef.current.then(async () => {
      // nothing to write: the lines are as saved (no lines saved yet and none filled, too)
      if (value === baseRef.current || (baseRef.current === "" && value === "[]")) {
        setFailed(false);
        if (serializeRows(rowsRef.current) === value) setDirty(false);
        return;
      }
      try {
        await saveKeys([{ key: "remeasure_rows", value, expected: baseRef.current }]);
        baseRef.current = value;
        setFailed(false);
        // nothing typed meanwhile: the saved lines show again
        if (serializeRows(rowsRef.current) === value) setDirty(false);
      } catch (e) {
        if (e instanceof SectionChangedError) {
          // Someone else saved the lines meanwhile: theirs show, as a note saved meanwhile does.
          setFailed(false);
          setDirty(false);
          messageApi.warning("Someone else saved the remeasured lines meanwhile — theirs are shown; enter your changes again");
        } else {
          setFailed(true);
          messageApi.error(`Failed to save the remeasured lines: ${apiErrorMessage(e)}`);
        }
      }
    });
  };
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  // A filled line reads as text; a double-click (or ⋯ > Edit) opens it, and a click anywhere else,
  // Tab out of it or Enter closes it again and saves it, as in Cargo Details. An empty line stays
  // open to be typed in. `openRef` follows the open lines at once, so a line left by a click and
  // by its focus leaving with it is saved once.
  const [openRows, setOpenRowsState] = useState<Set<string>>(() => new Set());
  const openRef = useRef(openRows);
  const setOpen = (next: Set<string>) => {
    openRef.current = next;
    setOpenRowsState(next);
  };
  // The field that takes the cursor when its line opens.
  const [focus, setFocus] = useState<{ key: string; field: DimField } | null>(null);
  const openRow = (key: string, field: DimField = "pieces") => {
    if (!openRef.current.has(key)) setOpen(new Set(openRef.current).add(key));
    setFocus({ key, field });
  };
  const leaveRow = (key: string) => {
    if (!openRef.current.has(key)) return;
    const next = new Set(openRef.current);
    next.delete(key);
    setOpen(next);
    if (dirtyRef.current) persist(rowsRef.current);
  };
  const leaveAllRef = useRef(() => {});
  useEffect(() => {
    leaveAllRef.current = () => {
      if (openRef.current.size === 0) return;
      setOpen(new Set());
      if (dirtyRef.current) persistRef.current(rowsRef.current);
    };
  });
  const isFilled = (r: DimensionRow) => DIM_FIELDS.some((f) => r[f].trim());
  const isOpen = (r: DimensionRow) => openRows.has(rowKey(r)) || !isFilled(r);
  const anyOpen = openRows.size > 0;
  useEffect(() => {
    if (!anyOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || target.closest("[data-remeasure-open], .ant-tooltip")) return;
      leaveAllRef.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anyOpen]);
  // Leaving the tab (or the page) with a line still open saves it too.
  useEffect(
    () => () => {
      if (dirtyRef.current) persistRef.current(rowsRef.current);
    },
    [],
  );

  const updateRow = (key: string, field: DimField, value: string) => {
    // typing keeps the line open, so it cannot close mid-number
    if (!openRef.current.has(key)) setOpen(new Set(openRef.current).add(key));
    setRows((prev) => prev.map((r) => (rowKey(r) === key ? { ...r, [field]: value } : r)));
    setDirty(true);
  };
  // A new line is empty, so nothing is saved until it is filled and left; the cursor goes into it.
  const addRow = () => {
    const line = { ...EMPTY_DIM };
    setRows((prev) => [...prev, line]);
    setFocus({ key: rowKey(line), field: "pieces" });
  };
  const deleteRow = (key: string) => {
    const left = rows.filter((r) => rowKey(r) !== key);
    if (left.length === rows.length) return;
    const next = left.length > 0 ? left : [{ ...EMPTY_DIM }];
    setRows(next);
    setOpen(new Set());
    setDirty(true);
    persist(next);
  };
  // A copy of the line goes right under it.
  const copyRow = (key: string) => {
    const idx = rows.findIndex((r) => rowKey(r) === key);
    if (idx < 0) return;
    const next = [...rows.slice(0, idx + 1), copyOf(rows[idx]!), ...rows.slice(idx + 1)];
    setRows(next);
    setOpen(new Set());
    setDirty(true);
    persist(next);
  };
  // The line Delete asks about, by its key: gone meanwhile (somebody else's lines shown), the
  // question goes with it.
  const [toDelete, setToDelete] = useState<string | null>(null);
  const deleting = toDelete === null ? undefined : rows.find((r) => rowKey(r) === toDelete);

  const lines = rows.map(asLine);
  const rowCbms = lines.map(dimensionLineVolume);
  const { pcs: totalColli, kg: totalWeightKg, m3: totalVolumeCbm } = dimensionTotals(lines);

  // What the server compares with when Operations are told, rounded as it rounds both sides
  // (council finding m10): the shipment's cargo dimension lines, a figure they lack from its Pcs,
  // Total Weight and Total Volume - so this tab says what the shipment's Alerts will say.
  const shipmentDims = useMemo(() => shipmentCargoFigures(shipment), [shipment]);

  const remeasured = roundedFigures({ colli: totalColli, weightKg: totalWeightKg, volumeCbm: totalVolumeCbm });
  // A figure only the warehouse measured is a difference too (mock test council Y9) - also when the
  // shipment has no figures at all, which still offers Inform Operations (n16).
  const hasMismatch = figuresDiffer(shipmentDims, remeasured);
  const hasData = totalColli > 0 || totalWeightKg > 0 || totalVolumeCbm > 0;

  // Inform Operations: one request records when and posts "Cargo has been remeasured by the
  // warehouse" with the SAVED lines' figures to the shipment's chat, tagging its Person in Charge and
  // Holiday Cover (the server finds them) - both, or neither. Only with the lines saved, so what is
  // told is what is on screen; a second click while it runs is ignored.
  const informingRef = useRef(false);
  const informBlocked = failed
    ? "The lines aren't saved — Retry first; Operations are told the saved figures"
    : dirty
      ? "Finish the line first (click outside it, Tab out of it or press Enter) — Operations are told the saved figures"
      : null;
  const informOperations = async () => {
    if (informingRef.current || informBlocked) return;
    informingRef.current = true;
    try {
      const { tagged } = await inform(informedAt ?? "");
      const told = informedText(tagged);
      messageApi[told.level](told.text);
    } catch (e) {
      messageApi.error(e instanceof SectionChangedError ? e.message : `Operations not informed: ${apiErrorMessage(e)}`);
    } finally {
      informingRef.current = false;
    }
  };

  const compared = figuresCompared(shipmentDims, remeasured);

  return (
    <Card
      title="Dimensions / Remeasurement"
      extra={
        <>
          {/* saved by itself: only while it saves, or when a save failed, is that said */}
          {isSaving && <span className={HINT}>Saving…</span>}
          {failed && !isSaving && (
            <>
              <span className="text-[12px] text-red-600">Not saved</span>
              <button type="button" className={BTN_BAR} onClick={() => persist(rowsRef.current)}>
                Retry
              </button>
            </>
          )}
          <Tooltip title="Add row">
            {/* the small square "+" of Container Details */}
            <Button size="small" type="primary" icon={<PlusOutlined className="text-[11px]" />} aria-label="Add row" onClick={addRow} className={ADD_BTN} />
          </Tooltip>
        </>
      }
    >
      <ConfirmModal
        open={!!deleting}
        danger
        title="Delete line?"
        description="The remeasured line is removed and the change is saved."
        confirmLabel="Delete"
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete !== null) deleteRow(toDelete);
          setToDelete(null);
        }}
      />
      {/* The remeasured lines, as the Container Details table: centred figures, a totals row */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse table-fixed text-[13px]">
          <thead>
            <tr>
              {["Qty", "L (cm)", "W (cm)", "H (cm)", "Weight/pc (kg)"].map((h) => (
                <th key={h} className={`${TH_CELL} text-center`}>
                  {h}
                </th>
              ))}
              <th className={`${TH_CELL} text-center`}>Volume (CBM)</th>
              <th className={`${TH_CELL} w-[76px]`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const key = rowKey(row);
              const open = isOpen(row);
              const actions = (
                // the line's actions behind "⋯", as in Container and Cargo Details; Delete asks first
                <td className={`${TD_CELL} text-center whitespace-nowrap`}>
                  <RowActionsMenu
                    label={`Line ${idx + 1} actions`}
                    onEdit={open ? undefined : () => openRow(key)}
                    onCopy={() => copyRow(key)}
                    onDelete={rows.length > 1 ? () => setToDelete(key) : undefined}
                  />
                </td>
              );
              const volume = (
                // Worked out from the sizes, so text.
                <td className={`${TD_CELL} text-center text-slate-700 tabular-nums`}>
                  {(rowCbms[idx] ?? 0) > 0 ? rowCbms[idx]!.toFixed(4) : <span className={EMPTY}>—</span>}
                </td>
              );
              if (!open) {
                return (
                  <tr
                    key={key}
                    className={`${rowLine(idx, rows.length)} cursor-pointer hover:bg-slate-50/60`}
                    // the field double-clicked takes the cursor
                    onDoubleClick={(e) => openRow(key, ((e.target as Element).closest("[data-field]")?.getAttribute("data-field") as DimField | null) ?? "pieces")}
                    title="Double-click to edit"
                  >
                    {DIM_FIELDS.map((field) => (
                      // as tall as an open line's field, so a line keeps its height when it opens
                      <td key={field} data-field={field} className={`${TD_CELL} h-[37px] text-center tabular-nums text-slate-900`}>
                        {row[field].trim() || <span className={EMPTY}>—</span>}
                      </td>
                    ))}
                    {volume}
                    {actions}
                  </tr>
                );
              }
              return (
                <tr
                  key={key}
                  data-remeasure-open
                  className={rowLine(idx, rows.length)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    (e.target as HTMLElement).blur?.();
                    leaveRow(key);
                  }}
                  // Tab out of the line (or a click on something that takes the focus) leaves it; a
                  // click on nothing in particular is the click-outside handler's.
                  onBlur={(e) => {
                    const next = e.relatedTarget as Node | null;
                    if (next && !e.currentTarget.contains(next)) leaveRow(key);
                  }}
                >
                  {DIM_FIELDS.map((field) => (
                    <td key={field} className={TD_CELL}>
                      {/* Numbers only, like Cargo Details: Qty whole, the rest may take a decimal point; at most 4 digits (weight 5). */}
                      <Input
                        size="small"
                        value={row[field]}
                        placeholder="0"
                        autoFocus={focus?.key === key && focus.field === field}
                        inputMode={field === "pieces" ? "numeric" : "decimal"}
                        onChange={(e) => updateRow(key, field, numberInput(e.target.value, field !== "pieces", field === "weightPerPcKg" ? 5 : 4))}
                        className="w-full text-center tabular-nums"
                        aria-label={`${FIELD_NAMES[field]} of line ${idx + 1}`}
                      />
                    </td>
                  ))}
                  {volume}
                  {actions}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={`${TOTAL_CELL} text-center`}>{totalColli > 0 ? String(totalColli) : "—"}</td>
              {/* the totals under their columns; the comparison below names them */}
              <td className={TOTAL_CELL} colSpan={3} />
              <td className={`${TOTAL_CELL} text-center`}>{totalWeightKg > 0 ? `${totalWeightKg.toFixed(1)} kg` : "—"}</td>
              <td className={`${TOTAL_CELL} text-center`}>{totalVolumeCbm > 0 ? `${totalVolumeCbm.toFixed(3)} CBM` : "—"}</td>
              <td className={TOTAL_CELL} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Shipment against remeasured, figure by figure (each centred under its title); a figure that differs is marked */}
      <div className="mt-5">
        <RemeasureCompare ship={shipmentDims} re={remeasured} freightMode={shipment.freightMode} loadType={shipment.loadType} />
      </div>

      {hasData && hasMismatch && (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-[13px] text-red-700">
            <WarningOutlined /> Remeasured values differ from the shipment values.
          </span>
          <Tooltip title={informBlocked ?? undefined}>
            <span className="inline-flex">
              <Button danger size="small" onClick={informOperations} loading={isInforming} disabled={!!informBlocked}>
                {informedAt ? "Inform Again" : "Inform Operations"}
              </Button>
            </span>
          </Tooltip>
        </div>
      )}
      {/* A match is told too (owner decision, 18 Nov 2026): it goes to the shipment's chat - its
          Notifications - while a difference is also an Alert. */}
      {hasData && compared && !hasMismatch && (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-[13px] text-emerald-700">
            <CheckCircleFilled /> All values match
          </span>
          <Tooltip title={informBlocked ?? undefined}>
            <span className="inline-flex">
              <Button size="small" onClick={informOperations} loading={isInforming} disabled={!!informBlocked}>
                {informedAt ? "Inform Again" : "Inform Operations"}
              </Button>
            </span>
          </Tooltip>
        </div>
      )}
      {/* Nothing to hold the remeasured figures against: they are all new to the shipment - a difference,
          with Inform Operations above (mock test council n16, Y9) - never "match". */}
      {hasData && noFigures(shipmentDims) && (
        <div className={`mt-3 ${HINT}`}>The shipment has no cargo figures yet: the remeasured ones are all new — Cargo Details holds them.</div>
      )}
      {/* Shown whatever the lines say now, e.g. for a shipment informed before its lines changed. */}
      {informedAt && <div className={`mt-2 ${HINT}`}>Operations informed on {formatDateTime(informedAt)}</div>}
    </Card>
  );
}
