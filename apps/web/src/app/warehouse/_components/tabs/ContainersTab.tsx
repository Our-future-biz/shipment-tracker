"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useGateLog } from "@/hooks/useGateLog";
import { useWarehouseContainers, type WarehouseContainer } from "@/hooks/useWarehouseRecords";
import { formatDateTime, formatDate } from "@/lib/date";
import type { interfaces } from "@/lib/api/client";
import { CONTAINER_TYPES, PACKINGS } from "@/app/warehouse/gate-log/_lib/gate";
import { Callout, ExpiryTag, RecordFormModal, StatusTag, SubTabs, dim, nf, type FieldDef } from "./shared";

type Sub = "register" | "schedule" | "vgm";
type Mode = "register" | "schedule" | "vgm";

const DIRECTIONS = ["Unloading", "Loading"];
const SCHEDULE_STATUSES = ["Scheduled", "Arrived", "Devanning", "Devanned", "Empty returned"];
const SCHEDULE_COLORS: Record<string, string> = { Scheduled: "default", Arrived: "blue", Devanning: "orange", Devanned: "green", "Empty returned": "default" };
const VGM_METHODS = ["Method 1 — weighed", "Method 2 — calculated"];
const VGM_STATUSES = ["Draft", "Submitted"];

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

export function ContainersTab() {
  const router = useRouter();
  const { items, isLoading, create, update, remove, isSaving } = useWarehouseContainers();
  const { movements } = useGateLog();
  const [sub, setSub] = useState<Sub>("register");
  const [editing, setEditing] = useState<{ mode: Mode; container?: WarehouseContainer } | null>(null);

  const positionOptions = useMemo(
    () =>
      movements
        .filter((m) => m.warehouseTaskId)
        .map((m) => ({ value: m.id, label: m.customer ? `${m.positionRef || m.gateRef} — ${m.customer}` : m.positionRef || m.gateRef })),
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
  const containerNo = (c: WarehouseContainer) => <span className="font-mono font-bold text-indigo-500">{c.number}</span>;

  // ---- Container register ----
  const registerColumns: AppGridColumn<WarehouseContainer>[] = [
    { key: "number", title: "Container", width: 160, text: (c) => c.number, render: (_, c) => containerNo(c) },
    { key: "equipment", title: "Equipment", width: 110, text: (c) => c.equipment, filterOptions: CONTAINER_TYPES, render: (_, c) => dim(c.equipment) },
    { key: "seal", title: "Seal", width: 130, text: (c) => c.seal, render: (_, c) => dim(c.seal) },
    { key: "position", title: "Position", width: 160, text: (c) => c.positionRef, render: (_, c) => position(c) },
    { key: "customer", title: "Customer", width: 180, text: (c) => c.customer, render: (_, c) => dim(c.customer) },
    { key: "handling", title: "Handling", width: 110, text: (c) => c.handling, filterOptions: ["Import", "Export"], render: (_, c) => dim(c.handling) },
    { key: "pieces", title: "Pieces", width: 90, align: "right", text: (c) => String(c.pieces ?? ""), render: (_, c) => dim(c.pieces) },
    { key: "packages", title: "Packages", width: 140, text: (c) => c.packages, render: (_, c) => dim(c.packages) },
    { key: "weightKg", title: "Weight kg", width: 110, align: "right", text: (c) => String(c.weightKg ?? ""), render: (_, c) => dim(nf(c.weightKg)) },
    { key: "cbm", title: "Cbm", width: 90, align: "right", text: (c) => String(c.cbm ?? ""), render: (_, c) => dim(nf(c.cbm, 2)) },
    {
      key: "direction",
      title: "Loading / unloading",
      width: 150,
      text: (c) => c.direction,
      filterOptions: DIRECTIONS,
      render: (_, c) => <StatusTag value={c.direction} colors={{ Loading: "purple", Unloading: "blue" }} />,
    },
    { key: "vgm", title: "VGM", width: 110, align: "right", text: (c) => String(c.vgmKg ?? ""), render: (_, c) => dim(c.vgmKg != null ? `${nf(c.vgmKg)} kg` : "") },
    { key: "vgmDate", title: "VGM date", width: 110, text: (c) => c.vgmDeclaredAt.slice(0, 10), render: (_, c) => dim(formatDate(c.vgmDeclaredAt)) },
    { key: "note", title: "Note", width: 220, text: (c) => c.note, render: (_, c) => dim(c.note) },
  ];

  // ---- Unloading / loading schedule ----
  const scheduleColumns: AppGridColumn<WarehouseContainer>[] = [
    { key: "number", title: "Container", width: 160, text: (c) => c.number, render: (_, c) => containerNo(c) },
    { key: "masterJob", title: "Master job", width: 140, text: (c) => c.masterJob, render: (_, c) => dim(c.masterJob) },
    { key: "carrier", title: "Carrier", width: 140, text: (c) => c.carrier, render: (_, c) => dim(c.carrier) },
    { key: "dischargePort", title: "Discharge port", width: 150, text: (c) => c.dischargePort, render: (_, c) => dim(c.dischargePort) },
    { key: "arrivedAt", title: "Arrived at WH", width: 150, text: (c) => c.arrivedAt, render: (_, c) => dim(formatDateTime(c.arrivedAt)) },
    { key: "houses", title: "Houses", width: 90, align: "right", text: (c) => String(c.houses ?? ""), render: (_, c) => dim(c.houses) },
    { key: "cbm", title: "CBM", width: 90, align: "right", text: (c) => String(c.cbm ?? ""), render: (_, c) => dim(nf(c.cbm, 1)) },
    { key: "detentionExpiry", title: "Detention expiry", width: 170, text: (c) => c.detentionExpiry, render: (_, c) => <ExpiryTag date={c.detentionExpiry} /> },
    { key: "dockSlot", title: "Dock slot", width: 150, text: (c) => c.dockSlot, render: (_, c) => dim(c.dockSlot) },
    {
      key: "scheduleStatus",
      title: "Status",
      width: 130,
      text: (c) => c.scheduleStatus,
      filterOptions: SCHEDULE_STATUSES,
      render: (_, c) => <StatusTag value={c.scheduleStatus} colors={SCHEDULE_COLORS} />,
    },
  ];

  // ---- VGM register ----
  const vgmRows = items.filter((c) => c.vgmStatus || c.tareKg != null || c.cargoKg != null);
  const vgmColumns: AppGridColumn<WarehouseContainer>[] = [
    { key: "number", title: "Container", width: 160, text: (c) => c.number, render: (_, c) => containerNo(c) },
    { key: "position", title: "Position", width: 160, text: (c) => c.positionRef, render: (_, c) => position(c) },
    { key: "equipment", title: "Equipment", width: 110, text: (c) => c.equipment, render: (_, c) => dim(c.equipment) },
    { key: "tareKg", title: "Tare kg", width: 100, align: "right", text: (c) => String(c.tareKg ?? ""), render: (_, c) => dim(nf(c.tareKg)) },
    { key: "cargoKg", title: "Cargo kg", width: 100, align: "right", text: (c) => String(c.cargoKg ?? ""), render: (_, c) => dim(nf(c.cargoKg)) },
    { key: "vgmKg", title: "VGM kg", width: 100, align: "right", text: (c) => String(c.vgmKg ?? ""), render: (_, c) => dim(nf(c.vgmKg)) },
    { key: "vgmMethod", title: "Method", width: 180, text: (c) => c.vgmMethod, filterOptions: VGM_METHODS, render: (_, c) => dim(c.vgmMethod) },
    { key: "vgmDeclaredBy", title: "Declared by", width: 140, text: (c) => c.vgmDeclaredBy, render: (_, c) => dim(c.vgmDeclaredBy) },
    { key: "vgmDeclaredAt", title: "Declared at", width: 150, text: (c) => c.vgmDeclaredAt, render: (_, c) => dim(formatDateTime(c.vgmDeclaredAt)) },
    {
      key: "vgmStatus",
      title: "Status",
      width: 120,
      text: (c) => c.vgmStatus,
      filterOptions: VGM_STATUSES,
      render: (_, c) => <StatusTag value={c.vgmStatus} colors={{ Submitted: "green", Draft: "orange" }} />,
    },
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
    { name: "direction", label: "Loading / unloading", type: "select", options: DIRECTIONS, required: true },
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
    c ? [] : [{ name: "number", label: "Container number", required: true, placeholder: "MSCU 611 902-7" }, { name: "movementId", label: "Position", type: "select", options: positionOptions }];
  const fieldsFor = (mode: Mode, c?: WarehouseContainer): FieldDef[] =>
    mode === "register" ? [...registerFields, ...scheduleFields] : mode === "schedule" ? [...identity(c), ...scheduleFields] : [...identity(c), ...vgmFields];

  const openEdit = (mode: Mode) => (c: WarehouseContainer) => setEditing({ mode, container: c });
  const bulkDelete = (selected: WarehouseContainer[], clear: () => void) => (
    <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Promise.all(selected.map((c) => remove(c.id))).then(clear)}>
      Delete
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <SubTabs
        tabs={[
          { key: "register", label: "Container Register" },
          { key: "schedule", label: "Unloading / Loading Schedule" },
          { key: "vgm", label: "VGM Register" },
        ]}
        active={sub}
        onChange={setSub}
      />

      {sub === "register" && (
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
      )}

      {sub === "schedule" && (
        <>
          <Callout title="Devanning & stuffing schedule.">The detention expiry is the equipment&rsquo;s last free day, not the cargo&rsquo;s.</Callout>
          <AppGrid<WarehouseContainer>
            searchPlaceholder="Search container, master job, carrier…"
            columns={scheduleColumns}
            rows={items}
            rowKey={(c) => c.id}
            loading={isLoading}
            onRowClick={openEdit("schedule")}
            storageKey="warehouse:container-schedule"
            exportFilePrefix="container-schedule"
            emptyText="No containers recorded yet."
          />
        </>
      )}

      {sub === "vgm" && (
        <>
          <Callout title="VGM.">
            Every export container needs a verified gross mass before the carrier cut-off. Method 2 is a calculation from our own recorded cargo
            weights plus the tare — which is only defensible because the weights come from the receipt, not from the shipper&rsquo;s declaration.
          </Callout>
          <AppGrid<WarehouseContainer>
            searchPlaceholder="Search container, position…"
            actions={
              <button className={btnPrimary} onClick={() => setEditing({ mode: "vgm" })}>
                <PlusOutlined /> VGM form
              </button>
            }
            columns={vgmColumns}
            rows={vgmRows}
            rowKey={(c) => c.id}
            loading={isLoading}
            onRowClick={openEdit("vgm")}
            storageKey="warehouse:vgm-register"
            exportFilePrefix="vgm-register"
            emptyText="No VGM declarations yet."
          />
        </>
      )}

      {editing && (
        <RecordFormModal<interfaces.WarehouseContainerInput>
          open
          title={editing.container ? `Container ${editing.container.number}` : editing.mode === "vgm" ? "VGM declaration" : "New container"}
          fields={fieldsFor(editing.mode, editing.container)}
          initial={editing.container ?? { direction: "Unloading", scheduleStatus: "Scheduled", ...(editing.mode === "vgm" ? { vgmStatus: "Draft", direction: "Loading" } : {}) }}
          saving={isSaving}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => {
            // A cleared position select means "no position".
            const input = "movementId" in values ? { ...values, movementId: values.movementId || null } : values;
            return editing.container ? update(editing.container.id, input) : create({ direction: "Unloading", ...input });
          }}
          onDelete={editing.container ? () => remove(editing.container!.id) : undefined}
          okText={editing.container ? "Save" : "Create"}
        />
      )}
    </div>
  );
}
