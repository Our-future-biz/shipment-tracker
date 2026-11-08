"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Input } from "antd";
import { ShipmentDetailsEditableContext } from "./EditableCell";
import { LockedBox } from "@/components/LockedBox";
import { LABEL, ROW } from "./detailStyles";

interface StopPlaceRowProps {
  postcode?: string | null;
  country?: string | null;
  // Saves both values ("" clears one). The server stores a CZ postcode as its five digits.
  onSave: (postcode: string, country: string) => void;
}

// Postcode and country of a pick-up / delivery place, shown under its address text. Its two boxes
// stay drawn but locked; a double-click opens them, and leaving them or Enter saves (only when
// something changed) and locks the row again.
export function StopPlaceRow({ postcode, country, onSave }: StopPlaceRowProps) {
  const editable = useContext(ShipmentDetailsEditableContext);
  const [editing, setEditingState] = useState(false);
  // Enter saves and closes; the boxes then go, and their blur must not save a second time.
  const open = useRef(false);
  const setEditing = (on: boolean) => {
    open.current = on;
    setEditingState(on);
  };
  const [postcodeDraft, setPostcodeDraft] = useState(postcode ?? "");
  const [countryDraft, setCountryDraft] = useState(country ?? "");

  // Follow the saved values (the normalised postcode, or a rollback after a refused save).
  useEffect(() => setPostcodeDraft(postcode ?? ""), [postcode]);
  useEffect(() => setCountryDraft(country ?? ""), [country]);

  const handleSave = () => {
    if (!open.current) return;
    setEditing(false);
    const nextPostcode = postcodeDraft.trim();
    const nextCountry = countryDraft.trim().toUpperCase();
    if (nextPostcode === (postcode ?? "") && nextCountry === (country ?? "")) return;
    onSave(nextPostcode, nextCountry);
  };

  if (!editing) {
    return (
      <div className={ROW}>
        <span className={LABEL}>Postcode / Country</span>
        <span
          className={`flex-1 min-w-0 flex gap-2 ${editable ? "cursor-pointer" : ""}`}
          title={editable ? "Double-click to edit" : undefined}
          onDoubleClick={editable ? () => setEditing(true) : undefined}
        >
          <LockedBox className="flex-1" value={postcode ?? ""} placeholder="Postcode" />
          <LockedBox className="w-14" value={country ?? ""} placeholder="CZ" />
        </span>
      </div>
    );
  }

  return (
    <div className={ROW}>
      <span className={LABEL}>Postcode / Country</span>
      <div
        className="flex-1 min-w-0 flex gap-2"
        // Leaving both boxes saves; moving from one to the other doesn't.
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) handleSave();
        }}
      >
        <Input
          size="small"
          autoFocus
          className="flex-1 min-w-0"
          placeholder="Postcode"
          aria-label="Postcode"
          maxLength={12}
          value={postcodeDraft}
          onChange={(e) => setPostcodeDraft(e.target.value)}
          onPressEnter={handleSave}
        />
        <Input
          size="small"
          className="!w-14"
          placeholder="CZ"
          aria-label="Country (two-letter code)"
          maxLength={2}
          value={countryDraft}
          onChange={(e) => setCountryDraft(e.target.value.toUpperCase())}
          onPressEnter={handleSave}
        />
      </div>
    </div>
  );
}
