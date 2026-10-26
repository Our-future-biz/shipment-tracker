"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DatePicker, Input, InputNumber, Select, TimePicker } from "antd";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { formatDateTime } from "@/lib/date";
import { czechPhoneProblem, limitCzechPhone } from "@/lib/phone";

dayjs.extend(customParseFormat);

// Building blocks for the gate log job, in the app's detail-page style (see the
// shipment detail page): white rounded cards with an indigo section bar, uppercase
// field labels, and inline fields that look like text until touched and save on blur.

export function Section({
  title,
  icon,
  extra,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-xl shadow-sm min-w-0 ${className}`}>
      <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        {icon && <span className="text-indigo-500 text-base leading-none">{icon}</span>}
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
        {extra && <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">{extra}</div>}
      </div>
      <div className={bodyClassName || "p-4"}>{children}</div>
    </section>
  );
}

export function FieldRow({ label, children, tall }: { label: string; children: ReactNode; tall?: boolean }) {
  return (
    <div className={`flex gap-2.5 py-1 text-xs border-b border-slate-100 last:border-b-0 ${tall ? "items-start" : "items-center"}`}>
      <span className={`w-[140px] shrink-0 text-[11px] font-bold text-slate-500 uppercase tracking-wide ${tall ? "pt-1.5" : ""}`}>{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// Keeps a local draft of a server value and re-syncs when the server value changes.
function useDraft<T>(value: T) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft] as const;
}

const inlineClass = "!text-xs -ml-[7px] hover:!bg-slate-50 focus-within:!bg-white";

export function InlineText({
  value,
  onSave,
  placeholder = "—",
  mono,
  phone,
  className = "",
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  /** A phone number: a +420 one takes at most 9 digits and is saved only with exactly 9. */
  phone?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useDraft(value);
  const problem = phone ? czechPhoneProblem(draft) : "";
  return (
    <Input
      size="small"
      variant="borderless"
      value={draft}
      placeholder={placeholder}
      status={problem ? "error" : undefined}
      title={problem || undefined}
      className={`${inlineClass} font-medium text-slate-900 ${mono ? "font-mono" : ""} ${className}`}
      onChange={(e) => setDraft(phone ? limitCzechPhone(e.target.value) : e.target.value)}
      onBlur={() => !problem && draft !== value && onSave(draft.trim())}
      onPressEnter={(e) => e.currentTarget.blur()}
    />
  );
}

// Gate stamp split in two: the day and the clock time of the same timestamp. Both look
// like text until clicked; a value that is not a timestamp is left as it is.
export const parseStamp = (value: string) => {
  if (!value) return null;
  const d = dayjs(formatDateTime(value), "DD.MM.YYYY HH:mm");
  return d.isValid() ? d : null;
};

const pickerClass = `${inlineClass} font-mono font-medium [&_input]:!text-xs`;

export function InlineDate({ value, onSave, className = "" }: { value: string; onSave: (v: string) => void; className?: string }) {
  return (
    <DatePicker
      size="small"
      variant="borderless"
      format="DD.MM.YYYY"
      allowClear
      placeholder="—"
      suffixIcon={null}
      value={parseStamp(value)}
      className={`${pickerClass} w-[120px] ${className}`}
      onChange={(d) => onSave(d ? d.format("YYYY-MM-DD") : "")}
    />
  );
}

export function InlineTime({ value, onSave, className = "" }: { value: string; onSave: (v: string) => void; className?: string }) {
  return (
    <TimePicker
      size="small"
      variant="borderless"
      format="HH:mm"
      minuteStep={5}
      allowClear
      placeholder="—"
      suffixIcon={null}
      value={parseStamp(value)}
      className={`${pickerClass} w-[86px] ${className}`}
      onChange={(d) => onSave(d ? d.format("HH:mm") : "")}
    />
  );
}

export function InlineNumber({
  value,
  onSave,
  step = 1,
  suffix,
}: {
  value: number | null;
  onSave: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  const [draft, setDraft] = useDraft<number | null>(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <InputNumber
        size="small"
        variant="borderless"
        min={0}
        step={step}
        controls={false}
        value={draft}
        className={`${inlineClass} w-[110px] font-mono font-medium`}
        onChange={(v) => setDraft(v == null ? null : Number(v))}
        onBlur={() => {
          const n = Math.max(0, draft ?? 0);
          if (n !== value) onSave(n);
          else setDraft(value);
        }}
        onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
      />
      {suffix && <span className="text-slate-400">{suffix}</span>}
    </span>
  );
}

interface InlineSelectProps<T extends string> {
  /** As stored; an older value that is not in `options` stays shown and selectable. */
  value: string;
  options: readonly T[];
  /** "" only when the field can be cleared (`clearable`). */
  onSave: (v: T | "") => void;
  width?: number;
  /** Shown text of a stored value (e.g. "Import" shown as "Outbound"); the stored value is saved. */
  labels?: (v: T) => string;
  /** False for a field that always has a value (the server refuses ""). */
  clearable?: boolean;
}

export function InlineSelect<T extends string>({ value, options, onSave, width = 220, labels, clearable = true }: InlineSelectProps<T>) {
  // Keep a stored value that is not in the list selectable, so it is never silently lost.
  const all: readonly T[] = value && !(options as readonly string[]).includes(value) ? [value as T, ...options] : options;
  return (
    <Select<T>
      size="small"
      variant="borderless"
      value={(value || undefined) as T | undefined}
      placeholder="—"
      allowClear={clearable}
      popupMatchSelectWidth={false}
      style={{ width }}
      className={`${inlineClass} [&_.ant-select-selection-item]:!font-medium`}
      options={all.map((o) => ({ value: o, label: labels ? labels(o) : o }))}
      onChange={(v) => onSave(v ?? "")}
    />
  );
}

export function InlineTextarea({ value, onSave, placeholder }: { value: string; onSave: (v: string) => void; placeholder?: string }) {
  const [draft, setDraft] = useDraft(value);
  return (
    <Input.TextArea
      variant="borderless"
      autoSize={{ minRows: 2, maxRows: 6 }}
      value={draft}
      placeholder={placeholder}
      className={`${inlineClass} text-slate-700`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
    />
  );
}

// Yes / No toggle; `neg` is the answer highlighted as a warning (red).
export function YesNo({ value, neg, onSave, label }: { value: boolean | null; neg: "yes" | "no"; onSave: (v: boolean) => void; label: string }) {
  const current = value == null ? "" : value ? "yes" : "no";
  return (
    <span className="inline-flex rounded-md border border-slate-200 overflow-hidden" role="group" aria-label={label}>
      {(["yes", "no"] as const).map((opt) => {
        const on = current === opt;
        const tone = on ? (opt === neg ? "bg-red-50 text-red-600 font-semibold" : "bg-slate-100 text-slate-800 font-semibold") : "bg-white text-slate-400 hover:text-slate-700";
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            className={`px-3 py-0.5 text-xs border-0 cursor-pointer transition-colors ${tone} ${opt === "no" ? "border-l border-slate-200" : ""}`}
            onClick={() => !on && onSave(opt === "yes")}
          >
            {opt === "yes" ? "Yes" : "No"}
          </button>
        );
      })}
    </span>
  );
}

export const fmtSize = (bytes: number) => {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1).replace(/\.0$/, "")} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} kB`;
  return `${bytes} B`;
};

// Header buttons are shared (components/buttons); re-exported for the Warehouse imports.
export { btnDefault, btnPrimary, btnDanger, btnInline } from "@/components/buttons";
