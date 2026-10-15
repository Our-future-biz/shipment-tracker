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

    <Part title="A direct delivery (FTL), end to end">
      <ol className="mt-0 mb-2.5 list-decimal pl-5 [&_li]:mb-1.5">
        <li>
          <b>Book the {TERMS.consignment.toLowerCase()}</b> — Consignments → <b>Create new</b>, from one of three sources: <b>From job no.</b> (the job&apos;s
          customer and addresses), <b>From quote</b> (its road transport, customer and price; a won quote&apos;s job is used, else one is made) or{" "}
          <b>New domestic order</b> (a Road job is created in Shipments for it). Every consignment belongs to a job. Pick-up and delivery are the
          customer&apos;s sites or typed addresses; the price comes from the tariff, the quote or is agreed (with a reason). The sell price is stored with the
          consignment, never priced again silently, and written to the job&apos;s selling costs. Its ref is <b>TCZ</b> + year + six digits.
        </li>
        <li>
          <b>Margin</b> — sell minus buy. Below the {TERMS.marginFloor.toLowerCase()} the consignment can be saved, but the{" "}
          {TERMS.transportOrder.toLowerCase()} waits for a manager&apos;s <b>{TERMS.marginApproval.toLowerCase()}</b> (Money card → Approve margin…).
        </li>
        <li>
          <b>Plan trip</b> — the hauliers with a {TERMS.buyTariff.toLowerCase()} for the lane are offered, preferred lane (★) first, then cheapest; blocked
          ones are listed apart with why. The first is suggested; choosing another, or another haulier at an agreed price, is logged. One FTL consignment
          gets one {TERMS.trip.toLowerCase()} (ref <b>LCZ</b> + year + six digits); its buy price goes to the job&apos;s buying costs, and the planned pick-up,
          promised delivery and tractor plate are written to the job.
        </li>
        <li>
          <b>{TERMS.transportOrder}</b> — <b>Print…</b> downloads the PDF; <b>Send…</b> records the order as sent and downloads the PDF. E-mail is off in this
          app, so it says <b>Mark as sent ({TERMS.recordedOnly.toLowerCase()})</b>: nothing is e-mailed, you send the PDF to the haulier. Refused while the
          margin waits for approval or the haulier is blocked.
        </li>
        <li>
          <b>The {TERMS.pickupPin} rule</b> — the PIN is made in Shipments and shown there only once (Shipments keeps only a hash). To have it on the order,
          type it into the Print / Send dialog: it is printed on the PDF and <b>never stored or logged</b> — the history says only &quot;PIN printed&quot;.
          Leave it empty to print none.
        </li>
        <li>
          <b>The {TERMS.haulierLink.toLowerCase()}</b> — a sent order carries a link (valid 30 days after the planned pick-up; sending again renews it).
          The haulier opens it on a phone without signing in, sees the order in Czech and English with only the agreed price, <b>confirms or rejects</b> it
          once and later <b>uploads the {TERMS.pod}</b> (photo or PDF, receiver&apos;s name, delivery time). A confirmation by phone or e-mail is entered with{" "}
          <b>Record confirmation…</b>.
        </li>
        <li>
          <b>{TERMS.stamp}s</b> — Picked up, Delivered and POD received are stamped in order, now or up to 7 days back, each once (a second try says
          &quot;Already stamped&quot;). Delivered writes the job&apos;s actual delivery date. A manager may void a stamp with a reason; the history keeps both.
        </li>
        <li>
          <b>{TERMS.pod} → Billing</b> — the haulier&apos;s upload stamps Delivered and POD received by itself. A POD uploaded on the Documents tab offers to
          stamp POD received; a manager may stamp it without a document. When every consignment of the job (cancelled ones aside) has its POD and nothing is
          open, the job&apos;s Shipment Status becomes <b>Billing</b> and the consignments <b>Ready to bill</b>: the job is invoiced as one, with the POD date as
          the date of the taxable supply.
        </li>
      </ol>
      <p>
        A manager can <b>cancel</b> a consignment (with a reason) until it is picked up — its Trucking cost lines leave the job — or cancel a trip, which
        sends its consignment back to Booked. The Consignments tab tiles count open FTL consignments without a haulier and today&apos;s pick-ups and
        deliveries; its chips show what needs attention, POD missing and ready to bill. The Trips tab lists every trip with its haulier, vehicle and
        order.
      </p>
    </Part>

    <Part title="Groupage (LTL) through our warehouse">
      <p>
        An <b>{TERMS.ltl}</b> consignment shares trucks with others and always passes <b>our warehouse</b> (the <b>{TERMS.hub.toLowerCase()}</b>, its address in
        Trucking settings). Book it like an FTL one with the scope <b>LTL</b>, then choose: <b>Customer brings goods to our warehouse</b> (no pick-up run) and
        the <b>last mile</b> — our <b>own delivery run</b> or the <b>{TERMS.partnerNetwork.toLowerCase()}</b> (a partner haulier). Its sell price comes from the
        customer&apos;s LTL sell list.
      </p>
      <p>
        Its road is made of <b>{TERMS.leg.toLowerCase()}s</b>: <b>Pick-up</b> (customer → our warehouse, on a {TERMS.pickupRun.toLowerCase()}),{" "}
        <b>{TERMS.lineHaul}</b> (our warehouse → the partner&apos;s depot, only when a partner delivers from its own depot) and <b>Delivery</b> (on our{" "}
        {TERMS.deliveryRun.toLowerCase()}, or by the partner — priced per consignment from the partner&apos;s {TERMS.buyTariff.toLowerCase()}, scope LTL, or at
        an agreed price; set with <b>Set partner…</b> on the consignment&apos;s Legs). The consignment page shows the legs as a timeline with their trips, the
        gate-in time and the promised date.
      </p>
      <ul>
        <li>
          <b>Status</b>: Booked → Planned (every leg needed is on a trip) → Ordered (the first transport order is sent) → Picked up → <b>At our warehouse</b>{" "}
          → On line haul / Out for delivery → Delivered → POD received → Ready to bill.
        </li>
        <li>
          <b>The warehouse stamps the gates</b>, not Trucking: a pick-up run arriving is not the gate-in. The gate-in the warehouse confirms moves the
          consignment to At our warehouse; its gate-out moves it on by the next leg. A voided gate stamp takes the step back.
        </li>
        <li>
          <b>Promised date</b>: until the gate-in it is <b>Estimated</b> (the planned pick-up counts as the gate-in day); after it, it is final: the service
          level&apos;s working days counted from the gate-in (after the {TERMS.cutoff.toLowerCase()} from the next working day).
        </li>
      </ul>
      <p>
        <b>Planning</b> (the Planning tab): pick the day and the kind — Pick-up runs, Line hauls or Delivery runs. The open legs are on the left, by{" "}
        {TERMS.zone.toLowerCase()}, with a deadline badge (overdue and today red, tomorrow amber). The day&apos;s trips are cards with the haulier, vehicle, the{" "}
        <b>{TERMS.fill.toLowerCase()}</b> as two bars (LDM and kg — the fuller sets the colour), the stops, the cost and the warnings.
      </p>
      <ul>
        <li>
          <b>Drag a leg onto a card</b>, or use its <b>Add to trip…</b> menu (the keyboard way; it says what the leg would bring up). Drag the stops to
          reorder them (or the arrows); × takes a leg off.
        </li>
        <li>
          <b>New trip</b> from the ticked legs: the hauliers the buy tariffs offer (★ preferred lane first, then cheapest; blocked ones apart with why) or another
          haulier at its tariff or an agreed price, and the vehicle type.
        </li>
        <li>
          <b>Warnings never block</b>: over capacity, {TERMS.adr} on a haulier without {TERMS.adr}, a promised date before the trip, a{" "}
          {TERMS.tailLift.toLowerCase()} needed but missing. If someone changed the trip meanwhile the board reloads — make the change again.
        </li>
        <li>
          Card actions: <b>{TERMS.transportOrder}</b> (the same Print / Send dialogs as FTL, listing every stop), <b>{TERMS.manifest} PDF</b>,{" "}
          <b>Labels PDF</b> (100 × 150 mm, also from the Consignments grid for ticked rows) and <b>Open trip</b>.
        </li>
        <li>
          <b>Cost</b>: a trip&apos;s buy price is shared over its legs by the haulier&apos;s {TERMS.costSplit.toLowerCase()} (chargeable weight unless set
          otherwise), exact to the cent, and shared again when legs or the price change; each job gets one buying line per trip (&quot;pick-up run share, 3 of
          18 consignments&quot;).
        </li>
      </ul>
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
        <li>
          <b>Copy to quote</b> puts a level and haulier on a Draft or Revised quote, or on a new Road quote: the quote is priced again from the same inputs for
          the quote&apos;s own customer, and opens.
        </li>
      </ul>
    </Part>

    <Part title="Trucking in quotes">
      <p>
        A Road quote (or any quote with lines priced from a tariff) has a <b>Road transport</b> card under Pricing: pick-up and delivery (a site of the
        customer, which fills in its postcode, or a typed PSČ), pick-up date and time, scope, what is carried and the extras. <b>Price from tariff</b> shows
        every active service level for these inputs and the quote&apos;s customer — its own sell list, else the {TERMS.standardList} — and the user picks a
        level and a haulier (the best one first). The tariff&apos;s lines then replace the quote&apos;s earlier tariff lines; lines typed by hand stay. The
        promised delivery date is shown on the card.
      </p>
      <p>
        Lines priced from a tariff carry a <b>Tariff vN</b> tag. Changing one by hand is allowed and marks it <b>{TERMS.override}</b>. Everyone sees buy
        prices.
      </p>
      <p>
        The quote shows its margin in CZK against the <b>{TERMS.marginFloor.toLowerCase()}</b>. Below it, a manager must give a{" "}
        <b>{TERMS.marginApproval.toLowerCase()}</b> (with a reason) before the quote can be marked Ready to send or sent; the approval covers that margin or
        a better one. Pricing again clears it. Saving the quote is never blocked.
      </p>
    </Part>

    <Part title="Trucking settings">
      <p>
        Behind the gear: the {TERMS.serviceLevel.toLowerCase()}s with their order <b>{TERMS.cutoff.toLowerCase()}</b>, the {TERMS.vehicleType.toLowerCase()}s, the
        factors that turn LDM, volume and pallet places into {TERMS.chargeableWeight.toLowerCase()} (the defaults of new tariff versions), the{" "}
        <b>{TERMS.marginFloor.toLowerCase()}</b>, the text of the {TERMS.transportOrder.toLowerCase()} e-mail and the monthly{" "}
        <b>{TERMS.fuelIndex.toLowerCase()}</b>, and <b>our warehouse</b> (the {TERMS.hub.toLowerCase()} every {TERMS.ltl} trip starts or ends at; planning waits
        until it is set). Everyone can read them; a manager changes them. Two people saving at once cannot overwrite each other: the
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
          Each company&apos;s <b>Trucking</b> tab shows the price list it is priced with (its own or the {TERMS.standardList}), lets a manager give it a
          discount or its own list, and for a haulier lists its {TERMS.buyTariff.toLowerCase()}s.
        </li>
        <li>
          <b>Shipments</b>: every consignment belongs to a shipment job; an order for a domestic-only customer gets its job created automatically. What Trucking
          learns is written back to the job through an outbox (retried when Shipments is briefly unavailable): the planned pick-up, promised delivery and
          tractor plate when the trip is planned, the actual delivery date, and the step to <b>Billing</b> once every POD is in. The job&apos;s{" "}
          <b>Trucking</b> tab shows its consignments (kept by Trucking — view only) and <b>Order trucking</b> books a new one on the job.
        </li>
        <li>
          <b>Sales</b>: the <b>Rate calculator</b> and the <b>{TERMS.sellTariff.toLowerCase()}s</b> price trucking in quotes (Price from tariff, Copy to
          quote), with the {TERMS.marginApproval.toLowerCase()} below the floor.
        </li>
        <li>
          <b>Invoicing</b>: a consignment&apos;s sell price and its trip&apos;s buy price are lines of the job&apos;s Costs Breakdown, tagged{" "}
          <b>From Trucking · TCZ…</b> and read-only there (they change in Trucking). Customers are invoiced at the {TERMS.sellTariff.toLowerCase()}; haulier invoices are checked against the{" "}
          {TERMS.buyTariff.toLowerCase()} and the {TERMS.transportOrder.toLowerCase()}; each month the <b>{TERMS.internalCharge.toLowerCase()}</b> bills Operations
          for the transport run for their shipments.
        </li>
        <li>
          <b>Warehouse</b>: {TERMS.ltl} consignments are gated in and out at our warehouse. A trip planned in Trucking shows there as expected (haulier, plate,
          driver, a dock slot when one is free) and fills the job&apos;s pick-up rows (read-only there, &quot;From trip LCZ…&quot;). The warehouse keeps the gate
          stamps, release, PIN check and exceptions; its confirmed gate-in starts the service-level clock and its gate-out sends the consignment on.
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
