import type { PublicTransportOrder } from "@/hooks/useTruckingConsignments";
import { formatPsc } from "@/app/trucking/_lib/hauliers";
import { LABEL_TEXT } from "@/styles/ui";
import type { BiText } from "../_lib/publicOrder";
import { Bi } from "./Bi";
import { PortalCard } from "./PortalCard";

interface HaulierStopCardProps {
  title: BiText;
  stop: PublicTransportOrder["pickup"];
  /** The stop's window as the server words it, in Prague time (the phone may be set to another zone). */
  windowText: string;
}

const Row = ({ label, value }: { label: BiText; value: string }) =>
  value ? (
    <div className="py-1">
      <div className={LABEL_TEXT}>
        <Bi text={label} />
      </div>
      <div className="whitespace-pre-wrap break-words text-[14px] text-slate-900">{value}</div>
    </div>
  ) : null;

// One stop of the order as the driver needs it: where, when, whom to call.
export const HaulierStopCard = ({ title, stop, windowText }: HaulierStopCardProps) => {
  const address = [stop.street, [stop.country === "CZ" ? formatPsc(stop.postcode) : stop.postcode, stop.city].filter(Boolean).join(" "), stop.country].filter(Boolean).join(", ");
  return (
    <PortalCard title={<Bi text={title} />}>
      <div className="text-[14px] font-semibold text-slate-900">{stop.name}</div>
      <Row label={{ cs: "Adresa", en: "Address" }} value={address} />
      <Row label={{ cs: "Časové okno", en: "Time window" }} value={windowText} />
      <Row label={{ cs: "Kontakt", en: "Contact" }} value={[stop.contactName, stop.contactPhone].filter(Boolean).join(" · ")} />
      {stop.avizaceRequired && (
        <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[13px] font-semibold text-amber-800">
          <Bi text={{ cs: "Avizovat předem telefonem", en: "Call before arriving" }} />
        </div>
      )}
      <Row label={{ cs: "Reference", en: "Reference" }} value={stop.reference} />
      <Row label={{ cs: "Poznámka", en: "Notes" }} value={stop.notes} />
    </PortalCard>
  );
};
