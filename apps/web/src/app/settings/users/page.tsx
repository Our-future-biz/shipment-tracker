"use client";

import { useAuth } from "@/lib/auth/AuthContext";
import { useCompanyUsers } from "@/hooks/useUserAdmin";
import { useDepartments, useBranches } from "@/hooks/useOrgUnits";
import { UsersManager } from "../_components/UsersManager";
import { PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";

export default function CompanyUsersPage() {
  const { user } = useAuth();
  const cu = useCompanyUsers();
  const { departments } = useDepartments();
  const { branches } = useBranches();

  const canManage = user?.role === "admin" || user?.role === "manager";
  if (!canManage) {
    return <div className="p-6 text-sm text-slate-500">You don&apos;t have permission to manage users.</div>;
  }

  // Admins can assign any company role; managers can only create standard users.
  const allowedRoles = user?.role === "admin" ? ["admin", "manager", "user"] : ["user"];

  return (
    <div className="p-6 max-w-5xl">
      <h1 className={`${PAGE_TITLE} mb-1`}>Users</h1>
      <p className={`${PAGE_SUBTITLE} mb-4`}>Manage the people who can access your company&apos;s workspace.</p>
      <UsersManager
        users={cu.users}
        isLoading={cu.isLoading}
        allowedRoles={allowedRoles}
        currentUserId={user?.id ?? ""}
        orgUnits={{ departments, branches }}
        createUser={cu.createUser}
        updateUser={cu.updateUser}
        deleteUser={cu.deleteUser}
      />
    </div>
  );
}
