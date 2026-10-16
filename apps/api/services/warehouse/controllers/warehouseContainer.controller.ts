import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { containerService } from "../services/container.service";
import type { ContainerStampKind, ContainerTallyInput, WarehouseContainerItem } from "../interfaces/records.interfaces";
import { requireModule } from "../../../lib/modules";

// One container, many positions (houses): the stuffing plan of an export container, the
// stripping tally of an import container and the container's own stamps. Every action is logged
// on the container and on each position it touches.

interface ContainerResponse {
  container: WarehouseContainerItem;
}

interface ContainerActionResponse {
  container: WarehouseContainerItem;
  /** done · already_done (this request came before) · done_by_someone_else (another request was first; only with a clientRequestId) */
  outcome: "done" | "already_done" | "done_by_someone_else";
  /** Text for a toast; "" when nothing to say. */
  notice: string;
}

interface ContainerVoidResponse {
  container: WarehouseContainerItem;
  /** Set when shipments were already updated from what was voided (they are not changed back). */
  notice: string;
}

/** Floor mode (offline queue): when it was done on the phone (ISO) and the request's id (UUID). */
interface OfflineFields {
  recordedAt?: string;
  clientRequestId?: string;
}

// One container with its houses, totals against its capacity and its log.
export const warehouseContainerGet = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-containers/:id" },
  async ({ id }: { id: string }): Promise<ContainerResponse> => {
    await requireModule("warehouse_concept");
    return { container: await containerService.detail(id, getAuthData()!.companyID) };
  },
);

// Adds positions as houses. Export: inbound (příjem) positions in the warehouse, not on hold;
// import: outbound (výdej) positions not received yet. A position is in at most one container.
export const warehouseContainerAddPositions = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/positions" },
  async ({ id, movementIds }: { id: string; movementIds: string[] }): Promise<ContainerResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { container: await containerService.addPositions(id, companyID, userID, movementIds) };
  },
);

// Takes a house out (not once it is stuffed or tallied).
export const warehouseContainerRemovePosition = api(
  { expose: true, auth: true, method: "DELETE", path: "/warehouse-containers/:id/positions/:movementId" },
  async ({ id, movementId }: { id: string; movementId: string }): Promise<ContainerResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { container: await containerService.removePosition(id, companyID, userID, movementId) };
  },
);

// The order of the houses: every house's position, in the new order.
export const warehouseContainerReorder = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/positions-order" },
  async ({ id, movementIds }: { id: string; movementIds: string[] }): Promise<ContainerResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return { container: await containerService.reorder(id, companyID, userID, movementIds) };
  },
);

interface ContainerStampRequest extends OfflineFields {
  id: string;
  /** gateIn · strippingStart (import) · close (export, with the seal) · gateOut (with the truck plate, optional) */
  kind: ContainerStampKind;
  seal?: string;
  plate?: string;
}

// Container stamps, in strict order. The export gate-out releases every stuffed house (storage
// stops; its shipment gets the released date and the plate); the close and the gate-out need a
// connection (never from the offline queue).
export const warehouseContainerStamp = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/stamp" },
  async ({ id, kind, seal, plate, recordedAt, clientRequestId }: ContainerStampRequest): Promise<ContainerActionResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = getAuthData()!;
    return containerService.stamp(id, companyID, userID, role, kind, { seal, plate, recordedAt, clientRequestId });
  },
);

interface ContainerStuffedRequest extends OfflineFields {
  id: string;
  movementId: string;
  /** true: stuffed; false: back out (only until the close). */
  stuffed: boolean;
}

export const warehouseContainerSetStuffed = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/positions/:movementId/stuffed" },
  async ({ id, movementId, stuffed, recordedAt, clientRequestId }: ContainerStuffedRequest): Promise<ContainerActionResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID } = getAuthData()!;
    return containerService.setStuffed(id, companyID, userID, movementId, !!stuffed, { recordedAt, clientRequestId });
  },
);

interface ContainerTallyRequest extends OfflineFields {
  id: string;
  movementId: string;
  tally: ContainerTallyInput;
}

interface ContainerTallyResponse extends ContainerActionResponse {
  /** The count differs from the expected pieces: the OS&D exception the client may offer (POST /warehouse-gate/:id/exceptions, source "tally"). */
  suggestException: { type: "Short" | "Over"; pieces: number } | null;
}

// Tallies one house at stripping. "received" ticks it off: the house is received (its free time
// starts) and its shipment gets the received date and the WCZ reference. LCL cargo is re-weighed
// first. Short / not arrived need a reason.
export const warehouseContainerTally = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/positions/:movementId/tally" },
  async ({ id, movementId, tally, recordedAt, clientRequestId }: ContainerTallyRequest): Promise<ContainerTallyResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = getAuthData()!;
    return containerService.tally(id, companyID, userID, role, movementId, tally, { recordedAt, clientRequestId });
  },
);

// Manager: voids the tally of a house with a reason. A tick-off is undone (the shipment is not
// changed back; logged).
export const warehouseContainerVoidTally = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/positions/:movementId/void-tally" },
  async ({ id, movementId, reason }: { id: string; movementId: string; reason: string }): Promise<ContainerVoidResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return containerService.voidTally(id, companyID, userID, role, movementId, reason);
  },
);

// Manager: voids a container stamp with a reason, later steps first. Voiding the export gate-out
// brings the positions that left with it back into the warehouse.
export const warehouseContainerVoidStamp = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-containers/:id/void-stamp" },
  async ({ id, kind, reason }: { id: string; kind: ContainerStampKind; reason: string }): Promise<ContainerVoidResponse> => {
    await requireModule("warehouse_concept");
    const { companyID, userID, role } = requireRole("superadmin", "admin", "manager");
    return containerService.voidStamp(id, companyID, userID, role, kind, reason);
  },
);
