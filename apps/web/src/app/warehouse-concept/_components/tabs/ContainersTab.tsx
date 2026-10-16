"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusOutlined } from "@ant-design/icons";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useWarehouseContainers, type WarehouseContainer } from "@/hooks/useWarehouseRecords";
import { formatDate, formatDateTime } from "@/lib/date";
import { Badge, CONTAINER_TYPES } from "@/app/warehouse-concept/gate-log/_lib/gate";
import { TERMS } from "@/app/warehouse-concept/_lib/glossary";
import { CONTAINER_STATUSES, CONTAINER_STATUS_TONE, KIND_LABEL, containerKind, fillPct } from "@/app/warehouse-concept/_lib/containerPlan";
import { ContainerFormModal, type ContainerFormMode } from "../container/containerForm";
import { FillBar } from "../container/FillBar";
import { BulkDeleteButton, dim, nf } from "./shared";

// Containers: one container, many positions (houses). An import container (Unloading) is stripped
// and its houses tallied; an export container (Loading) is stuffed from a plan of inbound
// positions. The list shows each container with its houses' totals against its capacity; a row
// opens the container page (houses, stamps, log).

const btnPrimary =
  "flex items-center gap-1.5 shrink-0 rounded-lg bg-indigo-600 px-3 h-8 text-[13px] font-semibold text-white hover:bg-indigo-700 transition-colors";

/** The yard date of a stamp, or the typed date from before the stamps. */
const yardDate = (at: string | null, typed: string) => (at ? formatDateTime(at) : formatDate(typed));

export const containerHref = (id: string) => `/warehouse-concept/containers/${id}`;

