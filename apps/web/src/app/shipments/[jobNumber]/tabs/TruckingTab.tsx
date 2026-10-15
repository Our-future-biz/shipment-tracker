"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Spin } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useConsignment, useConsignments, useTrip, type ConsignmentListItem } from "@/hooks/useTruckingConsignments";
import { formatDate, formatDateTime } from "@/lib/date";
import { CONSIGNMENT_STATUS_CHIP, consignmentHref, stampOf, tripHref } from "@/app/trucking/_lib/consignments";
import { formatPsc } from "@/app/trucking/_lib/hauliers";
import { ConsignmentCreateModal } from "@/app/trucking/_components/ConsignmentCreateModal";
import { TruckingStatusChip } from "@/app/trucking/_components/TruckingStatusChip";

const Row = ({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) => (
  <div className="flex gap-2.5 border-b border-slate-100 py-1.5 text-xs last:border-b-0">
    <span className="w-[120px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <span className={`min-w-0 flex-1 font-medium ${value ? "text-slate-900" : "text-slate-300"} ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
  </div>
);

// One consignment of the job as a card: status, haulier, truck and driver, dates and the POD.
const ConsignmentJobCard = ({ item }: { item: ConsignmentListItem }) => {
  const { consignment } = useConsignment(item.id);
  const { trip } = useTrip(item.tripId);
  const delivered = consignment ? stampOf(consignment.stamps, "delivered") : null;
  const pickedUp = consignment ? stampOf(consignment.stamps, "pickedUp") : null;
  const place = (psc: string, city: string) => [psc ? formatPsc(psc) : "", city].filter(Boolean).join(" ");

  return (
    <SectionCard
      title={item.ref}
      extra={
        <span className="flex items-center gap-2">
          <TruckingStatusChip chip={CONSIGNMENT_STATUS_CHIP[item.status]} />
          <Link href={consignmentHref(item.id)} className="text-xs font-semibold text-indigo-600 hover:underline">
            Open in Trucking
          </Link>
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        <div>
          <Row label="Route" value={`${place(item.pickupPostcode, item.pickupCity)} → ${place(item.deliveryPostcode, item.deliveryCity)}`} />
          <Row label="Haulier" value={item.haulierName ?? ""} />
          <Row label="Trip" value={item.tripRef ?? ""} mono />
          <Row label="Plate" value={[trip?.tractorPlate, trip?.trailerPlate].filter(Boolean).join(" / ")} mono />
          <Row label="Driver" value={[trip?.driverName, trip?.driverPhone].filter(Boolean).join(" · ")} />
        </div>
        <div>
          <Row label="Pick-up" value={pickedUp ? `Picked up ${formatDateTime(pickedUp.at)}` : `Planned ${formatDate(item.pickupDate)}`} />
          <Row label="Delivery" value={delivered ? `Delivered ${formatDateTime(delivered.at)}` : item.promisedDate ? `Promised ${formatDate(item.promisedDate)}` : ""} />
          <Row label="POD" value={item.podReceivedAt ? `Received ${formatDateTime(item.podReceivedAt)}` : ""} />
          <Row label="Load" value={`${item.palletPlaces} pallet places · ${item.weightKg} kg${item.adr ? " · ADR" : ""}`} />
        </div>
      </div>
      {item.needsAttention.length > 0 && <div className="mt-2 text-[12px] text-red-700">{item.needsAttention.join(" · ")}</div>}
      {trip && (
        <div className="mt-2 text-right">
          <Link href={tripHref(trip.id)} className="text-[11px] font-semibold text-indigo-500 hover:underline">
            Trip {trip.ref}
          </Link>
        </div>
      )}
    </SectionCard>
  );
};

/**
 * The road transport of a job, as Trucking keeps it: its consignments with haulier, truck, driver,
 * dates and POD. Trucking writes back to the job (pick-up date, planned delivery, plate, actual
 * delivery, Billing once every POD is in), so this tab only shows — "Order trucking" books a new
 * consignment on the job.
 */
export function ShipmentTruckingTab({ shipment }: { shipment: ShipmentItem }) {
  const router = useRouter();
  const { consignments, isLoading, isError } = useConsignments({ shipmentId: shipment.id });
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Order trucking
        </Button>
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          Kept by Trucking — view only
          <Link href="/trucking" className="font-semibold text-indigo-600 hover:underline">
            Open in Trucking
          </Link>
        </span>
      </div>

      {isLoading && (
        <div className="flex justify-center p-10">
          <Spin />
        </div>
      )}
      {isError && <Alert type="error" showIcon message="The consignments of this job could not be loaded." />}
      {!isLoading && !isError && consignments.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-[13px] text-slate-500">
          No trucking on this job yet. <b>Order trucking</b> books a consignment with this job&apos;s customer and addresses.
        </div>
      )}
      {consignments.map((c) => (
        <ConsignmentJobCard key={c.id} item={c} />
      ))}

      {createOpen && <ConsignmentCreateModal shipment={shipment} onClose={() => setCreateOpen(false)} onCreated={(id) => router.push(consignmentHref(id))} />}
    </div>
  );
}
