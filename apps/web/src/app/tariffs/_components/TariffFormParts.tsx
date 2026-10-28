"use client";

import { useState, type ReactNode } from "react";
import { DatePicker, Input } from "antd";
import dayjs from "dayjs";

// The parts the "How the file was read" forms of every kind of tariff are built of: a labelled
// field, a sub-heading, a date, the terms, and a list typed as text.

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
}

export const Field = ({ label, children, hint }: FieldProps) => (
  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600 min-w-0">
    {label}
    {children}
    {hint && <span className="text-[11px] font-normal text-slate-400">{hint}</span>}
  </label>
);

export const SubTitle = ({ children }: { children: ReactNode }) => <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mt-1">{children}</div>;

interface DayFieldProps {
  label: string;
  /** YYYY-MM-DD */
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
}

/** A date of the tariff, such as the day it is valid from. */
export const DayField = ({ label, value, onChange, disabled }: DayFieldProps) => (
  <Field label={label}>
    <DatePicker
      aria-label={label}
      value={value ? dayjs(value) : null}
      format="DD.MM.YYYY"
      disabled={disabled}
      onChange={(d) => onChange(d ? d.format("YYYY-MM-DD") : null)}
      className="!w-full"
    />
  </Field>
);

interface ConditionsFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
  hint: string;
  disabled: boolean;
}

/** The tariff's terms, one per line. */
export const ConditionsField = ({ value, onChange, hint, disabled }: ConditionsFieldProps) => (
  <Field label="Conditions" hint={hint}>
    <Input.TextArea
      aria-label="Conditions"
      autoSize={{ minRows: 3, maxRows: 10 }}
      value={value.join("\n")}
      disabled={disabled}
      // Lines are kept as typed (an empty one too, so Enter starts a new line); empty ones are dropped when sent.
      onChange={(e) => onChange(e.target.value.split("\n"))}
    />
  </Field>
);

interface TypedListProps<T> {
  value: T;
  format: (value: T) => string;
  parse: (text: string) => T;
  onChange: (value: T) => void;
  label: string;
  placeholder?: string;
  disabled: boolean;
  /** Several lines, e.g. the port codes */
  multiline?: boolean;
  size?: "small" | "middle";
}

// A list typed as text ("CN, HK", "1=CZ, 2=SK", or "HAM = DEHAM" lines): kept as typed while
// typed, read into the list when left.
export function TypedList<T>({ value, format, parse, onChange, label, placeholder, disabled, multiline, size }: TypedListProps<T>) {
  const [text, setText] = useState(() => format(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(format(value));
  }
  const common = { "aria-label": label, placeholder, value: text, disabled, onBlur: () => onChange(parse(text)) };
  return multiline ? (
    <Input.TextArea {...common} autoSize={{ minRows: 3, maxRows: 12 }} onChange={(e) => setText(e.target.value)} />
  ) : (
    <Input {...common} size={size} onChange={(e) => setText(e.target.value)} />
  );
}
