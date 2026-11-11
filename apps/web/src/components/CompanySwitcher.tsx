"use client";

import { Select, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { setActingCompanyId } from "@/lib/actingCompany";
import { platformCompaniesKey } from "@/hooks/useUserAdmin";

// A superadmin's company switcher: superadmins see and change every company, one at a time. The
// company picked here is the one every page shows and every change goes to, as for one of its own
// users. The choice is stored first and the whole app then loaded again from the dashboard, so
// nothing of the company before stays on screen (a record of one company is no page of another);
// the page being left still works as the company before, so the save it sends as it goes (a
// quote's last change) lands where it was typed. Other tabs of the browser are loaded again too
// (components/SessionChangedNotice). Shown to superadmins only.
export function CompanySwitcher() {
  const { user, company } = useAuth();
  const isSuperadmin = user?.role === "superadmin";
  const companies = useQuery({ queryKey: platformCompaniesKey, queryFn: () => api.auth.companyList(), enabled: isSuperadmin });

  if (!isSuperadmin || !user) return null;

  const current = company?.id ?? user.companyId;
  const switched = !!company?.switched;
  const options = (companies.data?.companies ?? []).map((c) => ({
    value: c.id,
    label: c.id === user.companyId ? `${c.name} (own)` : c.name,
  }));
  // Shown by its name while the list loads.
  if (company && !options.some((o) => o.value === current)) options.unshift({ value: current, label: company.name || "…" });

  const choose = (id: string) => {
    if (id === current) return;
    // Stored for the page loaded next; this one keeps sending the company it shows until it is gone.
    setActingCompanyId(id === user.companyId ? null : id);
    window.location.href = "/dashboard";
  };

  return (
    <Tooltip title={switched ? "You are working as this company: everything you see and change is its" : "Superadmin: choose the company to work as"}>
      <div
        className={`flex items-center gap-2 rounded-lg px-2 py-1 border ${switched ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
      >
        <SwapOutlined className={switched ? "text-amber-600" : "text-slate-400"} />
        <span className={`text-[12px] font-medium whitespace-nowrap ${switched ? "text-amber-700" : "text-slate-500"}`}>Working as</span>
        <Select
          size="small"
          variant="borderless"
          showSearch
          optionFilterProp="label"
          aria-label="Company to work as"
          className="w-[200px]"
          value={current}
          loading={companies.isLoading}
          options={options}
          onChange={choose}
          popupMatchSelectWidth={false}
        />
      </div>
    </Tooltip>
  );
}
