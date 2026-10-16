import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { warehouseStockService as svc } from "../services/warehouseStock.service";
import type {
  WarehouseBondedEntryInput,
  WarehouseBondedEntryItem,
  WarehouseStockLineInput,
  WarehouseStockLineItem,
  WarehouseStockMovementInput,
  WarehouseStockMovementItem,
  WarehouseStockSyncRequest,
  WarehouseStockSyncResult,
  WarehouseZoneInput,
  WarehouseZoneItem,
} from "../interfaces/stock.interfaces";

// Stock tab of the warehouse module, always scoped to the caller's company. Movements are an
// audit trail: they can be recorded and listed, never edited or deleted.

const company = () => getAuthData()!.companyID;

// ---- warehouse-stock (stock on hand) ----

interface StockLineUpdateRequest extends WarehouseStockLineInput {
  id: string;
}

// Every line, open and closed (Picked / Voided, `closed` true): the screen filters what is on hand.
export const warehouseStockLineList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/stock" },
  async (): Promise<{ lines: WarehouseStockLineItem[] }> => {
    return { lines: await svc.listStockLines(company()) };
  },
);

// "Build stock from gate records" (manager): runs the gate sync on every live gate record —
// the first build after the migration, and the repair tool. `dryRun` only counts.
export const warehouseStockSync = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/stock/sync" },
  async ({ dryRun }: WarehouseStockSyncRequest): Promise<{ result: WarehouseStockSyncResult }> => {
    const { companyID, userID } = requireRole("superadmin", "admin", "manager");
    return { result: await svc.syncFromGate(companyID, userID, !!dryRun) };
  },
);

export const warehouseStockLineCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/stock" },
  async (req: WarehouseStockLineInput): Promise<{ line: WarehouseStockLineItem }> => {
    return { line: await svc.createStockLine(company(), req) };
  },
);

export const warehouseStockLineUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-concept/stock/:id" },
  async ({ id, ...data }: StockLineUpdateRequest): Promise<{ line: WarehouseStockLineItem }> => {
    return { line: await svc.updateStockLine(id, company(), data) };
  },
);

export const warehouseStockLineDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-concept/stock/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteStockLine(id, company());
    return { ok: true };
  },
);

// ---- warehouse-zones ----

interface ZoneUpdateRequest extends WarehouseZoneInput {
  id: string;
}

export const warehouseZoneList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/zones" },
  async (): Promise<{ zones: WarehouseZoneItem[] }> => {
    return { zones: await svc.listZones(company()) };
  },
);

export const warehouseZoneCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/zones" },
  async (req: WarehouseZoneInput): Promise<{ zone: WarehouseZoneItem }> => {
    return { zone: await svc.createZone(company(), req) };
  },
);

export const warehouseZoneUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-concept/zones/:id" },
  async ({ id, ...data }: ZoneUpdateRequest): Promise<{ zone: WarehouseZoneItem }> => {
    return { zone: await svc.updateZone(id, company(), data) };
  },
);

export const warehouseZoneDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-concept/zones/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteZone(id, company());
    return { ok: true };
  },
);

// ---- warehouse-stock-movements (append only) ----

export const warehouseStockMovementList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/stock-movements" },
  async (): Promise<{ movements: WarehouseStockMovementItem[] }> => {
    return { movements: await svc.listMovements(company()) };
  },
);

export const warehouseStockMovementCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/stock-movements" },
  async (req: WarehouseStockMovementInput): Promise<{ movement: WarehouseStockMovementItem }> => {
    const { companyID, userID } = getAuthData()!;
    return { movement: await svc.recordMovement(companyID, userID, req) };
  },
);

// ---- warehouse-bonded (customs warehouse register) ----

interface BondedUpdateRequest extends WarehouseBondedEntryInput {
  id: string;
}

export const warehouseBondedList = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/bonded" },
  async (): Promise<{ entries: WarehouseBondedEntryItem[] }> => {
    return { entries: await svc.listBonded(company()) };
  },
);

export const warehouseBondedCreate = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/bonded" },
  async (req: WarehouseBondedEntryInput): Promise<{ entry: WarehouseBondedEntryItem }> => {
    return { entry: await svc.createBonded(company(), req) };
  },
);

export const warehouseBondedUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/warehouse-concept/bonded/:id" },
  async ({ id, ...data }: BondedUpdateRequest): Promise<{ entry: WarehouseBondedEntryItem }> => {
    return { entry: await svc.updateBonded(id, company(), data) };
  },
);

export const warehouseBondedDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-concept/bonded/:id" },
  async ({ id }: { id: string }): Promise<{ ok: boolean }> => {
    await svc.deleteBonded(id, company());
    return { ok: true };
  },
);
