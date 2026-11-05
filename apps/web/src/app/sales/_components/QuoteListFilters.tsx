"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge, DatePicker, Popover, Select, Tooltip } from "antd";
import { FilterOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { ColumnFilterRows } from "@/components/ColumnFilterRows";
import { withFilterId, type GridFilter } from "@/components/gridFilters";
import { NO_OWNER, QUOTE_FILTER_COLUMNS, activeColumnFilters, type Filters } from "../_lib/quoteListState";
import { DIRECTIONS, QUOTE_STATUSES, SERVICE_TYPES } from "../_lib/types";
import { toolbarButtonClass } from "./ToolbarButton";
import { matchesUserOption, UserOptionLabel, type UserIdOption } from "../_lib/userOptions";

interface QuoteListFiltersProps {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  // Takes every filter off.
  onClear: () => void;
  // The company's users, for the Sales owner filter: by e-mail (userIdOptions).
  userOptions: UserIdOption[];
}

const DAY = "YYYY-MM-DD";

// How many filters are on - the number on the button. Several statuses are one filter, and so are
// the two ends of the created dates.
const activeCount = (filters: Filters) =>
  [
    filters.statuses.length > 0,
    filters.mineOnly || !!filters.owner,
    !!filters.serviceType,
    !!filters.direction,
    !!filters.dateFrom || !!filters.dateTo,
    !!filters.decidedThisMonth,
    !!filters.validWithinDays,
    !!filters.followUpDue,
  ].filter(Boolean).length + activeColumnFilters(filters.columns).length;

// How long typing in a column filter pauses before the list asks the server again.
const TYPING_PAUSE_MS = 400;

/**
 * "Filter by column": rows of column + value, kept here while they are being written (a new row has
 * neither yet) and handed to the list once typing pauses. Rows put on from outside - a view, the
 * address, Clear all - replace them.
 */
function useColumnRows(filters: Filters, onChange: (patch: Partial<Filters>) => void) {
  const applied = JSON.stringify(activeColumnFilters(filters.columns));
  const [rows, setRows] = useState<GridFilter[]>(() => activeColumnFilters(filters.columns).map(withFilterId));
  const sent = useRef(applied);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The list's change as it is when typing pauses: it merges onto the filters of that moment.
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    if (applied === sent.current) return;
    sent.current = applied;
    setRows(activeColumnFilters(JSON.parse(applied)).map(withFilterId));
  }, [applied]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (next: GridFilter[]) => {
    setRows(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const active = activeColumnFilters(next);
      const key = JSON.stringify(active);
      if (key === sent.current) return;
      sent.current = key;
      latest.current({ columns: active.length ? active : undefined });
    }, TYPING_PAUSE_MS);
  };
  return { rows, change };
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SetFilter({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between text-xs text-slate-600">
      <span>{label}</span>
      <button type="button" onClick={onRemove} className="text-xs font-medium text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-0">
        Remove
      </button>
    </div>
  );
}

