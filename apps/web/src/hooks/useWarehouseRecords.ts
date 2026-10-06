"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

export type WarehouseContainer = interfaces.WarehouseContainerItem;
export type DockSlot = interfaces.WarehouseDockSlotItem;
export type StaffMember = interfaces.WarehouseStaffItem;
export type Equipment = interfaces.WarehouseEquipmentItem;
export type Claim = interfaces.WarehouseClaimItem;
export type SavedReport = interfaces.WarehouseSavedReportItem;

interface RecordApi<Item, Input> {
  key: string;
  list: () => Promise<Item[]>;
  create: (input: Input) => Promise<unknown>;
  update: (id: string, input: Input) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

// List + create/update/delete for one warehouse record type. Changes to containers also
// refresh the gate log (positions show their containers) and the calculated reports.
function useRecords<Item, Input>({ key, list, create, update, remove }: RecordApi<Item, Input>) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["warehouse-records", key], queryFn: list });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["warehouse-records", key] }),
      queryClient.invalidateQueries({ queryKey: ["warehouse-records", "report-summary"] }),
      ...(key === "containers" ? [queryClient.invalidateQueries({ queryKey: ["warehouse-gate"] })] : []),
    ]);

  const createMut = useMutation({ mutationFn: create, onSuccess: refresh });
  const updateMut = useMutation({ mutationFn: ({ id, input }: { id: string; input: Input }) => update(id, input), onSuccess: refresh });
  const removeMut = useMutation({ mutationFn: remove, onSuccess: refresh });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    create: createMut.mutateAsync,
    update: (id: string, input: Input) => updateMut.mutateAsync({ id, input }),
    remove: removeMut.mutateAsync,
    isSaving: createMut.isPending || updateMut.isPending,
  };
}

const w = api.warehouse;

export const useWarehouseContainers = () =>
  useRecords<WarehouseContainer, interfaces.WarehouseContainerInput>({
    key: "containers",
    list: async () => (await w.warehouseContainerList()).containers,
    create: (input) => w.warehouseContainerCreate(input),
    update: (id, input) => w.warehouseContainerUpdate(id, input),
    remove: (id) => w.warehouseContainerDelete(id),
  });

export const useDockSlots = () =>
  useRecords<DockSlot, interfaces.WarehouseDockSlotInput>({
    key: "dock-slots",
    list: async () => (await w.warehouseDockSlotList()).slots,
    create: (input) => w.warehouseDockSlotCreate(input),
    update: (id, input) => w.warehouseDockSlotUpdate(id, input),
    remove: (id) => w.warehouseDockSlotDelete(id),
  });

export const useStaff = () =>
  useRecords<StaffMember, interfaces.WarehouseStaffInput>({
    key: "staff",
    list: async () => (await w.warehouseStaffList()).staff,
    create: (input) => w.warehouseStaffCreate(input),
    update: (id, input) => w.warehouseStaffUpdate(id, input),
    remove: (id) => w.warehouseStaffDelete(id),
  });

export const useEquipment = () =>
  useRecords<Equipment, interfaces.WarehouseEquipmentInput>({
    key: "equipment",
    list: async () => (await w.warehouseEquipmentList()).equipment,
    create: (input) => w.warehouseEquipmentCreate(input),
    update: (id, input) => w.warehouseEquipmentUpdate(id, input),
    remove: (id) => w.warehouseEquipmentDelete(id),
  });

export const useClaims = () =>
  useRecords<Claim, interfaces.WarehouseClaimInput>({
    key: "claims",
    list: async () => (await w.warehouseClaimList()).claims,
    create: (input) => w.warehouseClaimCreate(input),
    update: (id, input) => w.warehouseClaimUpdate(id, input),
    remove: (id) => w.warehouseClaimDelete(id),
  });

export const useSavedReports = () =>
  useRecords<SavedReport, interfaces.WarehouseSavedReportInput>({
    key: "saved-reports",
    list: async () => (await w.warehouseSavedReportList()).reports,
    create: (input) => w.warehouseSavedReportCreate(input),
    update: (id, input) => w.warehouseSavedReportUpdate(id, input),
    remove: (id) => w.warehouseSavedReportDelete(id),
  });

export const useReportSummary = () => {
  const query = useQuery({
    queryKey: ["warehouse-records", "report-summary"],
    queryFn: async () => (await w.warehouseReportSummary()).summary,
  });
  return { summary: query.data, isLoading: query.isLoading };
};

// ---------- Stock tab ----------

export type StockLine = interfaces.WarehouseStockLineItem;
export type Zone = interfaces.WarehouseZoneItem;
export type StockMovement = interfaces.WarehouseStockMovementItem;
export type BondedEntry = interfaces.WarehouseBondedEntryItem;

// Stock lines also change zone occupancy, so both lists refresh together.
export const useStockLines = () => {
  const queryClient = useQueryClient();
  const records = useRecords<StockLine, interfaces.WarehouseStockLineInput>({
    key: "stock-lines",
    list: async () => (await w.warehouseStockLineList()).lines,
    create: (input) => w.warehouseStockLineCreate(input).then(() => queryClient.invalidateQueries({ queryKey: ["warehouse-records", "zones"] })),
    update: (id, input) => w.warehouseStockLineUpdate(id, input).then(() => queryClient.invalidateQueries({ queryKey: ["warehouse-records", "zones"] })),
    remove: (id) => w.warehouseStockLineDelete(id).then(() => queryClient.invalidateQueries({ queryKey: ["warehouse-records", "zones"] })),
  });
  return records;
};

export const useZones = () =>
  useRecords<Zone, interfaces.WarehouseZoneInput>({
    key: "zones",
    list: async () => (await w.warehouseZoneList()).zones,
    create: (input) => w.warehouseZoneCreate(input),
    update: (id, input) => w.warehouseZoneUpdate(id, input),
    remove: (id) => w.warehouseZoneDelete(id),
  });

export const useBondedEntries = () =>
  useRecords<BondedEntry, interfaces.WarehouseBondedEntryInput>({
    key: "bonded",
    list: async () => (await w.warehouseBondedList()).entries,
    create: (input) => w.warehouseBondedCreate(input),
    update: (id, input) => w.warehouseBondedUpdate(id, input),
    remove: (id) => w.warehouseBondedDelete(id),
  });

// Movements are an audit trail: list and record only.
export const useStockMovements = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["warehouse-records", "stock-movements"], queryFn: async () => (await w.warehouseStockMovementList()).movements });
  const record = useMutation({
    mutationFn: (input: interfaces.WarehouseStockMovementInput) => w.warehouseStockMovementCreate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["warehouse-records", "stock-movements"] }),
  });
  return { items: query.data ?? [], isLoading: query.isLoading, record: record.mutateAsync, isSaving: record.isPending };
};
