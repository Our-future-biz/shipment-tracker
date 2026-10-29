"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { Input, Button, AutoComplete, Select, Tooltip, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { SHIPMENT_WRITE_KEY, type ShipmentItem } from "@/hooks/useShipments";
import { useIsMutating } from "@tanstack/react-query";
import { ConfirmModal } from "@/components/ConfirmModal";
import { uuid } from "@/lib/uuid";
import { containerNumberInput, isValidContainerNumber, normalizeContainerNumber } from "@/lib/container";
import {
  CONTAINER_SIZES,
  CONTAINER_KINDS,
  CONTAINER_KINDS_BY_SIZE,
  teuForType,
  num,
  fmtNum,
  type ContainerLine,
  PACK_TYPE_OPTIONS,
  numberInput,
} from "@/lib/cargo";

// A new row gets its id here, so every save names it and the server keeps that id
// (cargo lines can point at it) — rows are never matched by position.
const emptyContainer = (): ContainerLine => ({
  id: uuid(),
  containerNumber: "",
  sealNumber: "",
  type: "",
  teu: "",
  packages: "",
  packageType: "",
  grossWeight: "",
  volume: "",
});

// A row nobody has typed into is never sent (it would become an empty container
// and an empty panel in Cargo Details).
const isBlankContainer = (c: ContainerLine) =>
  !c.containerNumber.trim() &&
  !c.sealNumber.trim() &&
  !c.type.trim() &&
  !c.packages.trim() &&
  !c.packageType.trim() &&
  !c.grossWeight.trim() &&
  !c.volume.trim();

// Show one empty row from the start so a new shipment has a ready-to-fill form
// (no "Add container" click needed for the first). It stays local until edited,
// so an untouched row is never persisted.
const withFirstRow = (list: ContainerLine[] | null | undefined): ContainerLine[] =>
  list && list.length > 0 ? list : [emptyContainer()];

