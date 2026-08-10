"use client";

import { useParams, useRouter } from "next/navigation";
import { Button } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";
import { usePlatformCompanies, usePlatformCompanyUsers } from "@/hooks/useUserAdmin";
import { UsersManager } from "../../../settings/_components/UsersManager";

export default function PlatformCompanyUsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { companyId } = useParams<{ companyId: string }>();
  const { companies } = usePlatformCompanies();
  const cu = usePlatformCompanyUsers(companyId);

  if (user?.role !== "superadmin") {
    return <div className="p-6 text-sm text-slate-500">This area is restricted to platform administrators.</div>;
  }

  const company = companies.find((c) => c.id === companyId);

  return (
    <div className="p-6 max-w-4xl">
      <Button type="text" size="small" icon={<ArrowLeftOutlined />} className="mb-2 -ml-2" onClick={() => router.push("/platform/companies")}>
        Companies
      </Button>
      <h1 className="text-xl font-semibold text-slate-800 mb-1">{company?.name ?? "Company"} — Users</h1>
      <p className="text-sm text-slate-500 mb-4">Manage users for this company as a platform administrator.</p>
      <UsersManager
        users={cu.users}
        isLoading={cu.isLoading}
        allowedRoles={["admin", "manager", "user"]}
        currentUserId={user?.id ?? ""}
        createUser={cu.createUser}
        updateUser={cu.updateUser}
        deleteUser={cu.deleteUser}
      />
    </div>
  );
}
