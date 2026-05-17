"use client";

import { useState, useRef, useEffect } from "react";
import { STATUS_COLORS } from "@/lib/enums";
import type { ColumnDef } from "@/lib/columnConfig";

interface SpreadsheetCellProps {
  value: string;
  col: ColumnDef;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export const SpreadsheetCell = ({ value, col, isEditing, onStartEdit, onCommit, onCancel }: SpreadsheetCellProps) => {
  const isJobNumber = col.key === "jobNumber";
  const isStatus = col.key === "status";

  if (isEditing) {
    if (col.type === "dropdown" && col.options) {
      return (
        <td className="px-0 py-0 border-r border-gray-100 dark:border-gray-700" style={{ width: col.width, minWidth: col.width }}>
          <CellDropdown value={value} options={col.options} onCommit={onCommit} onCancel={onCancel} />
        </td>
      );
    }
    return (
      <td className="px-0 py-0 border-r border-gray-100 dark:border-gray-700" style={{ width: col.width, minWidth: col.width }}>
        <CellInput value={value} onCommit={onCommit} onCancel={onCancel} placeholder={col.type === "date" ? "YYYY-MM-DD" : ""} />
      </td>
    );
  }

  const statusColor = isStatus ? (STATUS_COLORS[value] || "#94a3b8") : undefined;

  return (
    <td
      className={`px-2 whitespace-nowrap border-r border-gray-100 dark:border-gray-700 cursor-pointer truncate ${
        isJobNumber ? "font-mono text-teal-600 dark:text-teal-400 font-medium hover:underline" : "text-gray-700 dark:text-gray-300"
      }`}
      style={{ width: col.width, minWidth: col.width, maxWidth: col.width, height: 28, lineHeight: "28px" }}
      onClick={onStartEdit}
    >
      {isStatus && value ? (
        <span
          className="inline-flex items-center px-1.5 rounded text-[10px] font-medium"
          style={{ backgroundColor: statusColor + "22", color: statusColor, border: `1px solid ${statusColor}44`, lineHeight: "20px" }}
        >
          {value}
        </span>
      ) : (
        <span className={value ? "" : "text-gray-300 dark:text-gray-600"}>
          {value || "—"}
        </span>
      )}
    </td>
  );
};

// ─── Inline Editors ────────────────────────────────────────────────

const CellInput = ({ value, onCommit, onCancel, placeholder }: { value: string; onCommit: (v: string) => void; onCancel: () => void; placeholder?: string }) => {
  const [localVal, setLocalVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      type="text"
      value={localVal}
      placeholder={placeholder}
      onChange={(e) => setLocalVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(localVal);
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => onCommit(localVal)}
      className="w-full h-7 bg-white dark:bg-gray-900 border-2 border-teal-500 text-[11px] px-2 py-0 focus:outline-none"
    />
  );
};

const CellDropdown = ({ value, options, onCommit, onCancel }: { value: string; options: string[]; onCommit: (v: string) => void; onCancel: () => void }) => {
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <select
      ref={ref}
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      onBlur={onCancel}
      className="w-full h-7 bg-white dark:bg-gray-900 border-2 border-teal-500 text-[11px] px-1 py-0 focus:outline-none"
    >
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
};
