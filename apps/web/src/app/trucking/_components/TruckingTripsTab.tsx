"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Tooltip } from "antd";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppGrid, type AppGridColumn } from "@/components/AppGrid";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { useTrips, type TripListItem, type TripStatus } from "@/hooks/useTruckingConsignments";
import { useAvizacePending } from "@/hooks/useTruckingControl";
import { avizaceWarning } from "../_lib/avizace";
import { businessDateTime, businessToday, formatDate } from "@/lib/date";
import { TRIP_STATUS_CHIP, tripHref } from "../_lib/consignments";
import { HAULIER_STATUS_CHIP } from "../_lib/hauliers";
import { TRIP_KIND_LABEL, tripFillPercent, vehicleCapacity, warningSummary } from "../_lib/planning";
import { formatMoney } from "../_lib/tariffs";
import { HaulierStatusChip } from "./HaulierStatusChip";
import { TripFillBars } from "./TripFillBars";
import { TruckingStatusChip } from "./TruckingStatusChip";
import { TripTiles } from "./TripTiles";
import { inTripView, tripViewCounts, tripViewOf, type TripView } from "../_lib/trips";
import { RECORDED_AS_SENT } from "../_lib/transportOrder";
import { byText, dash } from "../_lib/format";

const STATUSES = Object.keys(TRIP_STATUS_CHIP) as TripStatus[];

const tripsEmptyText = (isError: boolean, filtered: boolean) => {
  if (isError) return "The trips could not be loaded.";
  if (filtered) return "No trips in this queue.";
  return "No trips yet. An FTL trip is made from its consignment (Plan trip), LTL trips on the Planning tab.";
};

const orderText = (t: TripListItem) => businessDateTime(t.transportOrder?.sentAt);

type Capacity = Parameters<typeof TripFillBars>[0]["capacity"];
const KIND_LABELS = Object.values(TRIP_KIND_LABEL);

/** The server's warnings and, for a trip delivering to consignees, the avizace still missing. */
const warningsOf = (t: TripListItem, pending: ReadonlyMap<string, string>) => {
  const avizace = avizaceWarning(t, pending);
  return avizace ? [...t.warnings, avizace] : t.warnings;
};

const buildColumns = (
  vehicleLabel: (code: string | null) => string,
  capacityOf: (code: string | null) => Capacity,
  pending: ReadonlyMap<string, string>,
): AppGridColumn<TripListItem>[] => [
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
  {
    key: "kind",
    title: "Kind",
    text: (t) => TRIP_KIND_LABEL[t.kind],
    filterOptions: KIND_LABELS,
    sorter: (a, b) => KIND_LABELS.indexOf(TRIP_KIND_LABEL[a.kind]) - KIND_LABELS.indexOf(TRIP_KIND_LABEL[b.kind]),
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
  {
    key: "fill",
    title: "Fill",
    text: (t) => (tripFillPercent(t.fill) == null ? "" : `${tripFillPercent(t.fill)} %`),
    sorter: (a, b) => (tripFillPercent(a.fill) ?? -1) - (tripFillPercent(b.fill) ?? -1),
    render: (_, t) => <TripFillBars fill={t.fill} capacity={capacityOf(t.vehicleTypeCode)} compact />,
  },
  {
    key: "warnings",
    title: "Warnings",
    text: (t) => warningsOf(t, pending).join("; "),
    render: (_, t) => {
      const warnings = warningsOf(t, pending);
      const summary = warningSummary(warnings);
      return summary ? (
        <Tooltip title={warnings.length > 1 ? warnings.join(" · ") : undefined}>
          <span className="text-[12.5px] text-amber-700">{summary}</span>
        </Tooltip>
      ) : (
        dash
      );
    },
  },
  { key: "trailer", title: "Trailer plate", text: (t) => t.trailerPlate, defaultVisible: false },
  { key: "driver", title: "Driver", text: (t) => [t.driverName, t.driverPhone].filter(Boolean).join(" · ") },
  { key: "buy", title: "Buy", text: (t) => (t.buy ? formatMoney(t.buy.total, t.buy.currency) : ""), sorter: (a, b) => (a.buy?.totalCzk ?? 0) - (b.buy?.totalCzk ?? 0) },
  { key: "order", title: RECORDED_AS_SENT, text: orderText, render: (_, t) => orderText(t) || dash },
  {
    key: "confirmed",
    title: "Confirmed",
    text: (t) => businessDateTime(t.transportOrder?.confirmedAt),
    render: (_, t) => (t.transportOrder?.confirmedAt ? businessDateTime(t.transportOrder.confirmedAt) : t.transportOrder?.rejectedAt ? <span className="text-red-600">Rejected</span> : dash),
  },
];

// The trips we ordered from hauliers — FTL (one consignment) and the LTL pick-up runs, line hauls
// and delivery runs (many legs) — with their fill and warnings; a row opens the trip page.
export const TruckingTripsTab = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { trips, isLoading, isError } = useTrips();
  // Work queues (?view=), filtered here: the list carries status, pick-up day and the order.
  const view = tripViewOf(searchParams.get("view"));
  const today = businessToday();
  const counts = isLoading ? null : tripViewCounts(trips, today);
  const rows = useMemo(() => (view ? trips.filter((t) => inTripView(t, view, today)) : trips), [trips, view, today]);
  const handleView = (next: TripView | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("view", next);
    else params.delete("view");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const { settings } = useTruckingSettings();
  const pending = useAvizacePending();
  const columns = useMemo(() => {
    const types = settings?.vehicleTypes ?? [];
    const labels = new Map(types.map((v) => [v.code, v.label]));
    return buildColumns(
      (code) => (code ? (labels.get(code) ?? code) : ""),
      (code) => vehicleCapacity(types, code),
      pending,
    );
  }, [settings, pending]);

  return (
    <AppGrid<TripListItem>
      subHeader={<TripTiles active={view} counts={counts} onSelect={handleView} />}
      searchPlaceholder="Search trip, consignment, haulier, plate, driver…"
      columns={columns}
      rows={rows}
      rowKey={(t) => t.id}
      loading={isLoading}
      onRowClick={(t) => router.push(tripHref(t.id))}
      storageKey="trucking:trips:v1"
      exportFilePrefix="trips"
      emptyText={tripsEmptyText(isError, !!view)}
      resetKey={view ?? ""}
    />
  );
};
