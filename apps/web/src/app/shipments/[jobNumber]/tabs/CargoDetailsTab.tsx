"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { Input, Button, AutoComplete, Select, Checkbox } from "antd";
import { CargoDimensionAdrFields } from "./CargoDimensionAdrFields";
import { CheckPill } from "@/app/shipments/_components/CargoCheck";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { SHIPMENT_WRITE_KEY, type ShipmentItem } from "@/hooks/useShipments";
import { useIsMutating } from "@tanstack/react-query";
import {
  PACK_TYPES,
  STACKABLE_OPTIONS,
  hasAdr,
  adrSummary,
  CURRENCIES,
  num,
  fmtNum,
  fmtFixed,
  numberInput,
  dimensionVolumePerPiece,
  dimensionLineIsEmpty,
  checkConsistency,
  compareFigure,
  civByCurrency,
  type CargoItemLine,
  type CargoDimensionLine,
  type ContainerLine,
} from "@/lib/cargo";

// Panel key: the container row id, or "none" for cargo that belongs to the
// shipment directly (no containers / LCL / air).
const NONE = "none";
const keyOf = (containerId: string | null | undefined) => containerId ?? NONE;

const emptyItem = (containerId: string | null): CargoItemLine => ({
  containerId,
  cargoDescription: "",
  hsCode: "",
  pieces: "",
  packageType: "",
  grossWeight: "",
  commercialInvoiceValue: "",
  currency: "USD",
});

const emptyDim = (containerId: string | null): CargoDimensionLine => ({
  containerId,
  pieces: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  weightPerPcKg: "",
  packageType: "",
  stackable: "",
});

const itemIsEmpty = (l: CargoItemLine) =>
  !l.cargoDescription && !l.hsCode && !l.pieces && !l.packageType && !l.grossWeight && !l.commercialInvoiceValue;
const dimIsEmpty = dimensionLineIsEmpty;

// What a table holds, for telling a save's own echo from a real change (another screen,
// a rolled-back save): the non-empty lines with every saved field, defaults filled in.
const itemLineKey = (l: CargoItemLine) => [
  l.containerId ?? null, l.cargoDescription, l.hsCode, l.pieces, l.packageType, l.grossWeight, l.commercialInvoiceValue, l.currency,
];
const itemsKey = (ls: CargoItemLine[]) => JSON.stringify(ls.filter((l) => !itemIsEmpty(l)).map(itemLineKey));
// The pallet and ADR fields as the server stores them ("UN 1203" -> "1203", blanks -> null),
// so a saved line compares equal to what was sent.
const blankToNull = (v: string | null | undefined) => (v == null || !String(v).trim() ? null : String(v).trim());
const dimLineKey = (l: CargoDimensionLine) => [
  l.containerId ?? null, l.pieces, l.lengthCm, l.widthCm, l.heightCm, l.weightPerPcKg, l.packageType, l.stackable,
  blankToNull(l.palletType)?.toUpperCase() ?? null,
  blankToNull(l.adrUn)?.replace(/^UN\s*/i, "") ?? null,
  blankToNull(l.adrClass),
  blankToNull(l.adrPackingGroup)?.toUpperCase() ?? null,
  l.adrLimitedQuantity === true,
];
const dimsKey = (ls: CargoDimensionLine[]) => JSON.stringify(ls.filter((l) => !dimIsEmpty(l)).map(dimLineKey));

// One panel per saved container; the shipment-level panel shows when there are no
// containers, or when containerless lines exist (e.g. LCL cargo).
function panelKeysFor(containerIds: string[], items: CargoItemLine[], dims: CargoDimensionLine[]): string[] {
  const keys = [...containerIds];
  const hasLoose = items.some((l) => !l.containerId) || dims.some((l) => !l.containerId);
  if (keys.length === 0 || hasLoose) keys.push(NONE);
  return keys;
}

