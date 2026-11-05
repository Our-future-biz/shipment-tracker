"use client";

import { INPUT, LABEL_TEXT } from "@/styles/ui";

// The app's hand-drawn field (INPUT), as wide as its grid column.
const inputClass = `${INPUT} w-full`;

export function GridInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
    />
  );
}

export function GridSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} cursor-pointer !px-1`}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function GridHeader({ columns, template }: { columns: string[]; template: string }) {
  return (
    <div className={`grid ${template} items-center gap-1 pb-1 mb-1 border-b border-slate-200`}>
      {columns.map((c, i) => (
        <span key={i} className={`${LABEL_TEXT} px-1`}>
          {c}
        </span>
      ))}
    </div>
  );
}
