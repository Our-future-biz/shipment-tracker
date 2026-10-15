"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { useTrips, type TripListItem, type TripStatus } from "@/hooks/useTruckingConsignments";
import { formatDate, formatDateTime } from "@/lib/date";
import { TRIP_STATUS_CHIP, tripHref } from "../_lib/consignments";
import { HAULIER_STATUS_CHIP } from "../_lib/hauliers";
import { formatMoney } from "../_lib/tariffs";
import { HaulierStatusChip } from "./HaulierStatusChip";
import { TruckingStatusChip } from "./TruckingStatusChip";

const STATUSES = Object.keys(TRIP_STATUS_CHIP) as TripStatus[];
const byText = (a: string, b: string) => a.localeCompare(b, "cs");
const dash = <span className="text-slate-400">—</span>;

const orderText = (t: TripListItem) => {
  const o = t.transportOrder;
  if (!o?.sentAt) return "";
  return `${formatDateTime(o.sentAt)}${o.recordedOnly ? " (recorded only)" : ""}`;
};

const buildColumns = (vehicleLabel: (code: string | null) => string): AppGridColumn<TripListItem>[] => [
  {
    key: "ref",
    title: "Trip",
    text: (t) => t.ref,
    sorter: (a, b) => byText(a.ref, b.ref),
    render: (_, t) => (
      <Link href={tripHref(t.id)} onClick={(e) => e.stopPropagation()} className="font-mono font-semibold text-indigo-600 hover:underline">
        {t.ref}
      </Link>
    ),
  },
  {
    key: "status",
    title: "Status",
    text: (t) => TRIP_STATUS_CHIP[t.status].label,
    filterOptions: STATUSES.map((s) => TRIP_STATUS_CHIP[s].label),
    sorter: (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
    render: (_, t) => <TruckingStatusChip chip={TRIP_STATUS_CHIP[t.status]} />,
  },
  { key: "consignments", title: "Consignments", text: (t) => t.consignmentRefs.join(", "), render: (_, t) => <span className="font-mono">{t.consignmentRefs.join(", ")}</span> },
  { key: "haulier", title: "Haulier", text: (t) => t.haulierName, sorter: (a, b) => byText(a.haulierName, b.haulierName) },
  {
    key: "haulierStatus",
    title: "Haulier status",
    text: (t) => HAULIER_STATUS_CHIP[t.haulierStatus].label,
    filterOptions: Object.values(HAULIER_STATUS_CHIP).map((c) => c.label),
    render: (_, t) => <HaulierStatusChip status={t.haulierStatus} />,
  },
  { key: "pickup", title: "Planned pick-up", text: (t) => formatDate(t.plannedPickupDate), sorter: (a, b) => byText(a.plannedPickupDate, b.plannedPickupDate) },
  { key: "vehicle", title: "Vehicle", text: (t) => vehicleLabel(t.vehicleTypeCode) },
  { key: "tractor", title: "Tractor plate", text: (t) => t.tractorPlate, render: (_, t) => (t.tractorPlate ? <span className="font-mono">{t.tractorPlate}</span> : dash) },
  { key: "trailer", title: "Trailer plate", text: (t) => t.trailerPlate, defaultVisible: false },
  { key: "driver", title: "Driver", text: (t) => [t.driverName, t.driverPhone].filter(Boolean).join(" · ") },
  { key: "buy", title: "Buy", text: (t) => (t.buy ? formatMoney(t.buy.total, t.buy.currency) : ""), sorter: (a, b) => (a.buy?.totalCzk ?? 0) - (b.buy?.totalCzk ?? 0) },
  { key: "order", title: "Order sent", text: orderText, render: (_, t) => orderText(t) || dash },
  {
    key: "confirmed",
    title: "Confirmed",
    text: (t) => formatDateTime(t.transportOrder?.confirmedAt),
    render: (_, t) => (t.transportOrder?.confirmedAt ? formatDateTime(t.transportOrder.confirmedAt) : t.transportOrder?.rejectedAt ? <span className="text-red-600">Rejected</span> : dash),
  },
];

// The trips we ordered from hauliers (Phase 4: one FTL consignment each); a row opens the trip page.
export const TruckingTripsTab = () => {
  const router = useRouter();
  const { trips, isLoading, isError } = useTrips();
  const { settings } = useTruckingSettings();
  const columns = useMemo(() => {
    const labels = new Map(settings?.vehicleTypes.map((v) => [v.code, v.label]) ?? []);
    return buildColumns((code) => (code ? (labels.get(code) ?? code) : ""));
  }, [settings]);

  return (
    <AppGrid<TripListItem>
      searchPlaceholder="Search trip, consignment, haulier, plate, driver…"
      columns={columns}
      rows={trips}
      rowKey={(t) => t.id}
      loading={isLoading}
      onRowClick={(t) => router.push(tripHref(t.id))}
      storageKey="trucking:trips:v1"
      exportFilePrefix="trips"
      emptyText={isError ? "The trips could not be loaded." : "No trips yet. A trip is made when a consignment is planned (Consignments → a consignment → Plan trip)."}
    />
  );
};
