"use client";

import { Select, Button } from "antd";
import { useBranches, useCountries, useDepartments } from "@/hooks/useOrgUnits";
import { SEVERITIES } from "../_lib/boards";
import { hasFilters } from "../_lib/noticeFilters";
import type { NoticeFilters } from "../_lib/noticeFilters";

interface NoticeFiltersBarProps {
  value: NoticeFilters;
  onChange: (value: NoticeFilters) => void;
  shown: number;
  total: number;
}

// Country, branch, department and priority, each "All" until one is picked; the lists are the
// organization's own, and the branches follow the chosen country.
export function NoticeFiltersBar({ value, onChange, shown, total }: NoticeFiltersBarProps) {
  const { countries } = useCountries();
  const { branches } = useBranches();
  const { departments } = useDepartments();

  const branchOptions = branches
    .filter((b) => !value.countryCode || b.countryCode === value.countryCode)
    .map((b) => ({ value: b.id, label: b.city ? `${b.name} (${b.city})` : b.name }));

  const setCountry = (countryCode?: string) => {
    // A branch in another country no longer fits.
    const branch = branches.find((b) => b.id === value.branchId);
    const keepBranch = !countryCode || branch?.countryCode === countryCode;
    onChange({ ...value, countryCode, branchId: keepBranch ? value.branchId : undefined });
  };

  const common = {
    allowClear: true,
    showSearch: true,
    optionFilterProp: "label",
    className: "!w-48",
  } as const;

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
      <Select
        {...common}
        aria-label="Filter by country"
        placeholder="All countries"
        value={value.countryCode}
        onChange={setCountry}
        options={countries.map((c) => ({ value: c.code, label: c.name }))}
      />
      <Select
        {...common}
        aria-label="Filter by branch"
        placeholder={value.countryCode ? "All branches in this country" : "All branches"}
        value={value.branchId}
        onChange={(branchId?: string) => onChange({ ...value, branchId })}
        options={branchOptions}
      />
      <Select
        {...common}
        aria-label="Filter by department"
        placeholder="All departments"
        value={value.departmentId}
        onChange={(departmentId?: string) => onChange({ ...value, departmentId })}
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
      />
      <Select
        {...common}
        showSearch={false}
        aria-label="Filter by priority"
        placeholder="All priorities"
        className="!w-40"
        value={value.severity}
        onChange={(severity?: string) => onChange({ ...value, severity })}
        options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))}
      />
      {hasFilters(value) && (
        <>
          <span className="text-xs text-slate-500">
            {shown} of {total}
          </span>
          <Button type="link" size="small" onClick={() => onChange({})}>
            Clear filters
          </Button>
        </>
      )}
    </div>
  );
}
