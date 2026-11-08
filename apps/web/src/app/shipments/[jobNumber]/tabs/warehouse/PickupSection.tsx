"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Button } from "antd";
import { LockOutlined, PlusOutlined } from "@ant-design/icons";
import type { MessageInstance } from "antd/es/message/interface";
import { useWarehouseSection } from "@/hooks/useWarehouseSection";
import { apiErrorMessage } from "@/lib/api";
import { RowActionsMenu } from "@/app/shipments/_components/RowActionsMenu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { rowKey } from "@/app/shipments/_lib/rowKey";
import { BTN_BAR, BTN_BAR_PRIMARY, KPI_VALUE, LABEL_TEXT, REF } from "@/styles/ui";
import { EMPTY } from "../../_components/detailStyles";
import { TD_CELL, TH_CELL, rowLine } from "./warehouseUi";

interface PickupSectionData {
  pin?: string;
  rows?: string;
}

type PickupRow = Record<string, string>;
type PickupField = "haulier" | "licensePlate" | "driver";

const FIELDS: PickupField[] = ["haulier", "licensePlate", "driver"];
const FIELD_NAMES: Record<PickupField, string> = { haulier: "Haulier", licensePlate: "Plate Number", driver: "Driver" };

const emptyRow = (): PickupRow => ({ haulier: "", licensePlate: "", driver: "" });

