"use client";

import type { ReactNode } from "react";
import { GLOSSARY, TERMS } from "../_lib/glossary";
import { TRUCKING_TABS } from "../_lib/tabs";

// Read me of the Trucking module, shown in the "?" help drawer: what the module is for and how
// it is being built. Keep it in step with the code as each phase lands.

interface PartProps {
  title: string;
  children: ReactNode;
}

const Part = ({ title, children }: PartProps) => (
  <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
    <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
      <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
    </div>
    <div className="p-4 text-[13px] leading-relaxed text-slate-600 [&_p]:mt-0 [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_ul]:mt-0 [&_ul]:mb-2.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ul:last-child]:mb-0 [&_li]:mb-1">
      {children}
    </div>
  </section>
);

export const TruckingReadme = () => (
  <div className="flex flex-col gap-4">
    <Part title="What the Trucking module is">
      <p>
        Trucking runs the road transport we organise within the Czech Republic. We own no trucks: every move is done by a subcontracted{" "}
        <b>{TERMS.haulier.toLowerCase()}</b> under a <b>{TERMS.transportOrder.toLowerCase()}</b>. Each lot of goods a customer buys transport for is a{" "}
        <b>{TERMS.consignment.toLowerCase()}</b>; each truck we order from one haulier is a <b>{TERMS.trip.toLowerCase()}</b>.
      </p>
      <p>
        The tabs follow the work: {TRUCKING_TABS.map((t) => t.label).join(" · ")}. This Read me sits behind the <b>?</b> button at the right of the tab bar.
      </p>
      <p>
        The module is built in phases. Today it is the frame only: nothing is recorded in Trucking yet, and each tab says what it will hold and which phase brings
        it — {TRUCKING_TABS.map((t) => `${t.label}: Phase ${t.phase}`).join(", ")}.
      </p>
    </Part>

    <Part title="Three kinds of work">
      <ul>
        <li>
          <b>Direct ({TERMS.ftl})</b>: one consignment on one trip, straight from the loading site to the unloading site, without passing our warehouse.
        </li>
        <li>
          <b>{TERMS.ltl}</b>: a consignment that shares trucks. A <b>{TERMS.pickupRun.toLowerCase()}</b> brings it to our warehouse, where the gate-in is
          stamped; a <b>{TERMS.deliveryRun.toLowerCase()}</b> takes it to the consignee, after <b>{TERMS.avizace}</b> where it is needed, ending with the signed{" "}
          <b>{TERMS.pod}</b>.
        </li>
        <li>
          <b>{TERMS.lineHaul}</b>: a trip between our warehouse and a depot carrying many {TERMS.ltl} consignments at once, without stops at customers. It is
          bought as one price and its cost is shared across its consignments by chargeable weight.
        </li>
      </ul>
    </Part>

    <Part title="When a consignment is due">
      <p>
        Its <b>{TERMS.serviceLevel.toLowerCase()}</b> sets the date: <b>+1 … +4</b> working days, counted for {TERMS.ltl} from the gate-in confirmed by the warehouse
        and for {TERMS.ftl} from the planned pick-up; or <b>Express</b> — same day, by 10:00, by 12:00 or on a fixed date. Weekends and public holidays are not
        working days.
      </p>
    </Part>

    <Part title="How Trucking connects to the other modules">
      <ul>
        <li>
          <b>Customer Database</b>: customers, their addresses and contacts. The postcode (PSČ) of an address gives its <b>{TERMS.zone.toLowerCase()}</b>.
        </li>
        <li>
          <b>Shipments</b>: every consignment belongs to a shipment job; an order for a domestic-only customer gets its job created automatically. What Trucking learns (picked up, delivered) is written back to the shipment through an outbox,
          as the user who recorded it, and retried when Shipments is briefly unavailable — the same way the Warehouse gate writes back today.
        </li>
        <li>
          <b>Sales</b>: the <b>Rate calculator</b> and the <b>{TERMS.sellTariff.toLowerCase()}s</b> price trucking in quotes.
        </li>
        <li>
          <b>Invoicing</b>: customers are invoiced at the {TERMS.sellTariff.toLowerCase()}; haulier invoices are checked against the{" "}
          {TERMS.buyTariff.toLowerCase()} and the {TERMS.transportOrder.toLowerCase()}; each month the <b>{TERMS.internalCharge.toLowerCase()}</b> bills Operations
          for the transport run for their shipments.
        </li>
        <li>
          <b>Warehouse</b>: {TERMS.ltl} consignments are gated in and out at our warehouse. The warehouse-confirmed gate-in starts the service-level clock, and a
          delivery run picks the goods up from there.
        </li>
      </ul>
    </Part>

    <Part title="Words we use">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-3">Term</th>
            <th className="py-1.5 pr-3">Meaning</th>
            <th className="py-1.5">Instead of</th>
          </tr>
        </thead>
        <tbody>
          {GLOSSARY.map((g) => (
            <tr key={g.term} className="border-b border-slate-100 last:border-b-0 align-top">
              <td className="py-1.5 pr-3 font-semibold text-slate-800 whitespace-nowrap">{g.term}</td>
              <td className="py-1.5 pr-3">{g.meaning}</td>
              <td className="py-1.5 text-slate-400">{g.replaces ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Part>
  </div>
);
