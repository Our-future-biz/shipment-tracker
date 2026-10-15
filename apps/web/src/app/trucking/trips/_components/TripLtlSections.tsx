"use client";

import { useState } from "react";
import { Tag } from "antd";
import { CheckCircleOutlined, WarningOutlined } from "@ant-design/icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SectionCard } from "@/components/SectionCard";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { useToast } from "@/lib/toast";
import { useTruckingSettings } from "@/hooks/useTrucking";
import { useTrip, type TripDetail, type TripStampKind } from "@/hooks/useTruckingConsignments";
import { btnDefault } from "@/app/warehouse/gate-log/_components/job/fields";
import { TERMS } from "../../_lib/glossary";
import { vehicleCapacity } from "../../_lib/planning";
import { formatQty } from "../../_lib/tariffs";
import { LabelsModal } from "../../_components/LabelsModal";
import { ManifestModal } from "../../_components/ManifestModal";
import { TripFillBars } from "../../_components/TripFillBars";
import { TripLegsTable } from "./TripLegsTable";

const STAMP_LABEL: Record<TripStampKind, string> = { departed: "Departed", arrived: "Arrived" };
const STAMPS: TripStampKind[] = ["departed", "arrived"];

interface TripLtlSectionsProps {
  trip: TripDetail;
}

// The parts of an LTL trip's page: its legs in stop order, the fill and warnings (never blocking),
// Departed / Arrived (a pick-up run arriving is not the gate-in — the warehouse stamps that), the
// manifest and the labels of its consignments.
export const TripLtlSections = ({ trip }: TripLtlSectionsProps) => {
  const toast = useToast();
  const { settings } = useTruckingSettings();
  const { stamp, isStamping } = useTrip(trip.id);
  const [dialog, setDialog] = useState<"manifest" | "labels" | TripStampKind | null>(null);
  const capacity = vehicleCapacity(settings?.vehicleTypes ?? [], trip.vehicleTypeCode);
  const closed = trip.status === "CANCELLED" || trip.status === "DONE";
  const consignmentIds = [...new Set(trip.legs.map((l) => l.consignmentId))];

  const doStamp = (kind: TripStampKind) =>
    stamp({ kind, at: null })
      .then(() => toast.success(`${STAMP_LABEL[kind]} stamped`))
      .catch((e: unknown) => toast.error(`Could not stamp ${STAMP_LABEL[kind]}: ${apiErrorMessage(e)}`));

  return (
    <>
      <SectionCard
        title={`${TERMS.leg}s`}
        extra={
          <span className="flex gap-2">
            <button type="button" className={btnDefault} onClick={() => setDialog("manifest")}>
              {TERMS.manifest} PDF…
            </button>
            <button type="button" className={btnDefault} disabled={!consignmentIds.length} onClick={() => setDialog("labels")}>
              Labels PDF…
            </button>
          </span>
        }
        bodyClassName="p-0"
      >
        <TripLegsTable trip={trip} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SectionCard title={TERMS.fill}>
          <div className="flex flex-col gap-2">
            <TripFillBars fill={trip.fill} capacity={capacity} />
            <div className="text-[11px] tabular-nums text-slate-500">
              {formatQty(trip.fill.palletPlaces)}
              {capacity ? ` of ${formatQty(capacity.palletPlaces)}` : ""} pallet places
            </div>
            {trip.warnings.length > 0 ? (
              <ul className="m-0 list-none rounded-md bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-800" aria-label="Warnings">
                {trip.warnings.map((w) => (
                  <li key={w} className="flex gap-1.5">
                    <WarningOutlined className="mt-[3px]" aria-hidden />
                    {w}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-[12px] text-emerald-700">No warnings.</div>
            )}
          </div>
        </SectionCard>
        <SectionCard title="On the road">
          <div className="flex flex-wrap items-center gap-2">
            {STAMPS.map((kind) => {
              const s = trip.stamps[kind];
              if (s) {
                return (
                  <Tag key={kind} color="success" icon={<CheckCircleOutlined />} className="m-0 !px-2 !py-1 !text-[12px]">
                    <span className="font-semibold">{STAMP_LABEL[kind]}</span> <span className="font-mono">{formatDateTime(s.at)}</span>
                    {s.by ? ` · ${s.by}` : ""}
                  </Tag>
                );
              }
              return (
                <button key={kind} type="button" className={btnDefault} disabled={closed || isStamping || (kind === "arrived" && !trip.stamps.departed)} onClick={() => setDialog(kind)}>
                  {STAMP_LABEL[kind]}…
                </button>
              );
            })}
          </div>
          {trip.kind === "PICKUP_RUN" && <p className="mb-0 mt-2 text-[11px] text-slate-500">Arrived is not the gate-in: the warehouse stamps the gate-in, which starts the service-level clock.</p>}
        </SectionCard>
      </div>

      {dialog === "manifest" && <ManifestModal tripId={trip.id} tripRef={trip.ref} onClose={() => setDialog(null)} />}
      {dialog === "labels" && <LabelsModal consignmentIds={consignmentIds} what={trip.ref} onClose={() => setDialog(null)} />}
      {(dialog === "departed" || dialog === "arrived") && (
        <ConfirmModal
          open
          onClose={() => setDialog(null)}
          onConfirm={() => {
            void doStamp(dialog);
            setDialog(null);
          }}
          title={`Stamp ${STAMP_LABEL[dialog].toLowerCase()} now?`}
          description={`${trip.ref} ${dialog === "departed" ? "left" : "arrived"} now. The stamp is kept with the time and your name.`}
          confirmLabel={`Stamp ${STAMP_LABEL[dialog].toLowerCase()}`}
        />
      )}
    </>
  );
};
