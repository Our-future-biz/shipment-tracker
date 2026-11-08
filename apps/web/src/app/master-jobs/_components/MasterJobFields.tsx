"use client";

import { useState } from "react";
import { Select, Tooltip } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { EditableCell } from "@/app/shipments/[jobNumber]/_components/EditableCell";
import { CARD, CARD_BODY, LABEL, REF_KEYS, REF_VALUE, ROW } from "@/app/shipments/[jobNumber]/_components/detailStyles";
import { FadeText } from "@/components/FadeText";
import { CARD_BAR, CARD_ICON, CARD_TITLE, EMPTY } from "@/styles/ui";
import { INCOTERM_NAMES, incotermLabel } from "@/lib/incoterms";

// Rows and cards of the master-job detail. They mirror the shipment detail's
// DetailCard / FieldRow markup, which is bound to ShipmentItem, so the master
// job gets the same look over its own record: the shipment detail's card shell
// and body (detailStyles), the app's indigo title bar (styles/ui.ts), and the
// shipment detail's own row and label.

export type MasterJobCommit = (fieldKey: string, value: string) => void;

/** A field's conditional-format colours (the Shipments list's rules), as Shipment Details colours its rows. */
export type StyleFor = (fieldKey: string, value?: string | null) => React.CSSProperties | undefined;

export { ROW };

interface CardProps {
  /** Anchor for the summary tiles that jump to this card. */
  id?: string;
  icon: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
  /** Extra classes on the card shell, e.g. h-full for cards side by side. */
  className?: string;
  /** The body's classes; the shipment card body by default, a padded one for tables and lists. */
  bodyClassName?: string;
  children: React.ReactNode;
}

/** The body of a card holding a table or list rather than rows. */
export const CARD_BODY_PADDED = "p-4 flex-1 min-w-0";

export function MasterJobCard({ id, icon, title, actions, className, bodyClassName = CARD_BODY, children }: CardProps) {
  return (
    <div id={id} data-jump="card" className={`scroll-mt-4 ${CARD} ${className ?? ""}`}>
      <div className={CARD_BAR}>
        <span className={CARD_ICON}>{icon}</span>
        <h3 className={CARD_TITLE}>{title}</h3>
        {actions && <span className="ml-auto flex items-center gap-1.5">{actions}</span>}
      </div>
      <div className={bodyClassName}>{children}</div>
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
  styleFor?: StyleFor;
}

export function Label({ label, synced }: { label: string; synced?: boolean }) {
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

export function FieldRow({ label, fieldKey, value, onCommit, synced, id, styleFor }: FieldRowProps) {
  return (
    <div id={id} data-jump={id ? "row" : undefined} className={`${ROW} scroll-mt-24`}>
      <Label label={label} synced={synced} />
      <EditableCell
        className="flex-1 min-w-0"
        fieldKey={fieldKey}
        value={value}
        onCommit={onCommit}
        placeholder="—"
        // The shipment's value style: a code (booking, MBL, voyage, references) in its REF look.
        displayClassName={REF_KEYS.has(fieldKey) ? REF_VALUE : "text-slate-900"}
        emptyClassName={EMPTY}
        displayStyle={styleFor?.(fieldKey, value)}
      />
    </div>
  );
}

// A read-only row in the shipment's RoRow look: a black value that fades out when too long.
// A code (the MCZ number) takes the REF look of the editable codes.
export function ReadOnlyRow({ label, value, code }: { label: string; value?: React.ReactNode; code?: boolean }) {
  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      {value ? (
        <FadeText className={`flex-1 ${code ? REF_VALUE : "text-slate-900 tabular-nums"}`}>{value}</FadeText>
      ) : (
        <span className={`flex-1 min-w-0 ${EMPTY}`}>—</span>
      )}
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
          className="flex-1 min-w-0 cursor-pointer rounded px-1 -mx-1 hover:bg-slate-100 transition-colors block text-slate-900"
          title="Double-click to edit"
          onDoubleClick={() => setEditing(true)}
        >
          {incotermLabel(code) || <span className={EMPTY}>—</span>}
        </span>
      )}
    </div>
  );
}

// Cards are white, so they flash with a ring only; rows have no background of their own
// and also tint, which is easier to spot on a single line. Only the flash is rounded: a row
// is square, as on Shipment Details.
const FLASH_CARD = ["ring-4", "ring-indigo-400", "ring-offset-2"];
const FLASH_ROW = ["ring-2", "ring-indigo-400", "bg-indigo-100", "rounded"];
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
