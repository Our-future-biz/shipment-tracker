"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { DepartmentsManager } from "../_components/DepartmentsManager";
import { BranchesManager } from "../_components/BranchesManager";

export default function OrganizationPage() {
  const { user } = useAuth();

  if (user?.role !== "admin" && user?.role !== "superadmin") {
    return <div className="p-6 text-sm text-slate-500">You don&apos;t have permission to manage the organization.</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">Organization</h1>
      <p className="text-sm text-slate-500 mb-4">
        Departments and branches of your company. Assign them to people under Users — they decide which noticeboards each person sees.
      </p>
      <div className="flex flex-col gap-4">
        <DepartmentsManager />
        <BranchesManager />
      </div>
    </div>
  );
}