// Ensure every panel has at least one (local-only) row ready to type into.
function withPanelRows<T>(rows: T[], panelKeys: string[], keyFn: (r: T) => string, mk: (containerId: string | null) => T): T[] {
  const present = new Set(rows.map(keyFn));
  const missing = panelKeys.filter((k) => !present.has(k));
  return missing.length === 0 ? rows : [...rows, ...missing.map((k) => mk(k === NONE ? null : k))];
}

const currencyOptions = (query: string) => {
  const q = (query ?? "").toLowerCase().trim();
  return CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).map((c) => ({
    value: c.code,
    label: (
      <span>
        {c.code} <span className="text-slate-400 text-xs">{c.name}</span>
      </span>
    ),
  }));
};

// Centred columns with room between them, like the cargo description table.
// Words read better than codes in the summary line.
const UNIT_LABEL: Record<string, string> = { PCS: "pieces", KG: "kg", "M³": "m³" };

// minmax(0, …): every row keeps the same column widths, whatever a cell holds.
const DIM_COLS =
  "grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.9fr)_32px] gap-3 items-center";
const CENTERED_SELECT = "w-full [&_.ant-select-selection-item]:!text-center [&_.ant-select-selection-placeholder]:!text-center";
// Wider gaps and roomier number columns so the header labels no longer collide.
const DESC_COLS = "grid grid-cols-[2fr_1fr_0.7fr_1.1fr_1.1fr_1.2fr_0.8fr_32px] gap-3 items-center";

/**
 * Which rows of a table are open for editing. A row closes when focus leaves it or on
 * Enter; saving is left to each field's own onBlur, so leaving a row saves exactly once.
 */
function useOpenRows() {
  const [rows, setRows] = useState<Set<number>>(() => new Set());
  const open = (idx: number) => setRows((o) => (o.has(idx) ? o : new Set(o).add(idx)));
  const close = (idx: number) =>
    setRows((o) => {
      if (!o.has(idx)) return o;
      const next = new Set(o);
      next.delete(idx);
      return next;
    });
  return {
    isOpen: (idx: number) => rows.has(idx),
    count: rows.size,
    indexes: rows,
    open,
    reset: () => setRows(new Set()),
    set: (idxs: number[]) => setRows(new Set(idxs)),
    // Clicking plain background gives no relatedTarget, so check where focus really went.
    onRowBlur: (idx: number) => (e: React.FocusEvent<HTMLDivElement>) => {
      if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
      const row = e.currentTarget;
      setTimeout(() => {
        if (!row.contains(document.activeElement)) close(idx);
      }, 0);
    },
    onRowKeyDown: (idx: number) => (e: React.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Blurring the field fires its own onBlur, which saves it.
      (e.target as HTMLElement).blur?.();
      close(idx);
    },
  };
}

