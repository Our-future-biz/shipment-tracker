"use client";

import type { ReactNode } from "react";
import { GLOSSARY, TERMS } from "../_lib/glossary";
import { TRUCKING_TABS, type TruckingTabInfo } from "../_lib/tabs";

const LIVE_TABS = TRUCKING_TABS.filter((t: TruckingTabInfo) => t.live);
const PLANNED_TABS = TRUCKING_TABS.filter((t: TruckingTabInfo) => !t.live);

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
        The module is built in phases. Live today: {LIVE_TABS.map((t) => t.label).join(", ")} and the Trucking settings (the gear at the right of the tab bar).
        Every other tab says what it will hold and which phase brings it — {PLANNED_TABS.map((t) => `${t.label}: Phase ${t.phase}`).join(", ")}.
      </p>
    </Part>

    <Part title="Hauliers">
      <p>
        A haulier is a company in the Customer Database with the <b>Haulier</b> role; the Hauliers tab lists every one of them. Its page in Trucking holds what we
        need before we hire it: <b>{TERMS.liabilityInsurance.toLowerCase()}</b> (insurer, policy, limit, valid to), the <b>{TERMS.transportLicence.toLowerCase()}</b>,
        the VAT-register check, the {TERMS.vehicleType.toLowerCase()}s it sends, {TERMS.adr}, payment terms, the <b>{TERMS.costSplit.toLowerCase()}</b> and its{" "}
        {TERMS.preferredLane.toLowerCase()}s.
      </p>
      <ul>
        <li>
          <b>Blocked</b> — cannot be put on a trip: blocked by a manager (with a reason), no valid insurance or licence, or an{" "}
          {TERMS.unreliableVatPayer.toLowerCase()}. A haulier without a Trucking profile yet is blocked until one is filled in.
        </li>
        <li>
          <b>Warning</b> — can be used, but insurance or licence ends within 30 days, or the VAT register was last checked more than 30 days ago.
        </li>
        <li>
          <b>OK</b> — nothing to do.
        </li>
      </ul>
      <p>
        The status is worked out by the server on every read, by the Prague calendar. Anyone can fill in a profile; only a manager blocks or unblocks, and every
        change is logged with who made it and when.
      </p>
    </Part>

    <Part title="Tariffs">
      <p>
        A tariff is a price list on one of three sides: <b>Buy</b> (what a {TERMS.haulier.toLowerCase()} charges us, one tariff per haulier and scope),{" "}
        <b>Sell</b> (what we charge — the <b>{TERMS.standardList}</b> for everyone, or a customer&apos;s own) and <b>Internal</b> (what Trucking charges Operations).
        Each has a scope ({TERMS.ltl}, {TERMS.ftl} or {TERMS.lineHaul.toLowerCase()}) and a currency, CZK or EUR.
      </p>
      <p>
        A customer&apos;s sell tariff is either its own price matrix or a <b>discount</b> on the {TERMS.standardList}: &quot;−5 % on Standard&quot; prices
        with the Standard version active on the day and takes 5 % off; a negative discount is an uplift.
      </p>
      <p>
        <b>Versions.</b> The prices themselves sit in <b>{TERMS.tariffVersion.toLowerCase()}s</b>. A new version is a <b>Draft</b>; the server checks it on
        saving and lists errors (overlapping postcode ranges, a price for an unknown zone, gaps between bands…) and warnings (a price that falls as weight rises,
        a slower service dearer than a faster one, changes over 15 % against the active version). A manager activates a draft without errors from a date: it is{" "}
        <b>Scheduled</b> until then and <b>Active</b> from it, and the version it replaces ends the day before — so exactly one version prices on any day.
        Later it becomes <b>Expired</b>, or <b>Superseded</b> if replaced before it started. A draft that is not wanted is discarded.
      </p>
      <p>
        <b>Excel {TERMS.template.toLowerCase()}.</b> Prices are typed in Excel. On the tariff page anyone downloads the template — empty, or as the current
        version so only the changes need typing — and every version can be downloaded as a template or as the file it was uploaded from. Its sheets:
      </p>
      <ul>
        <li>
          <b>Read me</b> — how to fill it in (ignored on upload). <b>Meta</b> — valid from / to, kg per LDM, per m³ and per pallet place, weight and money
          rounding, notes.
        </li>
        <li>
          <b>Zones</b> — zone code, label, PSČ from and to, remote (Y/N). <b>D1 … D4, EXP_…</b> — one sheet per service level the version offers: bands down
          (basis kg, pallet, LDM or trip; from, to, price type), zones across, and a last <b>MIN</b> row with the {TERMS.minimumCharge.toLowerCase()}. A blank
          cell means no price there; a missing sheet means the level is not offered.
        </li>
        <li>
          <b>Surcharges</b> — code, calculation, value, minimum and whether it counts on freight plus surcharges.
        </li>
      </ul>
      <p>
        <b>Upload.</b> A manager uploads the filled-in file (.xlsx, up to 5 MB) in six steps: <b>File</b>, <b>Read</b> (what was used from each sheet),{" "}
        <b>Check</b> (errors and warnings by sheet, row and column), <b>Compare</b> (every price that changed against the active version, with the average and
        largest rise and fall), <b>Test a lane</b> (prices one consignment with the new version) and <b>Activate</b> (from today or a later day). The upload
        is saved as a <b>{TERMS.draftVersion.toLowerCase()}</b> at once, so closing the wizard keeps it. Errors must be fixed in the file and uploaded again;
        warnings can be accepted. A discount tariff has no file of its own.
      </p>
      <p>
        <b>Zones.</b> Each version splits the Czech postcodes (PSČ, e.g. 110 00 – 199 99) into zones. The zone comes from the delivery postcode, or from the
        pick-up postcode for tariffs set that way (pick-up runs). The narrowest range containing the postcode wins; a postcode in no zone is not priced.
      </p>
      <p>
        <b>Rate sheets.</b> Per service level a version has a matrix: bands down (by weight, pallet places, LDM, or one price per trip), zones across, and a{" "}
        <b>{TERMS.minimumCharge.toLowerCase()}</b> per zone. Surcharges follow: fuel (fixed % or the month&apos;s <b>{TERMS.fuelIndex.toLowerCase()}</b>), toll,
        and the extras ({TERMS.adr}, {TERMS.tailLift.toLowerCase()}, {TERMS.avizace}, time window, {TERMS.b2cDelivery}, waiting time, insurance, remote area,
        non-stackable) only when the consignment needs them.
      </p>
    </Part>

    <Part title="Rate calculator">
      <p>
        Enter the postcodes, the pick-up date (and time, if after the cut-off matters), what is carried and the extras; it prices every active service level
        from the tariffs. Nothing is stored. Sell uses the customer&apos;s tariff when one is chosen, otherwise the {TERMS.standardList}.
      </p>
      <ul>
        <li>
          <b>{TERMS.chargeableWeight}</b> is the highest of the real weight, LDM × kg per LDM, m³ × kg per m³ and pallet places × kg per pallet place (the
          factors of the tariff version), rounded up to its weight step; the result says which measure won. Tariffs priced by pallet places, LDM or per trip
          use those directly.
        </li>
        <li>
          <b>Delivered</b> is the promised date: the start day is the pick-up date, or the next working day when the pick-up is after the level&apos;s{" "}
          {TERMS.cutoff.toLowerCase()}; +1 … +4 add that many working days (weekends and Czech public holidays do not count); Express same day is that day, by
          10:00 / 12:00 the next working day; Express fixed date is agreed per order. For {TERMS.ltl} the real clock starts at the warehouse gate-in — the
          calculator assumes it on the start day.
        </li>
        <li>
          <b>Buy</b> lists every haulier with an active buy tariff for the lane, preferred lanes first, then cheapest; blocked hauliers are shown apart with
          the reason. <b>Margin</b> is sell minus the best buy in CZK; below the {TERMS.marginFloor.toLowerCase()} it is flagged.
        </li>
        <li>Amounts in EUR are also shown in CZK at the ČNB rate of the day. A level that cannot be priced says why, in plain words.</li>
      </ul>
    </Part>

    <Part title="Trucking settings">
      <p>
        Behind the gear: the {TERMS.serviceLevel.toLowerCase()}s with their order <b>{TERMS.cutoff.toLowerCase()}</b>, the {TERMS.vehicleType.toLowerCase()}s, the
        factors that turn LDM, volume and pallet places into {TERMS.chargeableWeight.toLowerCase()} (the defaults of new tariff versions), the{" "}
        <b>{TERMS.marginFloor.toLowerCase()}</b>, the text of the {TERMS.transportOrder.toLowerCase()} e-mail and the monthly{" "}
        <b>{TERMS.fuelIndex.toLowerCase()}</b>. Everyone can read them; a manager changes them. Two people saving at once cannot overwrite each other: the
        second is asked to reload and make the change again.
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
