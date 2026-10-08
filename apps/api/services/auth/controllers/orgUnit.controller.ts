import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { orgUnitService } from "../services/orgUnit.service";
import type { DepartmentInfo, BranchInfo } from "../services/orgUnit.service";

// The company's departments and branches. Everyone in the company can read them
// (the noticeboard and user forms need the names); only admins maintain them.

interface OkResponse {
  ok: boolean;
}

interface DepartmentListResponse {
  departments: DepartmentInfo[];
}

export const departmentList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/departments" },
  async (): Promise<DepartmentListResponse> => {
    return { departments: await orgUnitService.listDepartments(getAuthData()!.companyID) };
  },
);

interface DepartmentCreateRequest {
  name: string;
}
interface DepartmentResponse {
  department: DepartmentInfo;
}

export const departmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/departments" },
  async (req: DepartmentCreateRequest): Promise<DepartmentResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { department: await orgUnitService.createDepartment(actor.companyID, req) };
  },
);

interface DepartmentUpdateRequest {
  id: string;
  name: string;
}

export const departmentUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/departments/:id" },
  async (req: DepartmentUpdateRequest): Promise<DepartmentResponse> => {
    const actor = requireRole("superadmin", "admin");
    const department = await orgUnitService.updateDepartment(req.id, actor.companyID, req);
    if (!department) throw APIError.notFound("Department not found");
    return { department };
  },
);

interface OrgUnitDeleteRequest {
  id: string;
}

export const departmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/departments/:id" },
  async (req: OrgUnitDeleteRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin");
    if (!(await orgUnitService.deleteDepartment(req.id, actor.companyID))) {
      throw APIError.notFound("Department not found");
    }
    return { ok: true };
  },
);

interface BranchListResponse {
  branches: BranchInfo[];
}

export const branchList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/branches" },
  async (): Promise<BranchListResponse> => {
    return { branches: await orgUnitService.listBranches(getAuthData()!.companyID) };
  },
);

interface BranchCreateRequest {
  name: string;
  country: string;
}
interface BranchResponse {
  branch: BranchInfo;
}

export const branchCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/branches" },
  async (req: BranchCreateRequest): Promise<BranchResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { branch: await orgUnitService.createBranch(actor.companyID, req) };
  },
);

interface BranchUpdateRequest {
  id: string;
  name: string;
  country: string;
}

export const branchUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/branches/:id" },
  async (req: BranchUpdateRequest): Promise<BranchResponse> => {
    const actor = requireRole("superadmin", "admin");
    const branch = await orgUnitService.updateBranch(req.id, actor.companyID, req);
    if (!branch) throw APIError.notFound("Branch not found");
    return { branch };
  },
);

export const branchDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/branches/:id" },
  async (req: OrgUnitDeleteRequest): Promise<OkResponse> => {
    const actor = requireRole("superadmin", "admin");
    if (!(await orgUnitService.deleteBranch(req.id, actor.companyID))) {
      throw APIError.notFound("Branch not found");
    }
    return { ok: true };
  },
);
