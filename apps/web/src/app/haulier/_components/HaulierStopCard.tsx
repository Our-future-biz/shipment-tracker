import type { PublicTransportOrder } from "@/hooks/useTruckingConsignments";
import { formatDateTime } from "@/lib/date";
import { formatPsc } from "@/app/trucking/_lib/hauliers";
import type { BiText } from "../_lib/publicOrder";
import { Bi } from "./Bi";

interface HaulierStopCardProps {
  title: BiText;
  stop: PublicTransportOrder["pickup"];
}

const Row = ({ label, value }: { label: BiText; value: string }) =>
  value ? (
    <div className="py-1">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Bi text={label} />
      </div>
      <div className="whitespace-pre-wrap break-words text-[15px] text-slate-900">{value}</div>
    </div>
  ) : null;

// One stop of the order as the driver needs it: where, when, whom to call.
export const HaulierStopCard = ({ title, stop }: HaulierStopCardProps) => {
  const address = [stop.street, [stop.country === "CZ" ? formatPsc(stop.postcode) : stop.postcode, stop.city].filter(Boolean).join(" "), stop.country].filter(Boolean).join(", ");
  const window = stop.windowFrom || stop.windowTo ? `${formatDateTime(stop.windowFrom) || "…"} – ${formatDateTime(stop.windowTo) || "…"}` : "";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="m-0 mb-1 text-[13px] font-bold uppercase tracking-wide text-indigo-700">
        <Bi text={title} />
      </h2>
      <div className="text-[17px] font-semibold text-slate-900">{stop.name}</div>
      <Row label={{ cs: "Adresa", en: "Address" }} value={address} />
      <Row label={{ cs: "Časové okno", en: "Time window" }} value={window} />
      <Row label={{ cs: "Kontakt", en: "Contact" }} value={[stop.contactName, stop.contactPhone].filter(Boolean).join(" · ")} />
      {stop.avizaceRequired && (
        <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[13px] font-semibold text-amber-800">
          <Bi text={{ cs: "Avizovat předem telefonem", en: "Call before arriving" }} />
        </div>
      )}
      <Row label={{ cs: "Reference", en: "Reference" }} value={stop.reference} />
      <Row label={{ cs: "Poznámka", en: "Notes" }} value={stop.notes} />
    </section>
  );
};
