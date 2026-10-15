"use client";

interface RateUnpricedNoteProps {
  title: string;
  reason: string;
}

// A side of a rate the engine could not price, and why in plain words.
export const RateUnpricedNote = ({ title, reason }: RateUnpricedNoteProps) => (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
    <span className="font-semibold">{title}: unpriced.</span> {reason}
  </div>
);