/** A driver is a name: letters only (any alphabet), with the spaces, hyphens, dots and apostrophes names have. */
const driverInput = (text: string) => text.replace(/[^\p{L}\s'.-]/gu, "");

export function PickupSection({ ownerId, messageApi }: { ownerId: string; messageApi: MessageInstance }) {
  const { data: sectionData, save, isSaving } = useWarehouseSection(ownerId, "pickup");
  const section = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
  // The PIN and the rows are saved together (one section): each save sends the other's last value,
  // read from these refs, so a row saved and a PIN made at nearly the same moment keep each other.
  const [pin, setPinState] = useState<string | null>(section.pin || null);
  const pinRef = useRef(pin);
  const setPin = (next: string | null) => {
    pinRef.current = next;
    setPinState(next);
  };
  const savedRowsRef = useRef(section.rows || "[]");
  const [rows, setRowsState] = useState<PickupRow[]>(() => [emptyRow()]);
  const rowsRef = useRef(rows);
  const setRows = (next: PickupRow[]) => {
    rowsRef.current = next;
    setRowsState(next);
  };
  // Changes not saved yet: after a failed save, Save offers to try again.
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const setDirty = (d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  };

  // A filled row reads as text; a double-click (or ⋯ > Edit) opens it, and a click anywhere else,
  // Tab out of it or Enter closes it again and saves it, as the remeasured lines do. An empty row
  // stays open to be typed in. `openRef` follows the open rows at once, so a row left by a click
  // and by its focus leaving with it is saved once.
  const [openRows, setOpenRowsState] = useState<Set<string>>(() => new Set());
  const openRef = useRef(openRows);
  const setOpen = (next: Set<string>) => {
    openRef.current = next;
    setOpenRowsState(next);
  };
  const [focus, setFocus] = useState<{ key: string; field: PickupField } | null>(null);

  useEffect(() => {
    const sec = (sectionData && typeof sectionData === "object" ? sectionData : {}) as PickupSectionData;
    if (sec.pin) setPin(sec.pin);
    if (typeof sec.rows === "string") savedRowsRef.current = sec.rows;
    // What is being typed, or not saved yet, is not replaced by what the server sends back meanwhile.
    if (dirtyRef.current || openRef.current.size > 0) return;
    try {
      const parsed: PickupRow[] = JSON.parse(sec.rows || "[]");
      if (parsed.length > 0) setRows(parsed);
    } catch {
      /* ignore */
    }
  }, [sectionData]);

  // Saves one after another, so an earlier save never lands after a later one.
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const persist = (next: PickupRow[]) => {
    chainRef.current = chainRef.current.then(async () => {
      try {
        const json = JSON.stringify(next);
        await save({ pin: pinRef.current || "", rows: json });
        savedRowsRef.current = json;
        // nothing typed meanwhile: the rows are as saved
        if (rowsRef.current === next) setDirty(false);
      } catch (e) {
        messageApi.error(`Failed to save the pick-up details: ${apiErrorMessage(e)}`);
      }
    });
  };
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  });

  const openRow = (key: string, field: PickupField = "haulier") => {
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
  const isFilled = (r: PickupRow) => FIELDS.some((f) => (r[f] ?? "").trim());
  const isOpen = (r: PickupRow) => openRows.has(rowKey(r)) || !isFilled(r);
  const anyOpen = openRows.size > 0;
  useEffect(() => {
    if (!anyOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || target.closest("[data-pickup-open], .ant-tooltip")) return;
      leaveAllRef.current();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [anyOpen]);
  // Leaving the tab (or the page) with a row still open saves it too.
  useEffect(
    () => () => {
      if (dirtyRef.current) persistRef.current(rowsRef.current);
    },
    [],
  );

  // In the rows' queue, with the rows as last saved: a row being left as the button is clicked is
  // saved first, and neither save undoes the other.
  const generatePin = () => {
    const newPin = String(Math.floor(1000 + Math.random() * 9000));
    setPin(newPin);
    chainRef.current = chainRef.current.then(async () => {
      try {
        await save({ pin: newPin, rows: savedRowsRef.current });
        messageApi.success("PIN generated");
      } catch (e) {
        // Not kept, so it is not shown as locked: it can be generated again.
        setPin(null);
        messageApi.error(`Failed to save the PIN: ${apiErrorMessage(e)}`);
      }
    });
  };

  const update = (key: string, field: PickupField, value: string) => {
    // typing keeps the row open, so it cannot close mid-word
    if (!openRef.current.has(key)) setOpen(new Set(openRef.current).add(key));
    setRows(rowsRef.current.map((r) => (rowKey(r) === key ? { ...r, [field]: field === "driver" ? driverInput(value) : value } : r)));
    setDirty(true);
  };
  // A new row is empty, so nothing is saved until it is filled and left; the cursor goes into it.
  const addRow = () => {
    const row = emptyRow();
    setRows([...rowsRef.current, row]);
    setFocus({ key: rowKey(row), field: "haulier" });
  };
  const deleteRow = (key: string) => {
    const left = rowsRef.current.filter((r) => rowKey(r) !== key);
    const next = left.length > 0 ? left : [emptyRow()];
    setRows(next);
    setOpen(new Set());
    setDirty(true);
    persist(next);
  };
  const [toDelete, setToDelete] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      {/* The pick-up's PIN: generated once, then locked */}
      <div className="flex items-center gap-4 flex-wrap rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div>
          <div className={LABEL_TEXT}>PIN</div>
          <div className={`${KPI_VALUE} ${REF} tracking-[0.3em] mt-0.5`}>{pin ? pin.split("").join(" ") : "– – – –"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pin ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
              <LockOutlined /> Locked
            </span>
          ) : (
            <Button size="small" type="primary" onClick={generatePin} loading={isSaving} className={BTN_BAR_PRIMARY}>
              Generate PIN
            </Button>
          )}
        </div>
      </div>

      <ConfirmModal
        open={toDelete !== null}
        danger
        title="Delete row?"
        description="The pick-up row is removed and the change is saved."
        confirmLabel="Delete"
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete !== null) deleteRow(toDelete);
          setToDelete(null);
        }}
      />

      <div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={LABEL_TEXT}>Pick-up details</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={addRow} className={BTN_BAR}>
              <PlusOutlined /> Add row
            </button>
            {/* Rows save as they are left; Save is here only when a save failed, to try again. */}
            {dirty && !anyOpen && !isSaving && (
              <Button size="small" type="primary" onClick={() => persist(rowsRef.current)} className={BTN_BAR_PRIMARY}>
                Save
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse table-fixed text-[13px]">
            <thead>
              <tr>
                <th className={`${TH_CELL} text-left w-[110px]`}>PIN</th>
                {FIELDS.map((f) => (
                  <th key={f} className={`${TH_CELL} text-left`}>
                    {FIELD_NAMES[f]}
                  </th>
                ))}
                <th className={`${TH_CELL} w-[56px]`} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const key = rowKey(row);
                const open = isOpen(row);
                // The PIN belongs to the pick-up, so every row carries it.
                const pinCell = <td className={`${TD_CELL} ${REF} text-slate-900`}>{pin ?? <span className="text-slate-400">—</span>}</td>;
                const actions = (
                  <td className={`${TD_CELL} text-center`}>
                    <RowActionsMenu
                      label={`Row ${idx + 1} actions`}
                      onEdit={open ? undefined : () => openRow(key)}
                      onDelete={rows.length > 1 || isFilled(row) ? () => setToDelete(key) : undefined}
                    />
                  </td>
                );
                if (!open) {
                  return (
                    <tr
                      key={key}
                      className={`${rowLine(idx, rows.length)} cursor-pointer hover:bg-slate-50/60`}
                      // the field double-clicked takes the cursor
                      onDoubleClick={(e) => openRow(key, ((e.target as Element).closest("[data-field]")?.getAttribute("data-field") as PickupField | null) ?? "haulier")}
                      title="Double-click to edit"
                    >
                      {pinCell}
                      {FIELDS.map((f) => (
                        // as tall as an open row's field, so a row keeps its height when it opens
                        <td key={f} data-field={f} className={`${TD_CELL} h-[37px] text-slate-900 truncate`}>
                          {(row[f] ?? "").trim() || <span className={EMPTY}>—</span>}
                        </td>
                      ))}
                      {actions}
                    </tr>
                  );
                }
                return (
                  <tr
                    key={key}
                    data-pickup-open
                    className={rowLine(idx, rows.length)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      (e.target as HTMLElement).blur?.();
                      leaveRow(key);
                    }}
                    // Tab out of the row (or a click on something that takes the focus) leaves it; a
                    // click on nothing in particular is the click-outside handler's.
                    onBlur={(e) => {
                      const next = e.relatedTarget as Node | null;
                      if (next && !e.currentTarget.contains(next)) leaveRow(key);
                    }}
                  >
                    {pinCell}
                    {FIELDS.map((f) => (
                      <td key={f} className={TD_CELL}>
                        <Input
                          size="small"
                          value={row[f] || ""}
                          autoFocus={focus?.key === key && focus.field === f}
                          onChange={(e) => update(key, f, e.target.value)}
                          aria-label={`${FIELD_NAMES[f]} of row ${idx + 1}`}
                        />
                      </td>
                    ))}
                    {actions}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
