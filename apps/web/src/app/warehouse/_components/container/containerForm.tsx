"use client";

import { useMemo } from "react";
import { useGateLog } from "@/hooks/useGateLog";
import type { WarehouseContainer } from "@/hooks/useWarehouseRecords";
import type { interfaces } from "@/lib/api/client";
import { CONTAINER_TYPES, PACKINGS } from "@/app/warehouse/gate-log/_lib/gate";
import { TERMS } from "@/app/warehouse/_lib/glossary";
import { addBlocked } from "@/app/warehouse/_lib/containerPlan";
import { RecordFormModal, type FieldDef } from "../tabs/shared";

// The container's record form (Containers tab and the container page): register / details, the
// unloading / loading schedule and the container VGM (tare + cargo). The houses are managed on the
// container page (stuffing plan / stripping tally); a new container may take its first house here.

export type ContainerFormMode = "register" | "schedule" | "vgm";

export const CONTAINER_DIRECTIONS = [
  { value: "Unloading", label: "Unloading — import, stripped" },
  { value: "Loading", label: "Loading — export, stuffed" },
];
const SCHEDULE_STATUSES = ["Scheduled", "Arrived", "Devanning", "Devanned", "Empty returned"];
const VGM_METHODS = ["Method 1 — weighed", "Method 2 — calculated"];
const VGM_STATUSES = ["Draft", "Submitted"];

export function ContainerFormModal({
  mode,
  container,
  saving,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: ContainerFormMode;
  container?: WarehouseContainer;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: interfaces.WarehouseContainerInput) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
}) {
  const { movements } = useGateLog();

  // A new container's first house: positions that may go into it (either direction; the server
  // takes the container's direction from the position when none is chosen).
  const positionOptions = useMemo(
    () =>
      movements
        .filter((m) => m.warehouseTaskId && (addBlocked(m, "Loading") === null || addBlocked(m, "Unloading") === null))
        .map((m) => ({
          value: m.id,
          label: `${m.positionRef || m.gateRef}${m.customer ? ` — ${m.customer}` : ""} · ${m.visit === "výdej" ? TERMS.outbound : TERMS.inbound}`,
        })),
    [movements],
  );

  const stamped = !!container?.gateInAt;
  const identity: FieldDef[] = [
    { name: "number", label: "Container number", required: true, placeholder: "MSCU 611 902-7" },
    ...(container ? [] : [{ name: "movementId", label: "First house (position)", type: "select" as const, options: positionOptions }]),
  ];
  const registerFields: FieldDef[] = [
    ...identity,
    { name: "direction", label: "Loading / unloading", type: "select", options: CONTAINER_DIRECTIONS, required: true },
    { name: "equipment", label: "Equipment", type: "select", options: CONTAINER_TYPES },
    { name: "seal", label: "Seal number" },
    { name: "bookingNumber", label: "Booking number", section: "Sailing" },
    { name: "mblNumber", label: "MBL number" },
    { name: "vessel", label: "Vessel" },
    { name: "voyage", label: "Voyage" },
    { name: "plate", label: `Truck ${TERMS.plate.toLowerCase()} (takes the container away)` },
    { name: "pieces", label: TERMS.pieces, type: "number", section: "Container figures (FCL)" },
    { name: "packages", label: "Packages", type: "select", options: PACKINGS },
    { name: "weightKg", label: TERMS.weightKg, type: "number" },
    { name: "cbm", label: TERMS.volumeCbm, type: "number", step: 0.01 },
    { name: "note", label: "Note", type: "textarea" },
  ];
  const scheduleFields: FieldDef[] = [
    { name: "masterJob", label: "Master job", section: "Unloading / loading schedule" },
    { name: "carrier", label: "Carrier" },
    { name: "dischargePort", label: "Discharge port" },
    { name: "arrivedAt", label: "Arrived at WH", type: "datetime" },
    { name: "houses", label: "Houses expected", type: "number" },
    { name: "dockSlot", label: "Dock slot", placeholder: "Dock 4 · 09:00" },
    { name: "detentionExpiry", label: "Detention expiry", type: "date" },
    { name: "scheduleStatus", label: "Status", type: "select", options: SCHEDULE_STATUSES },
  ];
  const vgmFields: FieldDef[] = [
    { name: "tareKg", label: "Tare (kg)", type: "number", section: "Container VGM" },
    { name: "cargoKg", label: `Cargo ${TERMS.weightKg.toLowerCase()}`, type: "number" },
    { name: "vgmMethod", label: "VGM method", type: "select", options: VGM_METHODS },
    { name: "vgmDeclaredBy", label: "Declared by" },
    { name: "vgmDeclaredAt", label: "Declared at", type: "datetime" },
    { name: "vgmStatus", label: "Status", type: "select", options: VGM_STATUSES },
  ];
  const fields =
    mode === "register" ? (container ? registerFields : [...registerFields, ...scheduleFields]) : mode === "schedule" ? scheduleFields : vgmFields;

  return (
    <RecordFormModal<interfaces.WarehouseContainerInput>
      open
      title={container ? `Container ${container.number}` : mode === "vgm" ? "Container VGM" : "New container"}
      note={
        container
          ? stamped && mode === "register"
            ? "The yard dates follow the container's stamps. A plate entered after the gate-out of an export container is sent to the shipments of its houses."
            : undefined
          : "Houses are added on the container page: the stuffing plan of an export container, the stripping tally of an import one."
      }
      fields={fields}
      initial={container ?? { direction: "Unloading", scheduleStatus: "Scheduled", ...(mode === "vgm" ? { vgmStatus: "Draft", direction: "Loading" } : {}) }}
      saving={saving}
      onCancel={onClose}
      onSubmit={(values) => {
        // A cleared first house means "no house yet".
        const input = "movementId" in values ? { ...values, movementId: values.movementId || null } : values;
        return onSubmit(input);
      }}
      onDelete={onDelete}
      // The first house sets the direction: outbound cargo is stripped from an import container,
      // inbound cargo stuffed into an export one.
      onValuesChange={(changed, set) => {
        const m = changed.movementId ? movements.find((x) => x.id === changed.movementId) : undefined;
        if (m) set({ direction: m.visit === "výdej" ? "Unloading" : "Loading" });
      }}
      okText={container ? "Save" : "Create"}
    />
  );
}
