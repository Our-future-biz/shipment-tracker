"use client";

import { useState } from "react";
import { Select, Tooltip } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { EditableCell } from "@/app/shipments/[jobNumber]/_components/EditableCell";
import { INCOTERM_NAMES, incotermLabel } from "@/lib/incoterms";

// Rows and cards of the master-job detail. They mirror the shipment detail's
// DetailCard / FieldRow markup, which is bound to ShipmentItem, so the master
// job gets the same look over its own record.

export type MasterJobCommit = (fieldKey: string, value: string) => void;

const ROW = "flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0";
const LABEL = "w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide";

interface CardProps {
  /** Anchor for the summary tiles that jump to this card. */
  id?: string;
  icon: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function MasterJobCard({ id, icon, title, actions, children }: CardProps) {
  return (
    <div id={id} data-jump="card" className="scroll-mt-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="-mx-4 -mt-4 mb-4 px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        <span className="text-indigo-500 text-base leading-none">{icon}</span>
        <span className="text-[13px] font-bold uppercase tracking-wider text-slate-700">{title}</span>
        {actions && <span className="ml-auto flex items-center gap-1.5">{actions}</span>}
      </div>
      {children}
    </div>
  );
}

interface FieldRowProps {
  label: string;
  /** Shipment column key — decides text, dropdown or date, same as on a shipment. */
  fieldKey: string;
  value?: string | null;
  onCommit: MasterJobCommit;
  /** Copied onto every linked shipment — marked so the user knows a save reaches the houses. */
  synced?: boolean;
  /** Anchor for the summary tiles that jump to this row. */
  id?: string;
}

function Label({ label, synced }: { label: string; synced?: boolean }) {
  return (
    <span className={LABEL}>
      {label}
      {synced && (
        <Tooltip title="Copied to every linked shipment">
          <SyncOutlined className="ml-1.5 text-[10px] text-indigo-400" aria-label="Copied to linked shipments" />
        </Tooltip>
      )}
    </span>
  );
}

export function FieldRow({ label, fieldKey, value, onCommit, synced, id }: FieldRowProps) {
  return (
    <div id={id} data-jump={id ? "row" : undefined} className={`${ROW} scroll-mt-24 rounded`}>
      <Label label={label} synced={synced} />
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={fieldKey}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        displayClassName="text-slate-900 font-medium"
      />
    </div>
  );
}

export function ReadOnlyRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className="flex-1 min-w-0 text-slate-500 font-medium">{value || "—"}</span>
    </div>
  );
}

const INCOTERM_OPTIONS = Object.keys(INCOTERM_NAMES).map((code) => ({ value: code, label: incotermLabel(code) }));

/** Incoterm stored as its code, shown and picked with its full name ("FOB – Free On Board"). */
export function IncotermRow({ label, fieldKey, value, onCommit }: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const code = value ?? "";
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      {editing ? (
        <Select
          size="small"
          autoFocus
          defaultOpen
          allowClear
          className="flex-1 min-w-[220px]"
          defaultValue={code || undefined}
          options={INCOTERM_OPTIONS}
          onChange={(v) => {
            setEditing(false);
            if ((v ?? "") !== code) onCommit(fieldKey, v ?? "");
          }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <span
          className="flex-1 min-w-0 cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors block text-slate-900 font-medium"
          title="Double-click to edit"
          onDoubleClick={() => setEditing(true)}
        >
          {incotermLabel(code) || "—"}
        </span>
      )}
    </div>
  );
}

// Cards are white, so they flash with a ring only; rows have no background of their own
// and also tint, which is easier to spot on a single line.
const FLASH_CARD = ["ring-4", "ring-indigo-400", "ring-offset-2"];
const FLASH_ROW = ["ring-2", "ring-indigo-400", "bg-indigo-100"];
const FLASH_MS = 2200;
const flashTimers = new WeakMap<HTMLElement, number>();

/**
 * Scroll to a card or row of the detail and flash it, so the eye lands on it even
 * when it was already on screen. A card goes to the top of the view; a row to the
 * middle, so the fields around it stay visible.
 */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const isRow = el.dataset.jump === "row";
  const flash = isRow ? FLASH_ROW : FLASH_CARD;
  el.scrollIntoView({ behavior: "smooth", block: isRow ? "center" : "start" });
  // A second click restarts the flash instead of cutting it short.
  window.clearTimeout(flashTimers.get(el));
  el.classList.add(...flash);
  flashTimers.set(el, window.setTimeout(() => el.classList.remove(...flash), FLASH_MS));
}
