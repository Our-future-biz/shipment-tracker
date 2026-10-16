"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { gateKeys, warehouseRecordKeys } from "./warehouseKeys";

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

// List + create/update/delete for one warehouse record type. Changes to containers and dock
// slots also refresh the gate log, and every change the calculated reports.
function useRecords<Item, Input>({ key, list, create, update, remove }: RecordApi<Item, Input>) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: warehouseRecordKeys.of(key), queryFn: list });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of(key) }),
      queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.reportSummary() }),
      // Positions show their containers, and their dock slots (gate job, Expected today, floor mode).
      ...(key === "containers" || key === "dock-slots" ? [queryClient.invalidateQueries({ queryKey: gateKeys.all })] : []),
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
    queryKey: warehouseRecordKeys.reportSummary(),
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
    create: (input) => w.warehouseStockLineCreate(input).then(() => queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of("zones") })),
    update: (id, input) => w.warehouseStockLineUpdate(id, input).then(() => queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of("zones") })),
    remove: (id) => w.warehouseStockLineDelete(id).then(() => queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of("zones") })),
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
  const query = useQuery({ queryKey: warehouseRecordKeys.of("stock-movements"), queryFn: async () => (await w.warehouseStockMovementList()).movements });
  const record = useMutation({
    mutationFn: (input: interfaces.WarehouseStockMovementInput) => w.warehouseStockMovementCreate(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.of("stock-movements") }),
  });
  return { items: query.data ?? [], isLoading: query.isLoading, record: record.mutateAsync, isSaving: record.isPending };
};

// ---------- One container, many positions (houses) ----------

export type ContainerHouse = interfaces.WarehouseContainerHouse;
export type ContainerStampKind = interfaces.ContainerStampKind;
export type ContainerTallyInput = interfaces.ContainerTallyInput;

const CONTAINERS_KEY = warehouseRecordKeys.of("containers");
export const containerKey = (id: string) => [...CONTAINERS_KEY, id];

/**
 * One container with its houses: the stuffing plan (export) or the stripping tally (import), its
 * stamps and its log. Every action answers with the container as it is now (written into the
 * cache); the containers list, the report figures and the gate log are read again, since the
 * houses' lifecycles change with it.
 */
export const useWarehouseContainer = (id: string | undefined) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: containerKey(id ?? ""),
    queryFn: async () => (await w.warehouseContainerGet(id!)).container,
    enabled: !!id,
  });
  const onContainer = (c: WarehouseContainer) => {
    queryClient.setQueryData(containerKey(c.id), c);
    queryClient.invalidateQueries({ queryKey: CONTAINERS_KEY, exact: true });
    queryClient.invalidateQueries({ queryKey: warehouseRecordKeys.reportSummary() });
    queryClient.invalidateQueries({ queryKey: gateKeys.all });
  };
  const withContainer = <R extends { container: WarehouseContainer }>(res: R) => {
    onContainer(res.container);
    return res;
  };

  const addPositions = useMutation({
    mutationFn: (movementIds: string[]) => w.warehouseContainerAddPositions(id!, { movementIds }).then(withContainer),
  });
  const removePosition = useMutation({
    mutationFn: (movementId: string) => w.warehouseContainerRemovePosition(id!, movementId).then(withContainer),
  });
  const reorder = useMutation({
    mutationFn: (movementIds: string[]) => w.warehouseContainerReorder(id!, { movementIds }).then(withContainer),
  });
  const stamp = useMutation({
    mutationFn: (input: { kind: ContainerStampKind; seal?: string; plate?: string }) => w.warehouseContainerStamp(id!, input).then(withContainer),
  });
  const setStuffed = useMutation({
    mutationFn: ({ movementId, stuffed }: { movementId: string; stuffed: boolean }) => w.warehouseContainerSetStuffed(id!, movementId, { stuffed }).then(withContainer),
  });
  const tally = useMutation({
    mutationFn: ({ movementId, tally }: { movementId: string; tally: ContainerTallyInput }) => w.warehouseContainerTally(id!, movementId, { tally }).then(withContainer),
  });
  const voidTally = useMutation({
    mutationFn: ({ movementId, reason }: { movementId: string; reason: string }) => w.warehouseContainerVoidTally(id!, movementId, { reason }).then(withContainer),
  });
  const voidStamp = useMutation({
    mutationFn: ({ kind, reason }: { kind: ContainerStampKind; reason: string }) => w.warehouseContainerVoidStamp(id!, { kind, reason }).then(withContainer),
  });
  const update = useMutation({
    mutationFn: (input: interfaces.WarehouseContainerInput) => w.warehouseContainerUpdate(id!, input).then(withContainer),
  });

  return {
    container: query.data,
    isLoading: query.isLoading,
    error: query.error,
    /** Writes a container the server returned (floor mode's queue) into the cache. */
    onContainer,
    addPositions,
    removePosition,
    reorder,
    stamp,
    setStuffed,
    tally,
    voidTally,
    voidStamp,
    update,
  };
};
