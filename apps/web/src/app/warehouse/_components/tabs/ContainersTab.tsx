"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useGateLog } from "@/hooks/useGateLog";
import { useWarehouseContainers, type WarehouseContainer } from "@/hooks/useWarehouseRecords";
import { formatDate } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { CONTAINER_TYPES, PACKINGS } from "@/app/warehouse/gate-log/_lib/gate";
import { BulkDeleteButton, RecordFormModal, StatusTag, dim, nf, type FieldDef } from "./shared";

type Mode = "register" | "schedule" | "vgm";

const DIRECTIONS = ["Unloading", "Loading"];
const SCHEDULE_STATUSES = ["Scheduled", "Arrived", "Devanning", "Devanned", "Empty returned"];
const VGM_METHODS = ["Method 1 — weighed", "Method 2 — calculated"];
const VGM_STATUSES = ["Draft", "Submitted"];

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

export function ContainersTab() {
  const router = useRouter();
  const { items, isLoading, create, update, remove, isSaving } = useWarehouseContainers();
  const { movements } = useGateLog();
  const [editing, setEditing] = useState<{ mode: Mode; container?: WarehouseContainer } | null>(
    null,
  );

  const positionOptions = useMemo(
    () =>
      movements
        .filter((m) => m.warehouseTaskId)
        .map((m) => ({
          value: m.id,
          label: m.customer
            ? `${m.positionRef || m.gateRef} — ${m.customer}`
            : m.positionRef || m.gateRef,
        })),
    [movements],
  );

  const position = (c: WarehouseContainer) =>
    c.positionRef && c.warehouseTaskId ? (
      <span
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/warehouse/${c.warehouseTaskId}`);
        }}
        className="font-mono font-bold text-indigo-500 hover:underline cursor-pointer"
      >
        {c.positionRef}
      </span>
    ) : (
      dim("")
    );
  const containerNo = (c: WarehouseContainer) => (
    <span className="font-mono font-bold text-indigo-500">{c.number}</span>
  );

  // ---- Container register ----
  const registerColumns: AppGridColumn<WarehouseContainer>[] = [
    {
      key: "number",
      title: "Container",
      width: 160,
      text: (c) => c.number,
      render: (_, c) => containerNo(c),
    },
    {
      key: "equipment",
      title: "Equipment",
      width: 110,
      text: (c) => c.equipment,
      filterOptions: CONTAINER_TYPES,
      render: (_, c) => dim(c.equipment),
    },
    { key: "seal", title: "Seal", width: 130, text: (c) => c.seal, render: (_, c) => dim(c.seal) },
    {
      key: "position",
      title: "Position",
      width: 160,
      text: (c) => c.positionRef,
      render: (_, c) => position(c),
    },
    {
      key: "customer",
      title: "Customer",
      width: 180,
      text: (c) => c.customer,
      render: (_, c) => dim(c.customer),
    },
    {
      key: "handling",
      title: "Handling",
      width: 110,
      text: (c) => c.handling,
      filterOptions: ["Import", "Export"],
      render: (_, c) => dim(c.handling),
    },
    {
      key: "pieces",
      title: "Pieces",
      width: 90,
      align: "right",
      text: (c) => String(c.pieces ?? ""),
      render: (_, c) => dim(c.pieces),
    },
    {
      key: "packages",
      title: "Packages",
      width: 140,
      text: (c) => c.packages,
      render: (_, c) => dim(c.packages),
    },
    {
      key: "weightKg",
      title: "Weight kg",
      width: 110,
      align: "right",
      text: (c) => String(c.weightKg ?? ""),
      render: (_, c) => dim(nf(c.weightKg)),
    },
    {
      key: "cbm",
      title: "Cbm",
      width: 90,
      align: "right",
      text: (c) => String(c.cbm ?? ""),
      render: (_, c) => dim(nf(c.cbm, 2)),
    },
    {
      key: "direction",
      title: "Loading / unloading",
      width: 150,
      text: (c) => c.direction,
      filterOptions: DIRECTIONS,
      render: (_, c) => (
        <StatusTag value={c.direction} colors={{ Loading: "purple", Unloading: "blue" }} />
      ),
    },
    {
      key: "vgm",
      title: "VGM",
      width: 110,
      align: "right",
      text: (c) => String(c.vgmKg ?? ""),
      render: (_, c) => dim(c.vgmKg != null ? `${nf(c.vgmKg)} kg` : ""),
    },
    {
      key: "vgmDate",
      title: "VGM date",
      width: 110,
      text: (c) => c.vgmDeclaredAt.slice(0, 10),
      render: (_, c) => dim(formatDate(c.vgmDeclaredAt)),
    },
    { key: "note", title: "Note", width: 220, text: (c) => c.note, render: (_, c) => dim(c.note) },
  ];

  // ---- form ----
  const registerFields: FieldDef[] = [
    { name: "number", label: "Container number", required: true, placeholder: "MSCU 611 902-7" },
    { name: "movementId", label: "Position", type: "select", options: positionOptions },
    { name: "equipment", label: "Equipment", type: "select", options: CONTAINER_TYPES },
    { name: "seal", label: "Seal number" },
    { name: "pieces", label: "Pieces", type: "number" },
    { name: "packages", label: "Packages", type: "select", options: PACKINGS },
    { name: "weightKg", label: "Weight (kg)", type: "number" },
    { name: "cbm", label: "Cbm", type: "number", step: 0.01 },
    {
      name: "direction",
      label: "Loading / unloading",
      type: "select",
      options: DIRECTIONS,
      required: true,
    },
    { name: "note", label: "Note", type: "textarea" },
  ];
  const scheduleFields: FieldDef[] = [
    { name: "masterJob", label: "Master job", section: "Unloading / loading schedule" },
    { name: "carrier", label: "Carrier" },
    { name: "dischargePort", label: "Discharge port" },
    { name: "arrivedAt", label: "Arrived at WH", type: "datetime" },
    { name: "houses", label: "Houses", type: "number" },
    { name: "dockSlot", label: "Dock slot", placeholder: "Dock 4 · 09:00" },
    { name: "detentionExpiry", label: "Detention expiry", type: "date" },
    { name: "scheduleStatus", label: "Status", type: "select", options: SCHEDULE_STATUSES },
  ];
  const vgmFields: FieldDef[] = [
    { name: "tareKg", label: "Tare (kg)", type: "number", section: "VGM" },
    { name: "cargoKg", label: "Cargo gross (kg)", type: "number" },
    { name: "vgmMethod", label: "VGM method", type: "select", options: VGM_METHODS },
    { name: "vgmDeclaredBy", label: "Declared by" },
    { name: "vgmDeclaredAt", label: "Declared at", type: "datetime" },
    { name: "vgmStatus", label: "Status", type: "select", options: VGM_STATUSES },
  ];
  const identity = (c?: WarehouseContainer): FieldDef[] =>
    c
      ? []
      : [
          {
            name: "number",
            label: "Container number",
            required: true,
            placeholder: "MSCU 611 902-7",
          },
          { name: "movementId", label: "Position", type: "select", options: positionOptions },
        ];
  const fieldsFor = (mode: Mode, c?: WarehouseContainer): FieldDef[] =>
    mode === "register"
      ? [...registerFields, ...scheduleFields]
      : mode === "schedule"
        ? [...identity(c), ...scheduleFields]
        : [...identity(c), ...vgmFields];

  const openEdit = (mode: Mode) => (c: WarehouseContainer) => setEditing({ mode, container: c });
  const bulkDelete = (selected: WarehouseContainer[], clear: () => void) => (
    <BulkDeleteButton rows={selected} clear={clear} nouns={["container", "containers"]} label={(c) => c.number} remove={(c) => remove(c.id)} />
  );

  return (
    <div className="flex flex-col gap-5">
      <AppGrid<WarehouseContainer>
        searchPlaceholder="Search container, seal, position, customer…"
        actions={
          <button className={btnPrimary} onClick={() => setEditing({ mode: "register" })}>
            <PlusOutlined /> Container
          </button>
        }
        columns={registerColumns}
        rows={items}
        rowKey={(c) => c.id}
        loading={isLoading}
        onRowClick={openEdit("register")}
        bulkActions={bulkDelete}
        storageKey="warehouse:containers"
        exportFilePrefix="container-register"
        emptyText="No containers recorded yet."
      />

      {editing && (
        <RecordFormModal<interfaces.WarehouseContainerInput>
          open
          title={
            editing.container
              ? `Container ${editing.container.number}`
              : editing.mode === "vgm"
                ? "VGM declaration"
                : "New container"
          }
          fields={fieldsFor(editing.mode, editing.container)}
          initial={
            editing.container ?? {
              direction: "Unloading",
              scheduleStatus: "Scheduled",
              ...(editing.mode === "vgm" ? { vgmStatus: "Draft", direction: "Loading" } : {}),
            }
          }
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => {
            // A cleared position select means "no position".
            const input =
              "movementId" in values
                ? { ...values, movementId: values.movementId || null }
                : values;
            return editing.container
              ? update(editing.container.id, input)
              : create({ direction: "Unloading", ...input });
          }}
          onDelete={editing.container ? () => remove(editing.container!.id) : undefined}
          okText={editing.container ? "Save" : "Create"}
        />
      )}
    </div>
  );
}