export function CargoDetailsTab({
  shipment,
  onChange,
  focusContainerId,
}: {
  shipment: ShipmentItem;
  /** Saves a table; rejects when the server refuses it (the caller says why). */
  onChange: (data: { cargoItems?: CargoItemLine[]; cargoDimensions?: CargoDimensionLine[] }) => Promise<unknown>;
  focusContainerId?: string | null;
}) {
  // Containers that made it to the server (they have ids cargo lines can point
  // at). A row still being typed in the Container tab gets its panel after its
  // first save round-trips.
  const containers = useMemo(
    () => (shipment.containers ?? []).filter((c): c is ContainerLine & { id: string } => !!c.id),
    [shipment.containers],
  );

  const [items, setItems] = useState<CargoItemLine[]>(() => shipment.cargoItems ?? []);
  const [dims, setDims] = useState<CargoDimensionLine[]>(() => shipment.cargoDimensions ?? []);
  // The container shown (its tab) and which of its tables: one at a time keeps the page short.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [view, setView] = useState<"dims" | "desc">("dims");
  // Dimension lines (by row key) whose ADR box was ticked before any ADR detail was typed.
  const [adrOn, setAdrOn] = useState<Set<string>>(() => new Set());
  const itemsRef = useRef(items);
  const dimsRef = useRef(dims);
  itemsRef.current = items;
  dimsRef.current = dims;
  const openItems = useOpenRows();
  const openDims = useOpenRows();


  // Reset local edit state when navigating to a different shipment.
  useEffect(() => {
    setItems(shipment.cargoItems ?? []);
    setDims(shipment.cargoDimensions ?? []);
    setActiveKey(null);
    openItems.reset();
    openDims.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id]);

  const panelKeys = useMemo(() => panelKeysFor(containers.map((c) => c.id), items, dims), [containers, items, dims]);

  // What each table last saved (or loaded). The saved data coming back equal to it is
  // the save's own echo; anything else (another screen changed it, a refused save was
  // rolled back) is shown here — at once when no row is being edited, and always after
  // a refused save, so a refused line never stays on screen or in later saves.
  const shipmentRef = useRef(shipment);
  shipmentRef.current = shipment;
  const sentItems = useRef(itemsKey(shipment.cargoItems ?? []));
  const sentDims = useRef(dimsKey(shipment.cargoDimensions ?? []));
  // Kept in refs so resync, called from effects and timers, sees the current values.
  const openRef = useRef({ items: openItems.indexes, dims: openDims.indexes });
  openRef.current = { items: openItems.indexes, dims: openDims.indexes };
  const pendingWrites = useIsMutating({ mutationKey: SHIPMENT_WRITE_KEY });
  // refused: after a refused save of one table (the row keys it carried). That table goes
  // back to what is saved even while a row is open, except a row being typed that was not
  // part of the refused save: it keeps its text and stays open. The other table follows
  // the normal rule.
  const resync = (refused?: { table: "items" | "dims"; rows: Set<string> }) => {
    const s = shipmentRef.current;
    const serverItems = s.cargoItems ?? [];
    const serverDims = s.cargoDimensions ?? [];
    const keys = panelKeysFor((s.containers ?? []).flatMap((c) => (c.id ? [c.id] : [])), serverItems, serverDims);
    const keepOpen = <T extends object>(local: T[], open: Set<number>, isEmpty: (l: T) => boolean, force: boolean) =>
      force ? local.filter((l, i) => open.has(i) && !isEmpty(l) && !refused!.rows.has(rowKey(l))) : [];
    const forceItems = refused?.table === "items";
    const iKey = itemsKey(serverItems);
    if (iKey !== sentItems.current && (forceItems || openRef.current.items.size === 0)) {
      sentItems.current = iKey;
      const kept = keepOpen(itemsRef.current, openRef.current.items, itemIsEmpty, forceItems);
      setItems(withPanelRows([...serverItems, ...kept], keys, (l) => keyOf(l.containerId), emptyItem));
      openItems.set(kept.map((_, j) => serverItems.length + j));
    }
    const forceDims = refused?.table === "dims";
    const dKey = dimsKey(serverDims);
    if (dKey !== sentDims.current && (forceDims || openRef.current.dims.size === 0)) {
      sentDims.current = dKey;
      const kept = keepOpen(dimsRef.current, openRef.current.dims, dimIsEmpty, forceDims);
      setDims(withPanelRows([...serverDims, ...kept], keys, (l) => keyOf(l.containerId), emptyDim));
      openDims.set(kept.map((_, j) => serverDims.length + j));
    }
  };
  // Not while a save is pending: a refetch between two queued saves would show the first
  // one's data over the second's edit.
  useEffect(() => {
    if (pendingWrites === 0) resync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.cargoItems, shipment.cargoDimensions, shipment.containers, pendingWrites]);

  // Seed each panel with an empty line to type into (kept local until edited —
  // empty lines are filtered out of every save).
  useEffect(() => {
    setItems((prev) => withPanelRows(prev, panelKeys, (l) => keyOf(l.containerId), emptyItem));
    setDims((prev) => withPanelRows(prev, panelKeys, (l) => keyOf(l.containerId), emptyDim));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKeys.join("|")]);

  // Jumping in from the Container tab (a container number was clicked): open its tab.
  useEffect(() => {
    if (focusContainerId) setActiveKey(focusContainerId);
  }, [focusContainerId]);

  // Saves a table unless it holds what was last saved. A refused save shows the saved
  // lines again once the cache is rolled back.
  const sendItems = (list: CargoItemLine[]) => {
    const payload = list.filter((l) => !itemIsEmpty(l));
    const key = itemsKey(payload);
    if (key === sentItems.current) return;
    sentItems.current = key;
    const refused = { table: "items" as const, rows: new Set(payload.map(rowKey)) };
    onChange({ cargoItems: payload }).catch(() => setTimeout(() => resync(refused), 50));
  };
  const sendDims = (list: CargoDimensionLine[]) => {
    const payload = list.filter((l) => !dimIsEmpty(l));
    const key = dimsKey(payload);
    if (key === sentDims.current) return;
    sentDims.current = key;
    const refused = { table: "dims" as const, rows: new Set(payload.map(rowKey)) };
    onChange({ cargoDimensions: payload }).catch(() => setTimeout(() => resync(refused), 50));
  };
  const persistItems = () => sendItems(itemsRef.current);
  const persistDims = () => sendDims(dimsRef.current);

  // Both tables behave like the container rows: a filled row collapses to a read-only
  // line when focus leaves it, and a double-click opens it again. An empty row stays open.
  const itemIsOpen = (idx: number) => openItems.isOpen(idx) || itemIsEmpty(items[idx] ?? ({} as CargoItemLine));
  const dimIsOpen = (idx: number) => openDims.isOpen(idx) || dimIsEmpty(dims[idx] ?? ({} as CargoDimensionLine));

  const patchItem = (idx: number, p: Partial<CargoItemLine>) => {
    // Typing keeps the row open, so it cannot collapse mid-word.
    openItems.open(idx);
    setItems((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  };
  const patchDim = (idx: number, p: Partial<CargoDimensionLine>) => {
    openDims.open(idx);
    setDims((r) => r.map((l, j) => (j === idx ? { ...l, ...p } : l)));
  };

  // A line's ADR details show while its ADR box is ticked. Ticking only opens the fields (the
  // line has no ADR data until one is typed); unticking clears them and saves.
  const handleAdrToggle = (idx: number, line: CargoDimensionLine, on: boolean) => {
    const key = rowKey(line);
    setAdrOn((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
    if (on) return;
    patchDim(idx, { adrUn: null, adrClass: null, adrPackingGroup: null, adrLimitedQuantity: false });
    setTimeout(persistDims, 0);
  };

  const addItem = (panelKey: string) =>
    setItems((r) => [...r, emptyItem(panelKey === NONE ? null : panelKey)]);
  const addDim = (panelKey: string) =>
    setDims((r) => [...r, emptyDim(panelKey === NONE ? null : panelKey)]);

  // Removing a panel's last line just clears it (reference-UI behavior). Open rows are
  // tracked by index, which shifts on removal, so every row goes back to read mode.
  const removeItem = (idx: number, panelSize: number) => {
    const next =
      panelSize > 1
        ? itemsRef.current.filter((_, j) => j !== idx)
        : itemsRef.current.map((l, j) => (j === idx ? emptyItem(l.containerId ?? null) : l));
    setItems(next);
    openItems.reset();
    sendItems(next);
  };
  const removeDim = (idx: number, panelSize: number) => {
    const next =
      panelSize > 1
        ? dimsRef.current.filter((_, j) => j !== idx)
        : dimsRef.current.map((l, j) => (j === idx ? emptyDim(l.containerId ?? null) : l));
    setDims(next);
    openDims.reset();
    sendDims(next);
  };


  // Everything one tab shows: its lines, their totals and how they compare with what the
  // container declares (dimensions always; descriptions once there are any).
  const panelOf = (key: string) => {
    const container = containers.find((c) => c.id === key) ?? null;
    const panelItems = items.map((l, idx) => ({ l, idx })).filter(({ l }) => keyOf(l.containerId) === key);
    const panelDims = dims.map((l, idx) => ({ l, idx })).filter(({ l }) => keyOf(l.containerId) === key);
    const filledDims = panelDims.filter(({ l }) => !dimIsEmpty(l)).length;
    const filledItems = panelItems.filter(({ l }) => !itemIsEmpty(l)).length;
    const check = container ? checkConsistency(container, panelDims.map(({ l }) => l)) : null;
    const descPcs = panelItems.reduce((s, { l }) => s + num(l.pieces), 0);
    const descKg = panelItems.reduce((s, { l }) => s + num(l.grossWeight), 0);
    const descCheck = container
      ? { pcs: compareFigure(descPcs, num(container.packages), 0), kg: compareFigure(descKg, num(container.grossWeight), 2) }
      : null;
    const hasDesc = filledItems > 0;
    const hasLines = filledDims > 0 || hasDesc;
    const matched = !!check && check.matched && (!hasDesc || (!!descCheck && descCheck.pcs.ok && descCheck.kg.ok));
    const index = container ? containers.indexOf(container) : -1;
    const label = container ? container.containerNumber || `Container #${index + 1}` : "No container";
    return { key, container, label, panelItems, panelDims, filledDims, filledItems, check, descPcs, descKg, descCheck, hasDesc, hasLines, matched };
  };

  const panels = panelKeys.map(panelOf);
  const active = panels.find((p) => p.key === activeKey) ?? panels[0]!;
  const { container, panelItems, panelDims, check, descCheck, hasDesc } = active;

  // A total under the column it sums, its unit beneath.
  const totalCell = (sum: number, unit: string, decimals: number) => (
    <span key={unit} className="flex flex-col items-center tabular-nums whitespace-nowrap" title={`${fmtFixed(sum, decimals)} ${UNIT_LABEL[unit] ?? unit}`}>
      <span className="text-[13px] font-bold text-slate-900">{decimals === 0 ? fmtNum(sum) : fmtFixed(sum, decimals)}</span>
      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{unit}</span>
    </span>
  );
  const dimTotals = {
    pcs: panelDims.reduce((s, { l }) => s + num(l.pieces), 0),
    kg: panelDims.reduce((s, { l }) => s + num(l.pieces) * num(l.weightPerPcKg), 0),
    m3: panelDims.reduce((s, { l }) => s + num(l.pieces) * dimensionVolumePerPiece(l), 0),
  };
  const descCiv = civByCurrency(panelItems.map(({ l }) => l));

  // Under the table of a container: its lines against what the container declares.
  const checkStrip = (pills: React.ReactNode) =>
    container ? (
      <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 px-1 border-t border-slate-100">
        <span className="text-xs text-slate-500 mr-1">Declared for {active.label}</span>
        {pills}
      </div>
    ) : null;

  const addLine = () => (view === "dims" ? addDim(active.key) : addItem(active.key));

  return (
    // One card: the containers as tabs, then which table (pill tabs, as on the list pages)
    // with Add, and the table straight in the card. The page's own tab already says
    // "Cargo Details", so the card has no title bar.
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {containers.length > 0 && (
        // The containers as tabs (as in the grid's Dimensions dialog); the dot says whether
        // a container's lines add up to what it declares.
        <div role="tablist" aria-label="Containers" className="flex items-end gap-1 px-3 pt-2 bg-white border-b border-slate-200 overflow-x-auto">
          {panels.map((p) => {
            const on = p.key === active.key;
            return (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActiveKey(p.key)}
                className={[
                  "relative flex items-center gap-2 px-4 py-2.5 rounded-t-lg border-0 text-[13px] whitespace-nowrap cursor-pointer transition-colors",
                  "outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-inset",
                  on ? "bg-indigo-50 text-indigo-700" : "bg-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800",
                ].join(" ")}
              >
                {on && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-indigo-500" />}
                {p.container && p.hasLines && (
                  <span
                    className={`w-2 h-2 rounded-full ${p.matched ? "bg-emerald-500" : "bg-red-500"}`}
                    title={p.matched ? "Matched" : "Mismatch"}
                    aria-label={p.matched ? "Matched" : "Mismatch"}
                  />
                )}
                <span className={`${p.container ? "font-mono tracking-wide" : ""} ${on ? "font-bold" : "font-semibold"}`}>{p.label}</span>
                {p.container?.type && <span className={`text-xs ${on ? "text-indigo-500" : "text-slate-400"}`}>{p.container.type}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-4">
        {/* Which table of this container: dimensions or descriptions, then Add for it. */}
        <div className="flex items-center gap-2 mb-3">
          <div role="tablist" aria-label="Cargo tables" className="flex items-center gap-2">
            {(
              [
                ["dims", "Dimensions"],
                ["desc", "Description"],
              ] as const
            ).map(([k, text]) => {
              const on = view === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setView(k)}
                  className={[
                    "flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer",
                    "outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1",
                    // The open table is filled indigo, so it is clear at a glance which one is shown.
                    on ? "border-indigo-600 bg-indigo-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  ].join(" ")}
                >
                  {text}
                </button>
              );
            })}
          </div>
          <Button size="small" type="primary" ghost icon={<PlusOutlined />} className="ml-auto" onClick={addLine}>
            {view === "dims" ? "Add dimension" : "Add description"}
          </Button>
        </div>
        {view === "dims" ? (
          <div>
            <div className="overflow-x-auto">
              <div className="min-w-[1000px]">
                <div className={`${DIM_COLS} px-1 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
                  <span className="text-center truncate">Pcs</span>
                  <span className="text-center truncate">Packages</span>
                  <span className="text-center truncate">Length (cm)</span>
                  <span className="text-center truncate">Width (cm)</span>
                  <span className="text-center truncate">Height (cm)</span>
                  <span className="text-center truncate">Weight / pc (kg)</span>
                  <span className="text-center truncate">Volume / pc (m³)</span>
                  <span className="text-center truncate">Stackability</span>
                  <span className="text-center truncate">ADR</span>
                  <span />
                </div>

                {panelDims.map(({ l, idx }) => {
                  const vpc = dimensionVolumePerPiece(l);
                  if (!dimIsOpen(idx)) {
                    return (
                      <div
                        key={rowKey(l)}
                        className={`${DIM_COLS} px-1 py-1.5 border-b border-slate-100 text-[13px] text-slate-700 cursor-pointer hover:bg-slate-50/60`}
                        onDoubleClick={() => openDims.open(idx)}
                        title="Double-click to edit"
                      >
                        <span className="text-center tabular-nums font-medium text-slate-900">{l.pieces || "—"}</span>
                        <span className="text-center truncate">{l.packageType || "—"}</span>
                        <span className="text-center tabular-nums">{l.lengthCm || "—"}</span>
                        <span className="text-center tabular-nums">{l.widthCm || "—"}</span>
                        <span className="text-center tabular-nums">{l.heightCm || "—"}</span>
                        <span className="text-center tabular-nums">{l.weightPerPcKg || "—"}</span>
                        <span className="text-center tabular-nums text-slate-500">{vpc ? vpc.toFixed(3) : "—"}</span>
                        <span className="text-center truncate" title={l.stackable || undefined}>{l.stackable || "—"}</span>
                        <span className="text-center truncate text-orange-600 font-medium" title={adrSummary(l)}>
                          {hasAdr(l) ? adrSummary(l) : <span className="text-slate-700 font-normal">—</span>}
                        </span>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeDim(idx, panelDims.length)} />
                      </div>
                    );
                  }
                  const adrShown = hasAdr(l) || adrOn.has(rowKey(l));
                  return (
                    <div
                      key={rowKey(l)}
                      className="border-b border-slate-100"
                      onBlur={openDims.onRowBlur(idx)}
                      onKeyDown={openDims.onRowKeyDown(idx)}
                    >
                      <div className={`${DIM_COLS} px-1 py-1`}>
                        {/* Numbers only, like the Dimensions modal: Pcs whole, the rest may take a decimal point; at most 4 digits (weight 5). */}
                        <Input size="small" className="text-center" inputMode="numeric" value={l.pieces} onChange={(e) => patchDim(idx, { pieces: numberInput(e.target.value, false, 4) })} onBlur={persistDims} />
                        <Select
                          size="small"
                          className={CENTERED_SELECT}
                          value={l.packageType || undefined}
                          allowClear
                          placeholder="—"
                          options={PACK_TYPES.map((p) => ({ value: p }))}
                          onChange={(v) => {
                            patchDim(idx, { packageType: v ?? "" });
                            setTimeout(persistDims, 0);
                          }}
                        />
                        <Input size="small" className="text-center" inputMode="decimal" value={l.lengthCm} onChange={(e) => patchDim(idx, { lengthCm: numberInput(e.target.value, true, 4) })} onBlur={persistDims} />
                        <Input size="small" className="text-center" inputMode="decimal" value={l.widthCm} onChange={(e) => patchDim(idx, { widthCm: numberInput(e.target.value, true, 4) })} onBlur={persistDims} />
                        <Input size="small" className="text-center" inputMode="decimal" value={l.heightCm} onChange={(e) => patchDim(idx, { heightCm: numberInput(e.target.value, true, 4) })} onBlur={persistDims} />
                        <Input size="small" className="text-center" inputMode="decimal" value={l.weightPerPcKg} onChange={(e) => patchDim(idx, { weightPerPcKg: numberInput(e.target.value, true, 5) })} onBlur={persistDims} />
                        <Input size="small" className="text-center !bg-slate-50 !text-slate-500" readOnly tabIndex={-1} value={vpc ? vpc.toFixed(3) : ""} />
                        <Select
                          size="small"
                          className={CENTERED_SELECT}
                          value={l.stackable || undefined}
                          allowClear
                          placeholder="—"
                          popupMatchSelectWidth={false}
                          options={STACKABLE_OPTIONS.map((s) => ({ value: s }))}
                          onChange={(v) => {
                            patchDim(idx, { stackable: v ?? "" });
                            setTimeout(persistDims, 0);
                          }}
                        />
                        <Checkbox
                          className="justify-self-center"
                          aria-label="Dangerous goods (ADR)"
                          checked={adrShown}
                          onChange={(e) => handleAdrToggle(idx, l, e.target.checked)}
                        />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeDim(idx, panelDims.length)} />
                      </div>
                      {adrShown && <CargoDimensionAdrFields line={l} onPatch={(p) => patchDim(idx, p)} onCommit={persistDims} />}
                    </div>
                  );
                })}

                {/* Each figure sits under the column it sums. */}
                <div className={`${DIM_COLS} px-1 pt-2.5 pb-1 mt-1 border-t border-slate-200`}>
                  {totalCell(dimTotals.pcs, "PCS", 0)}
                  <span />
                  <span />
                  <span />
                  <span />
                  {totalCell(dimTotals.kg, "KG", 2)}
                  {totalCell(dimTotals.m3, "M³", 3)}
                  <span className="col-span-3" />
                </div>
              </div>
              {check &&
                checkStrip(
                  <>
                    <CheckPill label="Pcs" m={check.pcs} decimals={0} />
                    <CheckPill label="Weight" m={check.kg} decimals={2} unit="kg" />
                    <CheckPill label="Volume" m={check.m3} decimals={3} unit="m³" />
                  </>,
                )}
            </div>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className={`${DESC_COLS} px-1 pb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
                  <span className="truncate">Cargo Description</span>
                  <span className="text-center truncate">HS Code</span>
                  <span className="text-center truncate">Pcs</span>
                  <span className="text-center truncate">Packages</span>
                  <span className="text-center truncate">Gross Weight (kg)</span>
                  <span className="text-center truncate">Invoice Value</span>
                  <span className="text-center truncate">Currency</span>
                  <span />
                </div>

                {panelItems.map(({ l, idx }) =>
                  !itemIsOpen(idx) ? (
                    <div
                      key={rowKey(l)}
                      className={`${DESC_COLS} px-1 py-1.5 border-b border-slate-100 text-[13px] text-slate-700 cursor-pointer hover:bg-slate-50/60`}
                      onDoubleClick={() => openItems.open(idx)}
                      title="Double-click to edit"
                    >
                      <span className="font-medium text-slate-900 truncate">{l.cargoDescription || "—"}</span>
                      <span className="font-mono text-center truncate">{l.hsCode || "—"}</span>
                      <span className="text-center tabular-nums">{l.pieces || "—"}</span>
                      <span className="text-center truncate">{l.packageType || "—"}</span>
                      <span className="text-center tabular-nums">{l.grossWeight || "—"}</span>
                      <span className="text-center tabular-nums">{l.commercialInvoiceValue || "—"}</span>
                      <span className="text-center truncate">{l.currency || "—"}</span>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(idx, panelItems.length)} />
                    </div>
                  ) : (
                    <div
                      key={rowKey(l)}
                      className={`${DESC_COLS} px-1 py-1 border-b border-slate-100`}
                      onBlur={openItems.onRowBlur(idx)}
                      onKeyDown={openItems.onRowKeyDown(idx)}
                    >
                      <Input size="small" value={l.cargoDescription} placeholder="PLASTIC PARTS OF SPEAKER" onChange={(e) => patchItem(idx, { cargoDescription: e.target.value })} onBlur={persistItems} />
                      {/* HS code is a tariff number — digits only (separators are dropped). */}
                      <Input
                        size="small"
                        className="text-center"
                        inputMode="numeric"
                        value={l.hsCode}
                        placeholder="85319000"
                        onChange={(e) => patchItem(idx, { hsCode: e.target.value.replace(/\D/g, "") })}
                        onBlur={persistItems}
                      />
                      <Input size="small" className="text-center" value={l.pieces} inputMode="numeric" onChange={(e) => patchItem(idx, { pieces: numberInput(e.target.value, false) })} onBlur={persistItems} />
                      {/* Picked from the list only (typing filters it); free text is not taken. */}
                      <Select
                        size="small"
                        className={CENTERED_SELECT}
                        value={l.packageType || undefined}
                        placeholder="Pallet(s)"
                        showSearch
                        allowClear
                        options={PACK_TYPES.map((p) => ({ value: p }))}
                        onChange={(v?: string) => {
                          patchItem(idx, { packageType: v ?? "" });
                          setTimeout(persistItems, 0);
                        }}
                        onBlur={persistItems}
                      />
                      {/* Numbers only: digits and one decimal point. */}
                      <Input size="small" className="text-center" value={l.grossWeight} inputMode="decimal" onChange={(e) => patchItem(idx, { grossWeight: numberInput(e.target.value) })} onBlur={persistItems} />
                      <Input size="small" className="text-center" value={l.commercialInvoiceValue} placeholder="12 500" inputMode="decimal" onChange={(e) => patchItem(idx, { commercialInvoiceValue: numberInput(e.target.value) })} onBlur={persistItems} />
                      <AutoComplete
                        size="small"
                        className="w-full [&_input]:!text-center"
                        value={l.currency}
                        placeholder="USD"
                        options={currencyOptions(l.currency)}
                        onChange={(v) => patchItem(idx, { currency: (v ?? "").toUpperCase() })}
                        onBlur={persistItems}
                      />
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeItem(idx, panelItems.length)} />
                    </div>
                  ),
                )}

                {/* Each figure sits under the column it sums. */}
                <div className={`${DESC_COLS} px-1 pt-2.5 pb-1 mt-1 border-t border-slate-200`}>
                  <span />
                  <span />
                  {totalCell(active.descPcs, "PCS", 0)}
                  <span />
                  {totalCell(active.descKg, "KG", 2)}
                  <span className={`text-center text-[13px] font-bold tabular-nums whitespace-nowrap ${descCiv ? "text-slate-900" : "text-slate-300"}`}>{descCiv || "—"}</span>
                  <span className="col-span-2" />
                </div>
              </div>
              {/* Compared once the container has description lines (the tab's dot counts them then too). */}
              {descCheck &&
                hasDesc &&
                checkStrip(
                  <>
                    <CheckPill label="Pcs" m={descCheck.pcs} decimals={0} />
                    <CheckPill label="Weight" m={descCheck.kg} decimals={2} unit="kg" />
                  </>,
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