// The filters of the Quotes list behind one button of its toolbar, as in Shipments: the list
// keeps its room and the button says how many filters are on. Every control shows the filter
// that is on, wherever it came from - the control itself, a view, the address.
export function QuoteListFilters({ filters, onChange, onClear, userOptions }: QuoteListFiltersProps) {
  const ownerOptions: UserIdOption[] = [{ value: "me", label: "Me" }, { value: NO_OWNER, label: "No owner" }, ...userOptions];
  // An owner the users do not name - they are still loading, or the user is gone - reads "…",
  // not as the id the address carries.
  if (filters.owner && !ownerOptions.some((option) => option.value === filters.owner)) ownerOptions.push({ value: filters.owner, label: "…" });
  const active = activeCount(filters);
  const columnRows = useColumnRows(filters, onChange);

  const panel = (
    <div role="group" aria-label="Filters" className="w-[340px] -m-1">
      <div className="flex items-center justify-between px-1 pb-2.5 mb-3 border-b border-slate-100">
        <span className="text-[13px] font-semibold text-slate-800">Filters</span>
        <button
          type="button"
          onClick={onClear}
          disabled={active === 0}
          className="text-xs font-medium text-slate-400 hover:text-red-500 disabled:text-slate-300 disabled:cursor-not-allowed bg-transparent border-none cursor-pointer p-0"
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-col gap-3 px-1">
        <Field label="Status">
          <Select
            mode="multiple"
            allowClear
            placeholder="All statuses"
            value={filters.statuses}
            onChange={(statuses: string[]) => onChange({ statuses })}
            options={QUOTE_STATUSES.map((s) => ({ value: s.key, label: s.label }))}
          />
        </Field>
        <Field label="Sales owner">
          <Select
            showSearch
            allowClear
            placeholder="All sales owners"
            filterOption={matchesUserOption}
            optionRender={(option) => <UserOptionLabel label={option.label} name={option.data.name} />}
            value={filters.mineOnly ? "me" : filters.owner}
            // "Me" is kept as such, not as the user's id: a view saved with it then means "mine" for whoever opens it.
            onChange={(v?: string) => onChange({ mineOnly: v === "me" || undefined, owner: v && v !== "me" ? v : undefined })}
            options={ownerOptions}
          />
        </Field>
        <Field label="Freight mode">
          <Select
            allowClear
            placeholder="All freight modes"
            value={filters.serviceType}
            onChange={(serviceType?: string) => onChange({ serviceType })}
            options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))}
          />
        </Field>
        <Field label="Trade direction">
          <Select
            allowClear
            placeholder="All directions"
            value={filters.direction}
            onChange={(direction?: string) => onChange({ direction })}
            options={DIRECTIONS.map((s) => ({ value: s, label: s }))}
          />
        </Field>
        {/* Either end may stay open: "created since" and "created until" are filters too. */}
        <Field label="Created">
          <DatePicker.RangePicker
            allowEmpty={[true, true]}
            format="DD.MM.YYYY"
            placeholder={["From", "To"]}
            value={[filters.dateFrom ? dayjs(filters.dateFrom) : null, filters.dateTo ? dayjs(filters.dateTo) : null]}
            onChange={(days) => onChange({ dateFrom: days?.[0]?.format(DAY), dateTo: days?.[1]?.format(DAY) })}
          />
        </Field>
        {/* Filters only the built-in views and the Sales managers' tiles set; shown so that they can be seen and taken off. */}
        {filters.decidedThisMonth && <SetFilter label="Won or lost this month" onRemove={() => onChange({ decidedThisMonth: undefined })} />}
        {!!filters.validWithinDays && (
          <SetFilter label={`Valid until within ${filters.validWithinDays} day${filters.validWithinDays === 1 ? "" : "s"}`} onRemove={() => onChange({ validWithinDays: undefined })} />
        )}
        {filters.followUpDue && <SetFilter label="Follow-up due" onRemove={() => onChange({ followUpDue: undefined })} />}
        {/* Any of the list's columns, as many rows as needed: each keeps the quotes whose text in the column contains the value, on every page. */}
        <div className="pt-2.5 border-t border-slate-100">
          <span className="block text-xs font-medium text-slate-500 mb-1.5">Filter by column</span>
          <ColumnFilterRows rows={columnRows.rows} columns={QUOTE_FILTER_COLUMNS} onChange={columnRows.change} />
        </div>
      </div>
    </div>
  );

  return (
    <Popover content={panel} trigger="click" placement="bottomRight">
      <Tooltip title="Filters">
        <Badge count={active} size="small" offset={[-4, 4]} className="[&_.ant-badge-count]:!bg-indigo-600">
          <button type="button" aria-label={active ? `Filters, ${active} on` : "Filters"} className={toolbarButtonClass("secondary", "square")}>
            <FilterOutlined />
          </button>
        </Badge>
      </Tooltip>
    </Popover>
  );
}
