"use client";

import { useParams } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { useAuth } from "@/lib/auth/AuthContext";
import { usePlatformCompanies, usePlatformCompanyUsers } from "@/hooks/useUserAdmin";
import { useDepartments, useBranches } from "@/hooks/useOrgUnits";
import { PAGE_SUBTITLE, PAGE_TITLE } from "@/styles/ui";
import { UsersManager } from "../../../settings/_components/UsersManager";

export default function PlatformCompanyUsersPage() {
  const { user } = useAuth();
  const { companyId } = useParams<{ companyId: string }>();
  const { companies } = usePlatformCompanies();
  const cu = usePlatformCompanyUsers(companyId);
  // Departments and branches are only readable for the signed-in user's own company.
  const isOwnCompany = companyId === user?.companyId;
  const { departments } = useDepartments();
  const { branches } = useBranches();

  if (user?.role !== "superadmin") {
    return <div className="p-6 text-sm text-slate-500">This area is restricted to platform administrators.</div>;
  }

  const company = companies.find((c) => c.id === companyId);

  return (
    <div className="p-6 max-w-4xl">
      <BackLink href="/platform/companies" className="mb-2">Companies</BackLink>
      <h1 className={`${PAGE_TITLE} mb-1`}>{company?.name ?? "Company"} — Users</h1>
      <p className={`${PAGE_SUBTITLE} mb-4`}>Manage users for this company as a platform administrator.</p>
      <UsersManager
        users={cu.users}
        isLoading={cu.isLoading}
        allowedRoles={["admin", "manager", "user"]}
        currentUserId={user?.id ?? ""}
        currentUserRole={user?.role ?? ""}
        orgUnits={isOwnCompany ? { departments, branches } : undefined}
        createUser={cu.createUser}
        updateUser={cu.updateUser}
        deleteUser={cu.deleteUser}
      />
    </div>
  );
}
