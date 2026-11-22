"use client";

import { Select, Button } from "antd";
import { useBranches, useCountries, useDepartments } from "@/hooks/useOrgUnits";
import { SEVERITIES } from "../_lib/boards";
import { branchesInCountries, branchOptions } from "../_lib/branches";
import { hasFilters } from "../_lib/noticeFilters";
import { HINT } from "@/styles/ui";
import type { NoticeFilters } from "../_lib/noticeFilters";

interface NoticeFiltersBarProps {
  value: NoticeFilters;
  onChange: (value: NoticeFilters) => void;
  shown: number;
  total: number;
}

// Country, branch, department and priority, each "All" until something is picked; several countries, branches
// and departments may be picked (owner's answer 22 Nov). The lists are the organization's own, and the
// branches follow the chosen countries.
export function NoticeFiltersBar({ value, onChange, shown, total }: NoticeFiltersBarProps) {
  const { countries } = useCountries();
  const { branches } = useBranches();
  const { departments } = useDepartments();

  const handleCountryChange = (countryCodes: string[]) => {
    const branchIds = branchesInCountries(branches, value.branchIds ?? [], countryCodes);
    onChange({ ...value, countryCodes, branchIds });
  };

  const common = {
    allowClear: true,
    showSearch: true,
    optionFilterProp: "label",
    className: "!w-48",
  } as const;
  // Several picked show as the first and "+ N": the bar keeps its one line.
  const several = { ...common, mode: "multiple", maxTagCount: "responsive" } as const;

  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
      <Select
        {...several}
        aria-label="Filter by country"
        placeholder="All countries"
        value={value.countryCodes ?? []}
        onChange={handleCountryChange}
        options={countries.map((c) => ({ value: c.code, label: c.name }))}
      />
      <Select
        {...several}
        aria-label="Filter by branch"
        placeholder={value.countryCodes?.length ? "All branches in these countries" : "All branches"}
        value={value.branchIds ?? []}
        onChange={(branchIds: string[]) => onChange({ ...value, branchIds })}
        options={branchOptions(branches, value.countryCodes)}
      />
      <Select
        {...several}
        aria-label="Filter by department"
        placeholder="All departments"
        value={value.departmentIds ?? []}
        onChange={(departmentIds: string[]) => onChange({ ...value, departmentIds })}
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
          <span className={HINT}>
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
