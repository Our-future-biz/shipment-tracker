"use client";

import { useState } from "react";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import { DepartmentsManager } from "../_components/DepartmentsManager";
import { BranchesManager } from "../_components/BranchesManager";
import { CountriesManager } from "../_components/CountriesManager";

export default function OrganizationPage() {
  const { user } = useAuth();
  // One search for the whole page: every section shows only its matching rows.
  const [search, setSearch] = useState("");

  if (user?.role !== "admin" && user?.role !== "superadmin") {
    return <div className="p-6 text-sm text-slate-500">You don&apos;t have permission to manage the organization.</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Organization</h1>
      <p className="text-sm text-slate-500 mb-4">
        Departments, branches and countries of your company. Assign departments and branches to people under Users — they decide which noticeboards each person sees.
      </p>
      {/* antd gives the input width: 100% outside Tailwind's cascade layers, hence the important flag. */}
      <Input
        placeholder="Search departments, branches, cities, countries..."
        aria-label="Search the organization"
        prefix={<SearchOutlined className="text-slate-400" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        className="!w-96 !max-w-full mb-4"
      />
      <div className="flex flex-col gap-4">
        <DepartmentsManager search={search} />
        <BranchesManager search={search} />
        <CountriesManager search={search} />
      </div>
    </div>
  );
}
