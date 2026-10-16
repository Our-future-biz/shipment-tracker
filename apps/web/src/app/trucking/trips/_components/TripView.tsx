"use client";

import { useState } from "react";
import Link from "next/link";
import { Spin } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { apiErrorMessage, isNotFound } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthContext";
import { useConsignment, useConsignmentDocuments, useTrip } from "@/hooks/useTruckingConsignments";
import { CONSIGNMENT_STATUS_CHIP, TRIP_STATUS_CHIP, consignmentActions, consignmentHref } from "../../_lib/consignments";
import { TERMS } from "../../_lib/glossary";
import { TRIP_KIND_LABEL, ltlTripOrderActions, type TripOrderActions } from "../../_lib/planning";
import { isTruckingManager } from "../../_lib/roles";
import { TruckingHistory } from "../../_components/TruckingHistory";
import { TruckingSendAgain } from "../../_components/TruckingSendAgain";
import { TruckingStatusChip } from "../../_components/TruckingStatusChip";
import { TripDialogs, type TripDialog } from "./TripDialogs";
import { TripLtlSections } from "./TripLtlSections";
import { TripPanel } from "./TripPanel";

const LIST_HREF = "/trucking?tab=trips";

interface TripViewProps {
  tripId: string;
}

// The page of one trip: the haulier and vehicle, the transport order and the history. An FTL trip
// carries one consignment and what may be done follows it; an LTL trip (pick-up run, line haul,
// delivery run) carries legs in stop order, with its fill, warnings and manifest.
export const TripView = ({ tripId }: TripViewProps) => {
  const { user } = useAuth();
  const { trip, isLoading, error } = useTrip(tripId);
  const ftl = trip?.kind === "FTL";
  // An LTL trip has many consignments; none of them speaks for it.
  const consignmentId = ftl ? (trip?.consignmentIds[0] ?? "") : "";
  const { consignment } = useConsignment(consignmentId);
  const { documents } = useConsignmentDocuments(consignmentId);
  const [dialog, setDialog] = useState<TripDialog>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center p-20">
        <Spin size="large" />
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="p-10 text-center text-slate-500">
        {isNotFound(error) ? "Trip not found." : `Could not load the trip: ${apiErrorMessage(error)}.`}{" "}
        <Link href={LIST_HREF} className="text-indigo-500">
          Back to Trips
        </Link>
      </div>
    );
  }

  let actions: TripOrderActions | null = null;
  if (!ftl) actions = ltlTripOrderActions(trip);
  else if (consignment) actions = consignmentActions(consignment, trip, documents.some((d) => d.kind === "POD"));

  return (
    <div className="bg-slate-50 min-h-full">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex flex-wrap items-start gap-2">
          <Link href={LIST_HREF} aria-label="Back to Trips" className="mt-1 p-1 text-slate-400 hover:text-indigo-500">
            <ArrowLeftOutlined />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 font-mono text-[22px] font-bold text-slate-800">{trip.ref}</h1>
              <TruckingStatusChip chip={TRIP_STATUS_CHIP[trip.status]} />
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {ftl ? `${TERMS.ftl} ${TERMS.trip.toLowerCase()}` : TRIP_KIND_LABEL[trip.kind]} · {trip.haulierName}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-4 p-6">
        {!ftl && <TripLtlSections trip={trip} />}
        {ftl && (
          <SectionCard title={TERMS.consignment}>
            {consignment ? (
              <div className="flex flex-wrap items-center gap-3 text-[13px]">
                <Link href={consignmentHref(consignment.id)} className="font-mono font-semibold text-indigo-600 hover:underline">
                  {consignment.ref}
                </Link>
                <TruckingStatusChip chip={CONSIGNMENT_STATUS_CHIP[consignment.status]} />
                <span className="text-slate-600">{consignment.customerName}</span>
                <span className="text-slate-500">
                  {consignment.pickupCity} → {consignment.deliveryCity}
                </span>
                <Link href={`/shipments/${consignment.shipmentId}?tab=trucking`} className="font-mono text-indigo-600 hover:underline">
                  {consignment.jobNumber}
                </Link>
              </div>
            ) : (
              <Spin size="small" />
            )}
          </SectionCard>
        )}
        <TripPanel trip={trip} actions={actions} manager={isTruckingManager(user)} onDialog={setDialog} />
        <SectionCard title="History">
          <TruckingSendAgain tripId={trip.id} manager={isTruckingManager(user)} />
          <TruckingHistory events={trip.events} />
        </SectionCard>
      </div>
      <TripDialogs trip={trip} dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
};
