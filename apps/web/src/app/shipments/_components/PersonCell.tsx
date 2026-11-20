"use client";

import { useState, type CSSProperties } from "react";
import { FadeText } from "@/components/FadeText";
import { UserPicker } from "@/components/UserPicker";
import { personChange } from "@/app/shipments/_lib/personFields";
import { emailBehind, nameOf } from "@/app/shipments/_lib/personNames";
import { usePeopleNames } from "@/app/shipments/_lib/usePeopleNames";
import { EMPTY } from "@/styles/ui";
import { UnlinkedPersonMark } from "./UnlinkedPersonMark";

// Handled By and Holiday Cover in the Shipments list: the person by name, not by the e-mail that is
// stored (user council x4); the e-mail shows on hover and the full name after a 1 s hover when cut.
// Edited as the grid's other person cells are (EditableCell): a double-click opens the company's
// users, Escape or a click away closes it, and the same person picked again changes nothing.
interface PersonCellProps {
  /** The stored e-mail ("" for nobody). */
  value: string;
  /** The column's title, for a screen reader. */
  label: string;
  /** Whether this user may change it (lib/shipmentEditRule canChangeShipmentField). */
  editable: boolean;
  /** A conditional format's colour. */
  style?: CSSProperties;
  onCommit: (value: string) => void;
}

export function PersonCell({ value, label, editable, style, onCommit }: PersonCellProps) {
  const names = usePeopleNames();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div onKeyDownCapture={(e) => e.key === "Escape" && setEditing(false)}>
        <UserPicker
          size="small"
          autoFocus
          defaultOpen
          className="w-full min-w-[200px]"
          popupMatchSelectWidth={false}
          aria-label={label}
          value={value}
          onChange={(email) => {
            setEditing(false);
            const next = personChange(value, email);
            if (next !== null) onCommit(next);
          }}
          onBlur={() => setEditing(false)}
        />
      </div>
    );
  }

  const shown = nameOf(value, names);
  const email = emailBehind(value, names);
  return (
    <span
      // Locked, it reads as a plain value: no pointer, no hover and no hint to edit it.
      className={`${editable ? "cursor-pointer hover:bg-slate-100" : ""} rounded px-1 -mx-1 transition-colors flex items-center`}
      onDoubleClick={editable ? () => setEditing(true) : undefined}
    >
      <FadeText
        className={shown ? "text-slate-700" : EMPTY}
        style={shown ? style : undefined}
        title={[email, editable ? "Double-click to edit" : ""].filter(Boolean).join(" · ") || undefined}
      >
        {shown || "—"}
      </FadeText>
      {shown && <UnlinkedPersonMark value={value} hint={editable ? "double-click to pick one" : "only the user in Handled By or Holiday Cover, or a manager, can pick one"} />}
    </span>
  );
}
