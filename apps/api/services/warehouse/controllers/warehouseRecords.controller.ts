import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { warehouseRecordsService as svc } from "../services/warehouseRecords.service";
import type {
  WarehouseClaimInput,
  WarehouseClaimItem,
  WarehouseContainerInput,
  WarehouseContainerItem,
  WarehouseDockSlotInput,
  WarehouseDockSlotItem,
  WarehouseEquipmentInput,
  WarehouseEquipmentItem,
  WarehouseReportSummary,
  WarehouseSavedReportInput,
  WarehouseSavedReportItem,
  WarehouseStaffInput,
  WarehouseStaffItem,
} from "../interfaces/records.interfaces";

// Records of the warehouse module (Containers, Dock & Yard, Reports tabs): list, create,
// update and delete per record type, always scoped to the caller's company.

const company = () => getAuthData()!.companyID;

// ---- warehouse-containers ----

interface ContainerListResponse {
  containers: WarehouseContainerItem[];
}
interface ContainerResponse {
  container: WarehouseContainerItem;
}
interface ContainerUpdateRequest extends WarehouseContainerInput {
  id: string;
}

export const warehouseContainerList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-containers" },
  async (): Promise<ContainerListResponse> => ({ containers: await svc.listContainers(company()) }),
);

export const warehouseContainerCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers" },
  async (req: WarehouseContainerInput): Promise<ContainerResponse> => ({ container: await svc.createContainer(company(), req) }),
);

export const warehouseContainerUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-containers/:id" },
  async ({ id, ...data }: ContainerUpdateRequest): Promise<ContainerResponse> => ({ container: await svc.updateContainer(id, company(), data) }),
);

export const warehouseContainerDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-containers/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteContainer(id, company());
    return { ok: true };
  },
);

// ---- warehouse-dock-slots ----

interface DockSlotListResponse {
  slots: WarehouseDockSlotItem[];
}
interface DockSlotResponse {
  slot: WarehouseDockSlotItem;
}
interface DockSlotUpdateRequest extends WarehouseDockSlotInput {
  id: string;
}

export const warehouseDockSlotList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-dock-slots" },
  async (): Promise<DockSlotListResponse> => ({ slots: await svc.listDockSlots(company()) }),
);

export const warehouseDockSlotCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-dock-slots" },
  async (req: WarehouseDockSlotInput): Promise<DockSlotResponse> => ({ slot: await svc.createDockSlot(company(), req) }),
);

export const warehouseDockSlotUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-dock-slots/:id" },
  async ({ id, ...data }: DockSlotUpdateRequest): Promise<DockSlotResponse> => ({ slot: await svc.updateDockSlot(id, company(), data) }),
);

export const warehouseDockSlotDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-dock-slots/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteDockSlot(id, company());
    return { ok: true };
  },
);

// ---- warehouse-staff ----

interface StaffListResponse {
  staff: WarehouseStaffItem[];
}
interface StaffResponse {
  member: WarehouseStaffItem;
}
interface StaffUpdateRequest extends WarehouseStaffInput {
  id: string;
}

export const warehouseStaffList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-staff" },
  async (): Promise<StaffListResponse> => ({ staff: await svc.listStaff(company()) }),
);

export const warehouseStaffCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-staff" },
  async (req: WarehouseStaffInput): Promise<StaffResponse> => ({ member: await svc.createStaff(company(), req) }),
);

export const warehouseStaffUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-staff/:id" },
  async ({ id, ...data }: StaffUpdateRequest): Promise<StaffResponse> => ({ member: await svc.updateStaff(id, company(), data) }),
);

export const warehouseStaffDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-staff/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteStaff(id, company());
    return { ok: true };
  },
);

// ---- warehouse-equipment ----

interface EquipmentListResponse {
  equipment: WarehouseEquipmentItem[];
}
interface EquipmentResponse {
  item: WarehouseEquipmentItem;
}
interface EquipmentUpdateRequest extends WarehouseEquipmentInput {
  id: string;
}

export const warehouseEquipmentList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-equipment" },
  async (): Promise<EquipmentListResponse> => ({ equipment: await svc.listEquipment(company()) }),
);

export const warehouseEquipmentCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-equipment" },
  async (req: WarehouseEquipmentInput): Promise<EquipmentResponse> => ({ item: await svc.createEquipment(company(), req) }),
);

export const warehouseEquipmentUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-equipment/:id" },
  async ({ id, ...data }: EquipmentUpdateRequest): Promise<EquipmentResponse> => ({ item: await svc.updateEquipment(id, company(), data) }),
);

export const warehouseEquipmentDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-equipment/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteEquipment(id, company());
    return { ok: true };
  },
);

// ---- warehouse-claims ----

interface ClaimListResponse {
  claims: WarehouseClaimItem[];
}
interface ClaimResponse {
  claim: WarehouseClaimItem;
}
interface WarehouseClaimUpdateRequest extends WarehouseClaimInput {
  id: string;
}

export const warehouseClaimList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-claims" },
  async (): Promise<ClaimListResponse> => ({ claims: await svc.listClaims(company()) }),
);

export const warehouseClaimCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-claims" },
  async (req: WarehouseClaimInput): Promise<ClaimResponse> => ({ claim: await svc.createClaim(company(), req) }),
);

export const warehouseClaimUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-claims/:id" },
  async ({ id, ...data }: WarehouseClaimUpdateRequest): Promise<ClaimResponse> => ({ claim: await svc.updateClaim(id, company(), data) }),
);

export const warehouseClaimDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-claims/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteClaim(id, company());
    return { ok: true };
  },
);

// ---- warehouse-saved-reports ----

interface SavedReportListResponse {
  reports: WarehouseSavedReportItem[];
}
interface SavedReportResponse {
  report: WarehouseSavedReportItem;
}
interface SavedReportUpdateRequest extends WarehouseSavedReportInput {
  id: string;
}

export const warehouseSavedReportList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-saved-reports" },
  async (): Promise<SavedReportListResponse> => ({ reports: await svc.listSavedReports(company()) }),
);

export const warehouseSavedReportCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-saved-reports" },
  async (req: WarehouseSavedReportInput): Promise<SavedReportResponse> => ({ report: await svc.createSavedReport(company(), req) }),
);

export const warehouseSavedReportUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-saved-reports/:id" },
  async ({ id, ...data }: SavedReportUpdateRequest): Promise<SavedReportResponse> => ({ report: await svc.updateSavedReport(id, company(), data) }),
);

export const warehouseSavedReportDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-saved-reports/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteSavedReport(id, company());
    return { ok: true };
  },
);

// Calculated from positions, containers and dock slots.
export const warehouseReportSummary = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-reports/summary" },
  async (): Promise<{ summary: WarehouseReportSummary }> => ({ summary: await svc.reportSummary(company()) }),
);
