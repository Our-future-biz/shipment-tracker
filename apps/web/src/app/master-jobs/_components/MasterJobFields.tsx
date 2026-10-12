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
    <div id={id} className="scroll-mt-4 bg-white border border-slate-200 rounded-xl p-4 shadow-sm transition-shadow">
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
    <div id={id} className={`${ROW} scroll-mt-24 rounded transition-colors`}>
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

const FLASH = ["ring-2", "ring-indigo-300", "bg-indigo-50"];

/** Scroll to a card or row of the detail and flash it briefly, so the eye lands on it. */
export function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...FLASH);
  window.setTimeout(() => el.classList.remove(...FLASH), 1600);
}
