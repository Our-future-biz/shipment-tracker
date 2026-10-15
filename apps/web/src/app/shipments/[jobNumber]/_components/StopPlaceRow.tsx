"use client";

import { useEffect, useState } from "react";
import { Input } from "antd";

interface StopPlaceRowProps {
  postcode?: string | null;
  country?: string | null;
  // Saves both values ("" clears one). The server stores a CZ postcode as its five digits.
  onSave: (postcode: string, country: string) => void;
}

// Postcode and country of a pick-up / delivery place, shown under its address text. Saved
// when a box is left or Enter is pressed, and only when something changed.
export function StopPlaceRow({ postcode, country, onSave }: StopPlaceRowProps) {
  const [postcodeDraft, setPostcodeDraft] = useState(postcode ?? "");
  const [countryDraft, setCountryDraft] = useState(country ?? "");

  // Follow the saved values (the normalised postcode, or a rollback after a refused save).
  useEffect(() => setPostcodeDraft(postcode ?? ""), [postcode]);
  useEffect(() => setCountryDraft(country ?? ""), [country]);

  const handleSave = () => {
    const nextPostcode = postcodeDraft.trim();
    const nextCountry = countryDraft.trim().toUpperCase();
    if (nextPostcode === (postcode ?? "") && nextCountry === (country ?? "")) return;
    onSave(nextPostcode, nextCountry);
  };

  return (
    <div className="flex gap-2.5 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
      <span className="w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Postcode / Country</span>
      <div className="flex-1 min-w-0 flex gap-2">
        <Input
          size="small"
          className="flex-1 min-w-0"
          placeholder="Postcode"
          aria-label="Postcode"
          maxLength={12}
          value={postcodeDraft}
          onChange={(e) => setPostcodeDraft(e.target.value)}
          onBlur={handleSave}
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
          onBlur={handleSave}
          onPressEnter={handleSave}
        />
      </div>
    </div>
  );
}