export function ContainersTab() {
  const router = useRouter();
  const { items, isLoading, create, remove, isSaving } = useWarehouseContainers();
  const [creating, setCreating] = useState<ContainerFormMode | null>(null);

  const columns: AppGridColumn<WarehouseContainer>[] = [
    {
      key: "number",
      title: "Container",
      width: 160,
      text: (c) => c.number,
      sorter: (a, b) => a.number.localeCompare(b.number),
      render: (_, c) => <span className="font-mono font-bold text-indigo-500">{c.number}</span>,
    },
    {
      key: "kind",
      title: "Kind",
      width: 140,
      text: (c) => KIND_LABEL[containerKind(c.direction)],
      filterOptions: Object.values(KIND_LABEL),
      render: (_, c) => <Badge tone={containerKind(c.direction) === "export" ? "i" : "b"}>{KIND_LABEL[containerKind(c.direction)]}</Badge>,
    },
    {
      key: "status",
      title: "Status",
      width: 110,
      text: (c) => c.status,
      filterOptions: [...CONTAINER_STATUSES],
      render: (_, c) => <Badge tone={CONTAINER_STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>,
    },
    { key: "equipment", title: "Equipment", width: 100, text: (c) => c.equipment, filterOptions: CONTAINER_TYPES, render: (_, c) => dim(c.equipment) },
    {
      key: "houses",
      title: "Houses",
      width: 90,
      align: "right",
      text: (c) => String(c.positions.length),
      sorter: (a, b) => a.positions.length - b.positions.length,
      render: (_, c) => (c.positions.length ? <span className="tabular-nums font-semibold text-slate-800">{c.positions.length}</span> : dim("")),
    },
    {
      key: "housesList",
      title: "Positions",
      width: 220,
      text: (c) => c.positions.map((h) => h.positionRef || h.gateRef).join(", "),
      render: (_, c) => dim(c.positions.map((h) => h.positionRef || h.gateRef).join(", ")),
    },
    {
      key: "pieces",
      title: TERMS.pieces,
      width: 80,
      align: "right",
      text: (c) => String(c.totals.pieces || ""),
      sorter: (a, b) => a.totals.pieces - b.totals.pieces,
      render: (_, c) => dim(c.totals.pieces ? nf(c.totals.pieces) : ""),
    },
    {
      key: "kg",
      title: TERMS.weightKg,
      width: 100,
      align: "right",
      text: (c) => String(c.totals.kg || ""),
      sorter: (a, b) => a.totals.kg - b.totals.kg,
      render: (_, c) => dim(c.totals.kg ? nf(c.totals.kg) : ""),
    },
    {
      key: "cbm",
      title: TERMS.volumeCbm,
      width: 90,
      align: "right",
      text: (c) => String(c.totals.cbm || ""),
      sorter: (a, b) => a.totals.cbm - b.totals.cbm,
      render: (_, c) => dim(c.totals.cbm ? nf(c.totals.cbm, 2) : ""),
    },
    {
      key: "fill",
      title: "Fill",
      width: 130,
      text: (c) => (fillPct(c.totals) == null ? "" : `${fillPct(c.totals)} %`),
      sorter: (a, b) => (fillPct(a.totals) ?? -1) - (fillPct(b.totals) ?? -1),
      render: (_, c) => <FillBar totals={c.totals} compact />,
    },
    { key: "seal", title: "Seal", width: 120, text: (c) => c.seal, render: (_, c) => dim(c.seal) },
    {
      key: "gateIn",
      title: TERMS.containerGateIn,
      width: 140,
      text: (c) => c.gateInAt ?? c.gatedIn,
      sorter: (a, b) => (a.gateInAt ?? a.gatedIn ?? "").localeCompare(b.gateInAt ?? b.gatedIn ?? ""),
      render: (_, c) => dim(yardDate(c.gateInAt, c.gatedIn)),
    },
    {
      key: "gateOut",
      title: TERMS.containerGateOut,
      width: 140,
      text: (c) => c.gateOutAt ?? c.gatedOut,
      sorter: (a, b) => (a.gateOutAt ?? a.gatedOut ?? "").localeCompare(b.gateOutAt ?? b.gatedOut ?? ""),
      render: (_, c) => dim(yardDate(c.gateOutAt, c.gatedOut)),
    },
    {
      key: "vessel",
      title: "Vessel / voyage",
      width: 160,
      text: (c) => [c.vessel, c.voyage].filter(Boolean).join(" / "),
      render: (_, c) => dim([c.vessel, c.voyage].filter(Boolean).join(" / ")),
    },
    {
      key: "booking",
      title: "Booking / MBL",
      width: 160,
      text: (c) => [c.bookingNumber, c.mblNumber].filter(Boolean).join(" / "),
      render: (_, c) => dim([c.bookingNumber, c.mblNumber].filter(Boolean).join(" / ")),
    },
    {
      key: "updatesWaiting",
      title: "Shipment updates waiting",
      width: 120,
      align: "right",
      defaultVisible: false,
      text: (c) => String(c.shipmentUpdatesWaiting || ""),
      render: (_, c) => (c.shipmentUpdatesWaiting ? <Badge tone="a">{c.shipmentUpdatesWaiting}</Badge> : dim("")),
    },
    { key: "carrier", title: "Carrier", width: 130, defaultVisible: false, text: (c) => c.carrier, render: (_, c) => dim(c.carrier) },
    {
      key: "vgm",
      title: "Container VGM",
      width: 120,
      align: "right",
      defaultVisible: false,
      text: (c) => String(c.vgmKg ?? ""),
      render: (_, c) => dim(c.vgmKg != null ? `${nf(c.vgmKg)} kg` : ""),
    },
    { key: "plate", title: TERMS.plate, width: 110, defaultVisible: false, text: (c) => c.plate, render: (_, c) => dim(c.plate) },
    { key: "note", title: "Note", width: 220, defaultVisible: false, text: (c) => c.note, render: (_, c) => dim(c.note) },
  ];

  const bulkDelete = (selected: WarehouseContainer[], clear: () => void) => (
    <BulkDeleteButton
      rows={selected}
      clear={clear}
      nouns={["container", "containers"]}
      label={(c) => c.number}
      warning="A container with stamps, stuffed or tallied houses is not deleted."
      remove={(c) => remove(c.id)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <AppGrid<WarehouseContainer>
        searchPlaceholder="Search container, seal, position, vessel, booking…"
        actions={
          <button className={btnPrimary} onClick={() => setCreating("register")}>
            <PlusOutlined /> Container
          </button>
        }
        columns={columns}
        rows={items}
        rowKey={(c) => c.id}
        loading={isLoading}
        onRowClick={(c) => router.push(containerHref(c.id))}
        bulkActions={bulkDelete}
        storageKey="warehouse:containers:v2"
        exportFilePrefix="containers"
        emptyText="No containers recorded yet."
      />

      {creating && (
        <ContainerFormModal
          mode={creating}
          saving={isSaving}
          onClose={() => setCreating(null)}
          onSubmit={async (input) => {
            const res = (await create(input)) as { container?: WarehouseContainer } | undefined;
            if (res?.container) router.push(containerHref(res.container.id));
          }}
        />
      )}
    </div>
  );
}