// Grouped "20' DC … 40' FR" options, filtered the way the reference UI does:
// compare with apostrophes/spaces stripped, and "2"/"20"/"4"/"40" narrows to
// that size group.
function containerTypeOptions(query: string) {
  const q = query.toLowerCase().replace(/['’\s]/g, "");
  return CONTAINER_SIZES.map((size) => {
    const sizeKey = size.replace("'", "");
    const options = (CONTAINER_KINDS_BY_SIZE[size] ?? CONTAINER_KINDS).map((k) => `${size} ${k}`).filter((o) =>
      o.toLowerCase().replace(/['’\s]/g, "").includes(q),
    );
    if (q && ["2", "20", "4", "40", "45"].includes(q) && !sizeKey.startsWith(q)) return null;
    if (options.length === 0) return null;
    return {
      label: `${size} containers · ${teuForType(size)} TEU`,
      options: options.map((o) => ({ value: o, label: o })),
    };
  }).filter((g): g is NonNullable<typeof g> => g !== null);
}

type Field = "containerNumber" | "sealNumber" | "type" | "packages" | "packageType" | "grossWeight" | "volume";

// Centred columns with room between them, like the cargo tables.
const COLS = "grid grid-cols-[1.1fr_1.1fr_1fr_0.7fr_1.1fr_1.1fr_1fr_36px] gap-3 items-center";

export function ContainerDetailsTab({
  shipment,
  onChange,
  onOpenCargo,
}: {
  shipment: ShipmentItem;
  /** Saves the list; rejects when the server refuses it (the caller says why). */
  onChange: (containers: ContainerLine[]) => Promise<unknown>;
  onOpenCargo?: (containerId: string) => void;
}) {
  const [rows, setRows] = useState<ContainerLine[]>(() => withFirstRow(shipment.containers));
  // Rows being edited. Rows without a container number are always editable; a row
  // with one collapses to read mode on Enter / focus leaving the row, and
  // double-click re-opens it (reference-UI behavior).
  const [editing, setEditing] = useState<Set<number>>(() => new Set());
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  // The list last sent, so the same list is not sent twice (a blur right after the
  // number was completed, Enter then blur).
  const lastSent = useRef<string | null>(null);
  // antd Input and AutoComplete expose different ref classes; all we need from
  // either is focus().
  const inputRefs = useRef(new Map<string, { focus: () => void }>());
  const focusAfterRender = useRef<string | null>(null);

  // Reset local edit state when navigating to a different shipment.
  useEffect(() => {
    setRows(withFirstRow(shipment.containers));
    setEditing(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment.id]);

  // When the saved list changes (a save came back, a refused save was rolled back, another
  // screen changed it), show what is saved - once no save is pending and nothing is being
  // typed here (always after a refused save). A row unchanged keeps its object, so its
  // fields are not rebuilt; rows added here and not typed into yet stay.
  const shipmentRef = useRef(shipment);
  shipmentRef.current = shipment;
  const pendingWrites = useIsMutating({ mutationKey: SHIPMENT_WRITE_KEY });
  // force: after a refused save - its rows go back to what is saved, but a row added
  // here that was not part of that save keeps what was typed into it and stays open.
  const resync = (force: boolean, refusedIds?: Set<string | undefined>) => {
    const local = rowsRef.current;
    const typing = editingRef.current.size > 0 || local.some((r) => !isValidContainerNumber(r.containerNumber));
    if (!force && typing) return;
    const saved = shipmentRef.current.containers ?? [];
    const savedById = new Map(saved.map((c) => [c.id, c]));
    const same = (a: ContainerLine, b: ContainerLine) =>
      (["containerNumber", "sealNumber", "type", "packages", "packageType", "grossWeight", "volume"] as const).every((k) => a[k] === b[k]);
    // In the order shown here: a saved row takes its saved values (keeping its object when
    // unchanged), a row deleted elsewhere goes, an unsaved row stays where it is; rows
    // added elsewhere come last.
    const next: ContainerLine[] = [];
    for (const r of local) {
      const s = savedById.get(r.id);
      if (s) next.push(same(r, s) ? r : s);
      else if (!(force && refusedIds?.has(r.id) && !isBlankContainer(r)) && (isBlankContainer(r) || force)) next.push(r);
    }
    const shown = new Set(local.map((r) => r.id));
    next.push(...saved.filter((c) => !shown.has(c.id)));
    lastSent.current = JSON.stringify(saved);
    setRows(next.length > 0 ? next : [emptyContainer()]);
    // A blank row needs no opening (a row without a number is always open), and kept in the
    // set it would hold off every later resync.
    if (force) setEditing(new Set(next.flatMap((r, i) => (savedById.has(r.id) || isBlankContainer(r) ? [] : [i]))));
  };
  useEffect(() => {
    if (pendingWrites === 0) resync(false);
  }, [shipment.containers, pendingWrites]);

  useEffect(() => {
    if (focusAfterRender.current) {
      const el = inputRefs.current.get(focusAfterRender.current);
      focusAfterRender.current = null;
      el?.focus();
    }
  });

  // Nothing is saved while any row holds a container number of the wrong shape.
  // Sends the non-blank rows unless that exact list was just sent. A refused save is
  // reported by the caller; the saved list then shows again (effect above).
  const save = (list: ContainerLine[]) => {
    if (!list.every((r) => isValidContainerNumber(r.containerNumber))) return;
    // A saved row stays in the list even when emptied, so clearing a number never deletes
    // the container (and its cargo); only a row never saved and never typed into is left out.
    const savedNow = new Set((shipmentRef.current.containers ?? []).map((c) => c.id));
    const payload = list.filter((r) => !isBlankContainer(r) || savedNow.has(r.id));
    const key = JSON.stringify(payload);
    if (key === lastSent.current) return;
    lastSent.current = key;
    const refusedIds = new Set(payload.map((r) => r.id));
    onChange(payload).catch(() => {
      // The cache is rolled back by then; show the saved list again, also in an open row.
      setTimeout(() => resync(true, refusedIds), 50);
    });
  };
  const persist = () => save(rowsRef.current);
  const patch = (i: number, p: Partial<ContainerLine>) => {
    // Typing keeps the row open: without this the row with a freshly typed container
    // number would no longer count as "being edited" and would collapse mid-word.
    setEditing((e) => (e.has(i) ? e : new Set(e).add(i)));
    setRows((r) => r.map((c, j) => (j === i ? { ...c, ...p } : c)));
  };
  // On blur, collapse the container number to its canonical form (no spaces/hyphens, uppercase).
  // A number that is not 4 letters + 7 digits is kept in the row but never saved.
  const normalizeContainerAt = (i: number) => {
    const next = rowsRef.current.map((r, j) =>
      j === i ? { ...r, containerNumber: normalizeContainerNumber(r.containerNumber) } : r,
    );
    setRows(next);
    const typed = next[i]?.containerNumber ?? "";
    if (!isValidContainerNumber(typed)) {
      messageApi.error(`Container number "${typed}" is not valid — it must be 4 letters and 7 digits, e.g. MSKU1234567`);
      return;
    }
    save(next);
  };
  // A complete number (4 letters + 7 digits) is saved straight away, so leaving the tab
  // is not needed for it to stick.
  // Typing keeps only 4 letters then 7 digits (containerNumberInput).
  const setContainerNumber = (i: number, raw: string) => {
    const value = containerNumberInput(raw);
    const complete = value !== "" && isValidContainerNumber(value);
    patch(i, { containerNumber: value });
    if (!complete) return;
    const next = rowsRef.current.map((r, j) => (j === i ? { ...r, containerNumber: value } : r));
    rowsRef.current = next;
    save(next);
  };

  const add = () => {
    const next = [...rowsRef.current, emptyContainer()];
    setRows(next);
    setEditing((e) => new Set(e).add(next.length - 1));
    focusAfterRender.current = `${next.length - 1}:containerNumber`;
    // The new row is blank, so nothing is sent until something is typed into it.
  };
  // Deleting the last remaining row just clears it (reference-UI behavior); the
  // backend cascades the removed container's cargo lines.
  // While another row holds an unfinished number nothing can be saved, so the delete
  // waits too rather than vanishing here but staying on the server.
  const remove = (i: number) => {
    const filtered = rowsRef.current.filter((_, j) => j !== i);
    const bad = filtered.find((r) => !isValidContainerNumber(r.containerNumber));
    if (bad) {
      messageApi.error(`Finish or clear container number "${bad.containerNumber}" first — it must be 4 letters and 7 digits`);
      return;
    }
    const next = filtered.length > 0 ? filtered : [emptyContainer()];
    setRows(next);
    setEditing(new Set());
    save(filtered);
  };

  const isEditing = (i: number) =>
    editing.has(i) || !(rows[i]?.containerNumber ?? "").trim() || !isValidContainerNumber(rows[i]?.containerNumber);
  const closeRow = (i: number) =>
    setEditing((e) => {
      if (!e.has(i)) return e;
      const next = new Set(e);
      next.delete(i);
      return next;
    });
  const openRow = (i: number, field: Field) => {
    setEditing((e) => new Set(e).add(i));
    focusAfterRender.current = `${i}:${field}`;
  };

  // Focus leaving the row switches it to read mode (like clicking outside in the
  // reference UI). Clicking plain background gives no relatedTarget, so check where the
  // focus actually ended up once the browser has moved it. Saving is left to each
  // field's own onBlur, so leaving a row saves once.
  const onRowBlur = (i: number) => (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
    const row = e.currentTarget;
    setTimeout(() => {
      if (!row.contains(document.activeElement)) closeRow(i);
    }, 0);
  };
  const onRowKeyDown = (i: number) => (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    // Blurring the field fires its own onBlur, which saves it.
    (e.target as HTMLElement).blur?.();
    closeRow(i);
  };

  const setInputRef = (key: string) => (el: { focus: () => void } | null) => {
    if (el) inputRefs.current.set(key, el);
    else inputRefs.current.delete(key);
  };

  const totalPackages = rows.reduce((s, c) => s + num(c.packages), 0);
  const totalWeight = rows.reduce((s, c) => s + num(c.grossWeight), 0);
  const totalVolume = rows.reduce((s, c) => s + num(c.volume), 0);

  const [messageApi, contextHolder] = message.useMessage();
  // Only a saved container has a panel in Cargo Details to jump to.
  const savedIds = new Set((shipment.containers ?? []).map((c) => c.id ?? ""));
  const [typeQuery, setTypeQuery] = useState("");
  const typeOptions = useMemo(() => containerTypeOptions(typeQuery), [typeQuery]);

  // The row whose Delete waits for a yes - by id, as a refetch may re-order the rows while
  // the dialog is open - and what deleting it does to its cargo (server rule): with other
  // saved containers its cargo lines go with it; the cargo of the only saved container stays
  // on the shipment, on the one container left or else without a container.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const deleteIndex = rows.findIndex((r) => r.id === confirmDeleteId);
  const toDelete = deleteIndex >= 0 ? rows[deleteIndex] : undefined;
  const cargoLines = toDelete
    ? [...(shipment.cargoDimensions ?? []), ...(shipment.cargoItems ?? [])].filter((l) => l.containerId === toDelete.id).length
    : 0;
  const otherSaved = (shipment.containers ?? []).some((c) => c.id !== toDelete?.id);
  const left = rows.filter((r) => r.id !== toDelete?.id && !isBlankContainer(r)).length;
  const deleteDescription = [
    `Container ${toDelete?.containerNumber || `#${deleteIndex + 1}`} will be removed from this shipment.`,
    cargoLines > 0
      ? otherSaved
        ? `Its ${cargoLines} cargo line${cargoLines === 1 ? "" : "s"} in Cargo Details will be deleted too.`
        : `Its cargo lines stay on the shipment${left === 1 ? ", on the other container" : " as cargo without a container"}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  // A row's actions behind "⋯" (centred under the "+" in the header): Delete, one click
  // further away so a container (and its cargo) is not removed by a stray click.
  const rowMenu = (c: ContainerLine, i: number) => (
    <RowActionsMenu
      label="Container actions"
      // A row with anything in it asks first; an empty row just goes.
      onDelete={() => (isBlankContainer(c) || !c.id ? remove(i) : setConfirmDeleteId(c.id))}
    />
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {contextHolder}
      <ConfirmModal
        open={!!toDelete}
        danger
        title="Delete container?"
        description={deleteDescription}
        confirmLabel="Delete"
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (deleteIndex >= 0) remove(deleteIndex);
          setConfirmDeleteId(null);
        }}
      />
      {/* No title bar: the page's own tab already says "Container Details". */}
      <div className="p-4 relative">
        {/* Add container: a small "+" laid over the header row's right end, above the rows'
            "⋯" menus. Outside the scroll box so nothing clips it, and no taller than the column
            titles' line, so it neither grows the header nor touches its rule. */}
        <Tooltip title="Add container">
          <Button
            size="small"
            type="primary"
            icon={<PlusOutlined className="text-[11px]" />}
            aria-label="Add container"
            onClick={add}
            className="!absolute top-3 right-[31px] z-10 !w-[22px] !h-[22px] !min-w-0 !p-0"
          />
        </Tooltip>
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className={`${COLS} px-2 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200`}>
              <span className="truncate">Container Number</span>
              <span className="text-center truncate">Seal Number</span>
              <span className="text-center truncate">Container Type</span>
              <span className="text-center truncate">Pcs</span>
              <span className="text-center truncate">Packages</span>
              <span className="text-center truncate">Gross Weight (kg)</span>
              <span className="text-center truncate">Volume (m³)</span>
              {/* The actions column: the "+" above lies over it. */}
              <span />
            </div>

            {rows.map((c, i) =>
              isEditing(i) ? (
                <div
                  key={rowKey(c)}
                  className={`${COLS} px-2 py-1.5 border-b border-slate-100`}
                  onBlur={onRowBlur(i)}
                  onKeyDown={onRowKeyDown(i)}
                >
                  <Tooltip
                    title={isValidContainerNumber(c.containerNumber) ? "" : "4 letters + 7 digits, e.g. MSKU1234567"}
                    open={isValidContainerNumber(c.containerNumber) ? false : undefined}
                  >
                    <Input
                      ref={setInputRef(`${i}:containerNumber`)}
                      size="small"
                      status={isValidContainerNumber(c.containerNumber) ? undefined : "error"}
                      value={c.containerNumber}
                      placeholder="MSKU1234567"
                      onChange={(e) => setContainerNumber(i, e.target.value)}
                      onBlur={() => normalizeContainerAt(i)}
                    />
                  </Tooltip>
                  <Input
                    ref={setInputRef(`${i}:sealNumber`)}
                    size="small"
                    className="text-center"
                    value={c.sealNumber}
                    onChange={(e) => patch(i, { sealNumber: e.target.value })}
                    onBlur={persist}
                  />
                  <AutoComplete
                    ref={setInputRef(`${i}:type`)}
                    size="small"
                    value={c.type}
                    placeholder="Select..."
                    options={typeOptions}
                    onFocus={() => setTypeQuery(c.type)}
                    onSearch={setTypeQuery}
                    onChange={(v) => patch(i, { type: v })}
                    onBlur={persist}
                    className="w-full [&_input]:!text-center"
                  />
                  <Input
                    ref={setInputRef(`${i}:packages`)}
                    size="small"
                    className="text-center"
                    value={c.packages}
                    inputMode="numeric"
                    onChange={(e) => patch(i, { packages: numberInput(e.target.value, false) })}
                    onBlur={persist}
                  />
                  {/* Picked from the list only (typing filters it); free text is not taken. */}
                  <Select
                    ref={setInputRef(`${i}:packageType`)}
                    size="small"
                    value={c.packageType || undefined}
                    placeholder="Pallet(s)"
                    showSearch
                    allowClear
                    options={PACK_TYPE_OPTIONS}
                    onChange={(v?: string) => {
                      patch(i, { packageType: v ?? "" });
                      setTimeout(persist, 0);
                    }}
                    onBlur={persist}
                    className="w-full [&_.ant-select-selection-item]:!text-center [&_.ant-select-selection-placeholder]:!text-center"
                  />
                  <Input
                    ref={setInputRef(`${i}:grossWeight`)}
                    size="small"
                    className="text-center"
                    value={c.grossWeight}
                    inputMode="decimal"
                    onChange={(e) => patch(i, { grossWeight: numberInput(e.target.value) })}
                    onBlur={persist}
                  />
                  <Input
                    ref={setInputRef(`${i}:volume`)}
                    size="small"
                    className="text-center"
                    value={c.volume}
                    inputMode="decimal"
                    onChange={(e) => patch(i, { volume: numberInput(e.target.value) })}
                    onBlur={persist}
                  />
                  {rowMenu(c, i)}
                </div>
              ) : (
                // Read mode: double-click anywhere re-opens editing focused on the
                // clicked column; the container number is a link to its cargo panel.
                <div
                  key={rowKey(c)}
                  className={`${COLS} px-2 py-1.5 border-b border-slate-100 cursor-pointer hover:bg-slate-50 select-none`}
                  onDoubleClick={(e) => {
                    const field = (e.target as HTMLElement).closest<HTMLElement>("[data-field]")?.dataset.field as
                      | Field
                      | undefined;
                    openRow(i, field ?? "containerNumber");
                  }}
                >
                  <span data-field="containerNumber">
                    <button
                      type="button"
                      className={`font-mono font-bold text-[13px] tracking-wide px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 ${
                        savedIds.has(c.id ?? "") && onOpenCargo ? "hover:bg-indigo-100 hover:text-indigo-700 cursor-pointer" : "cursor-default"
                      }`}
                      title="Open Cargo Details"
                      onClick={() => c.id && savedIds.has(c.id) && onOpenCargo?.(c.id)}
                    >
                      {c.containerNumber}
                    </button>
                  </span>
                  <span data-field="sealNumber" className="text-sm text-slate-700 px-2 text-center truncate">{c.sealNumber}</span>
                  <span data-field="type" className="text-sm text-slate-700 px-2 text-center truncate">{c.type}</span>
                  <span data-field="packages" className="text-sm text-slate-700 px-2 text-center tabular-nums">{c.packages}</span>
                  <span data-field="packageType" className="text-sm text-slate-700 px-2 text-center truncate">{c.packageType}</span>
                  <span data-field="grossWeight" className="text-sm text-slate-700 px-2 text-center tabular-nums">{c.grossWeight}</span>
                  <span data-field="volume" className="text-sm text-slate-700 px-2 text-center tabular-nums">{c.volume}</span>
                  {rowMenu(c, i)}
                </div>
              ),
            )}

            <div className={`${COLS} px-2 pt-3 mt-1 text-xs font-bold text-slate-800 border-t-2 border-slate-200`}>
              <span className="uppercase tracking-wide text-[11px]">
                {rows.length} container{rows.length === 1 ? "" : "s"}
              </span>
              <span />
              <span />
              <span className="text-center tabular-nums">{fmtNum(totalPackages)}</span>
              <span />
              <span className="text-center tabular-nums">{fmtNum(totalWeight)}</span>
              <span className="text-center tabular-nums">{fmtNum(totalVolume)}</span>
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
