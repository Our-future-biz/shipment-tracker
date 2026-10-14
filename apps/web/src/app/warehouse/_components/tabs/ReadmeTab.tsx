"use client";

import type { ReactNode } from "react";
import { GLOSSARY, TERMS } from "../../_lib/glossary";

// Read me of the Warehouse module, shown in the "?" help drawer: how the module works today,
// in plain words. Keep it in step with the code when behaviour changes.

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
        <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">{title}</h3>
      </div>
      <div className="p-4 text-[13px] leading-relaxed text-slate-600 [&_p]:mt-0 [&_p]:mb-2.5 [&_p:last-child]:mb-0 [&_ul]:mt-0 [&_ul]:mb-2.5 [&_ul]:pl-5 [&_ul]:list-disc [&_ul:last-child]:mb-0 [&_li]:mb-1">
        {children}
      </div>
    </section>
  );
}

export function ReadmeTab() {
  return (
    <div className="flex flex-col gap-4">
      <Part title="What the Warehouse module is">
        <p>
          The Warehouse module runs our CFS warehouse: cargo comes in, is checked, stored and released. Each lot of cargo is a <b>position</b> with its own{" "}
          <b>{TERMS.warehouseRef}</b>: WCZ, the year and a six-digit number that rises with every new position, imported or created (WCZ2026000001,
          WCZ2026000002, …), starting again at 000001 each year. Older references (WCZ + date + two digits) keep their number and are never given out again.
          Everything about a position is kept on one page, its <b>Gate Log job</b>.
        </p>
        <p>
          The tabs follow the work: Positions · Remeasurement / Release · Gate Log · Containers · Dock &amp; Yard · Stock · Reports. This Read me sits behind the{" "}
          <b>?</b> button at the right of the tab bar.
        </p>
      </Part>

      <Part title="Positions and Create new">
        <ul>
          <li>Positions lists every position, newest first. Click a row (or move to it with Tab and press Enter) to open its Gate Log job.</li>
          <li>
            The <b>{TERMS.jobNo}</b> link (&ldquo;Remeasure&rdquo; on a position without one) opens the position&rsquo;s Remeasurement / Release — every position has one,
            linked to a shipment or not.
          </li>
          <li>
            Positions is also the exception worklist: <b>Received</b>, <b>Days in WH</b>, <b>Free time left</b>, <b>Est. storage CZK</b>, {TERMS.releaseGates} and
            open <b>Exceptions</b>, each sortable by clicking its header. The quick filters (Needs attention, Expected today, In warehouse, Free time expiring ≤ 2 days,
            Chargeable, On hold, Released today) show their counts and are kept in the address.
          </li>
          <li>
            <b>Create new</b> has two kinds of position:
            <ul className="mt-1">
              <li>
                <b>Copy from {TERMS.jobNo}</b>, <b>Copy from quote</b> or <b>Create blank</b>: a position of its own. The values are copied once and nothing stays linked,
                so the gate writes nothing back to Shipments. You go straight to its Gate Log job.
              </li>
              <li>
                <b>Import from Shipments</b> or <b>Import from Master Jobs</b>: one position per ticked shipment, linked to it, sent in one request. Each position and its
                Gate Log record are made together, so there is never one without the other. The dialog then lists each shipment: created, already in the warehouse
                (it keeps its position), or failed with the reason — failed ones stay ticked to try again and use no reference.
              </li>
            </ul>
          </li>
          <li>
            An imported record takes from the shipment:
            <ul className="mt-1">
              <li>
                <b>{TERMS.direction}</b>: export shipments come in ({TERMS.inbound.toLowerCase()}), import shipments go out ({TERMS.outbound.toLowerCase()}).
              </li>
              <li>
                <b>Operation</b>: Full Load by sea or rail, or with a container number → FCL stripping (import) or FCL stuffing (export); Consolidation → LCL
                consolidation; Project Shipment, or Full Load by road or air without a container → Cargo storage; no load type → LCL consolidation.
              </li>
              <li>
                <b>Customs mode</b>: the shipment&rsquo;s customs procedure when the gate knows it (SCP, JSD, T1, T2L, ATA Carnet, RDT, C-Goods), otherwise SCP.
              </li>
              <li>
                <b>Customs status</b>: the shipment&rsquo;s, and it keeps following the shipment until the cargo is released (see below).
              </li>
            </ul>
          </li>
          <li>
            <b>Refresh from shipment</b> (Actions in the job, anyone, logged) copies the shipment&rsquo;s data onto a linked record again; the log shows each old and new value. Operation and customs mode
            are mapped again only before the first stamp. After a stamp, pieces, weight, measure, packing, container and seal the gate may have corrected are
            only filled when blank — a different value is kept and shown as &ldquo;differs from shipment&rdquo;.
          </li>
          <li>The tiles above the grid filter it (open consol outbound / inbound containers, open shuttle trucks), and so does the FCL / LCL switch.</li>
          <li>
            Tick rows to <b>Print labels</b> or <b>Remove from warehouse</b>. A removed position&rsquo;s reference is retired, not reused; its Gate Log records are
            archived with it; the shipment is not affected. A position whose gate record has stamps is removed only by a manager, with a reason.
          </li>
        </ul>
      </Part>

      <Part title="Gate Log and the job">
        <p>
          The Gate Log tab is the gate clerk&rsquo;s list: one row per gate movement. The tiles filter it (<b>Need attention</b>, consol, FCL). <b>Need attention</b>{" "}
          means outbound cargo whose {TERMS.releaseGates.toLowerCase()} are blocked, or outbound cargo still under customs with no MRN.
        </p>
        <p>
          <b>Scan or type</b>: scan a label (its barcode and QR code carry the {TERMS.warehouseRef.toLowerCase()}) or type a reference, {TERMS.jobNo.toLowerCase()},
          container or plate and press Enter — one match opens its job, several are listed, none offers to record a walk-in. <b>Expected today</b> lists the
          positions due at the gate today (by ETA, dock slot or ETA warehouse) that have not arrived yet.
        </p>
        <p>
          The job has four tabs (Overview, Survey, Shipment Management, History); the open tab is kept in the address, so a shared link opens the same tab. Fields
          save when you leave them. The header shows the customer, the <b>{TERMS.jobNo}</b> (a link to the shipment, when the position is linked) and{" "}
          <b>Shipment Details</b> (the position&rsquo;s Remeasurement / Release). <b>History</b> lists everything logged on the record, newest first, filtered by
          kind; a manager can void a current stamp from there too.
        </p>
        <p>
          The Vehicle card shows the incoming truck (IN leg) for inbound cargo and the outgoing truck (OUT leg) for outbound cargo.
        </p>
      </Part>

      <Part title={`${TERMS.floorMode}: phones and handheld scanners`}>
        <p>
          <b>{TERMS.floorMode}</b> (button in the Warehouse header and the Gate Log) is the Warehouse for a phone held in one hand. It covers the whole screen;{" "}
          <b>×</b> goes back to the desk view. Home is a scan box and <b>Expected today</b> (earliest dock slot first). Scan a label with the handheld scanner
          (or type, after <b>Keyboard</b>; or <b>Scan with camera</b> where the phone&rsquo;s browser can read barcodes — Chrome on Android over https) and the
          position opens.
        </p>
        <p>
          A position shows the {TERMS.warehouseRef.toLowerCase()}, {TERMS.jobNo.toLowerCase()}, {TERMS.direction.toLowerCase()}, customs status,{" "}
          {TERMS.pieces.toLowerCase()} / weight / volume, the {TERMS.dockSlot.toLowerCase()} and the gate steps. The next step is one big button at the bottom —
          same order, same confirmation and the same shipment write-back as on the gate job. From there: the survey of the pass due now (one container per
          screen), photos with the phone camera, damage / short / over, the {TERMS.pickupPin} check (outbound) and the release readiness. <b>Open full gate job</b>{" "}
          has everything else.
        </p>
        <p>
          <b>Handheld scanners everywhere</b>: on any Warehouse page, a scan made while no field is focused opens that position (its gate job; its floor screen in
          floor mode). A scanner is told apart from typing by its speed, so typing in fields is never affected. Scanners must end each code with Enter (or Tab);
          a scanner set to the wrong keyboard layout (Czech number row, Y and Z swapped) is still read.
        </p>
        <p>
          <b>No connection</b>: the header shows <b>Offline</b>. Stamps (all but the {TERMS.whRelease}), survey saves, exceptions and photos are kept on the phone —{" "}
          <b>{TERMS.waitingToSend} (n)</b> — and sent in order, with the time they were made, once it is back online; the log says &ldquo;recorded offline at
          …, sent …&rdquo;. Each is applied once: one already stamped (by this phone or someone else) is reported, not doubled, and a survey older than the one
          stored is not applied. The {TERMS.pickupPin} check and the {TERMS.whRelease} need a connection. Items older than 12 hours, or refused by the server,
          stay in the list until you try again or discard them; items of another user wait until that user signs in. Keep the floor page open while offline —
          reloading it without a connection does not work.
        </p>
      </Part>

      <Part title="Gate stamps, step by step">
        <p>The job header shows the stamps as steps in the order of the work for the cargo&rsquo;s direction:</p>
        <ul>
          <li>
            <b>{TERMS.inbound}</b> (export cargo coming in): {TERMS.gateIn} → {TERMS.draftReceipt} → {TERMS.receipt} → {TERMS.gateOut}.
          </li>
          <li>
            <b>{TERMS.outbound}</b> (import cargo going out): {TERMS.gateInTruck} → {TERMS.whRelease} → {TERMS.gateOut}. {TERMS.whRelease} stamps the gate-out at the
            same time.
          </li>
        </ul>
        <p>
          A done step is a green tag with the time and who stamped it. The next step is the one blue button; later steps are greyed out, and hovering shows why (for
          example &ldquo;Stamp {TERMS.gateIn} first&rdquo;, or which release gates are still missing). A refused movement takes no more stamps.
        </p>
        <p>
          Stamps are final. Each one asks for confirmation first and says what it writes to the shipment. Each stamp is one single database update, so two people
          clicking at once cannot stamp twice — the second gets &ldquo;already stamped&rdquo;. If {TERMS.gateIn} was not stamped, {TERMS.draftReceipt} or{" "}
          {TERMS.receipt} stamps it too.
        </p>
        <p>
          A wrong stamp can be <b>voided</b> by a manager: click the done step and choose &ldquo;Void this stamp…&rdquo;, with a reason. Later steps are voided
          first (the receipt before its draft, everything after the gate-in before the gate-in, an outgoing gate-out before its {TERMS.whRelease}); voiding the {TERMS.whRelease} also voids the gate-out stamped with
          it, and that gate-out is not voided on its own. The status follows the stamps that remain, and who, when, the old stamp and the reason are logged. The shipment is not changed back — when the stamp
          already set its warehouse date, the job logs &ldquo;Shipment may need correcting&rdquo;; correct it in Shipments.
        </p>
        <p>
          The Gate Log has the same stamps for the ticked rows, in the same order. Rows a stamp does not apply to are skipped and named in the confirmation: receipts
          are for inbound cargo only, {TERMS.whRelease} for outbound cargo with clear release gates.
        </p>
      </Part>

      <Part title="What the gate writes to the shipment">
        <p>Only positions imported from Shipments are linked; copied and blank positions write nothing back.</p>
        <ul>
          <li>
            <b>{TERMS.gateIn}</b> (also when stamped through a receipt): the shipment&rsquo;s warehouse received date and warehouse reference (WCZ…).
          </li>
          <li>
            <b>{TERMS.whRelease}</b> (or the gate-out of outbound cargo): the warehouse released date and the plate the cargo left on.
          </li>
          <li>The gate-out of inbound cargo writes nothing yet.</li>
          <li>
            <b>{TERMS.tickOff}</b> at the stripping tally of an import container: the house&rsquo;s warehouse received date and warehouse reference (as the
            inbound receipt does).
          </li>
          <li>
            <b>{TERMS.containerGateOut}</b> of a stuffed export container: for every stuffed house, the warehouse released date and the container&rsquo;s truck
            plate (if any). A plate entered on the container after its gate-out is sent too.
          </li>
        </ul>
        <p>
          The stamp and the shipment update it owes are saved together. The update is sent straight away; if Shipments cannot take it then, it is retried
          automatically (every few minutes, then hourly). Until it goes through the job shows &ldquo;Shipment not updated yet — retrying&rdquo; with <b>Retry now</b>,
          and the Gate Log row a <b>Retrying</b> badge. An update Shipments refuses for good (for example the shipment no longer exists) shows &ldquo;Shipment not
          updated&rdquo;: set it in Shipments by hand, then dismiss it.
        </p>
        <p>
          The <b>customs status</b> of a linked record follows its shipment until the cargo is released: it is read again when the job is opened (at most every 30
          seconds), when the Gate Log loads (every 5 minutes), or straight away with the refresh button on the Customs status card. A change updates the Customs line
          of the release gates and is logged. A status set by hand on a linked record is overwritten the next time it is read.
        </p>
      </Part>

      <Part title="Delete, archive and restore">
        <ul>
          <li>Anyone can delete a gate record that has no stamps. It is archived, not erased.</li>
          <li>
            A record with stamps can only be <b>archived</b> by a manager (admin or manager), with a reason. Its position stays.
          </li>
          <li>
            <b>Show archived</b> in the Gate Log lists archived records with when, who and why. Records deleted before archiving existed show &ldquo;Deleted before
            archiving existed&rdquo;.
          </li>
          <li>
            A manager can <b>restore</b> an archived record from its job, with a reason. A position removed with it comes back too — unless its shipment was imported
            again meanwhile.
          </li>
        </ul>
      </Part>

      <Part title={TERMS.releaseGates}>
        <p>
          Outbound cargo may only be released when its release gates are <b>{TERMS.clear}</b>. The lines depend on the operation (LCL or FCL), for example B/L or
          release order, Customs, Charges, Storage settled, delivery order, interchange.
        </p>
        <ul>
          <li>Anyone can tick a line OK once it is met, or untick it back to Pending. Every change is logged on the movement with who and when.</li>
          <li>
            <b>Customs</b> is not ticked by hand: it follows the customs status and is OK only at &ldquo;Customs Cleared/Released&rdquo;.
          </li>
          <li>The empty return line never holds the release.</li>
          <li>
            <b>Refuse</b> (with a reason) blocks the release. A <b>supervisor override</b> (admin or manager, with a reason) clears it whatever the lines say; both
            are logged.
          </li>
          <li>
            The indicator reads <b>{TERMS.clear}</b> or <b>{TERMS.blocked}</b> (with what it is waiting for). After the {TERMS.whRelease} stamp it reads{" "}
            <b>{TERMS.released}</b> and the lines no longer change.
          </li>
        </ul>
      </Part>

      <Part title="Survey">
        <p>
          Each container (or the position itself when it has none) is surveyed twice: the <b>receipt</b> pass once the cargo has arrived, and the <b>release</b> pass
          once it is released or gated out. The two passes are kept apart.
        </p>
        <p>
          The Survey tab shows a red <b>!</b> while the pass due now is missing on any container, and a green <b>✓</b> when all are done. A survey can be printed once
          each condition flag has at least one photo.
        </p>
      </Part>

      <Part title="Remeasurement / Release and pick-up">
        <p>
          This tab shows the warehouse part of one imported shipment: its details, notes, the remeasured dimensions (with Inform Operations when they differ) and the
          push to suppliers. Open it from the {TERMS.jobNo} in Positions or from Shipment Details in the job. Shipments shows the same part read-only, with a link back
          here.
        </p>
        <p>
          Each part saves on its own (notes, remeasured lines, each &ldquo;sent&rdquo; mark), so two people working on different parts never overwrite each other. If
          someone else saved the same part meanwhile, your save is refused with &ldquo;Someone else changed this meanwhile&rdquo;: the page reloads their version,
          your notes text stays in the box — check it and save again.
        </p>
        <p>
          <b>Pick-up</b> works the other way round: operations enter the pick-up (haulier, plate, driver) in Shipments and generate the {TERMS.pickupPin} there
          — six digits made by the server. The warehouse sees it here, read-only.
        </p>
        <p>
          The warehouse releases against that PIN. In the Gate Log job of an outbound position linked to the shipment, the {TERMS.pickupPin} card shows the
          pick-up rows next to the truck at the gate. Type the PIN the driver gives and press <b>Check PIN</b>: a match sets the release gate &ldquo;Pick-up PIN
          verified&rdquo; to OK (logged with who and when) — it cannot be ticked by hand. After 3 wrong tries the PIN is locked; operations then make a new PIN in
          Shipments, which sets the line back to Pending.
        </p>
      </Part>

      <Part title="Labels">
        <ul>
          <li>
            <b>Print labels</b> is in the job header, the Gate Log toolbar and the Positions bulk bar. Several positions print into one PDF, one label per page.
          </li>
          <li>
            Choose one label per position, or one per piece marked <b>n / N</b> (N = {TERMS.pieces.toLowerCase()}). One print holds at most 500 labels.
          </li>
          <li>
            The QR code holds only the {TERMS.warehouseRef.toLowerCase()}, and a Code 128 barcode of the same reference is printed for hand scanners. A reference with
            characters a barcode cannot carry prints without one.
          </li>
          <li>Every print is logged on the movement as &ldquo;Label printed&rdquo;, later ones as &ldquo;Label reprinted&rdquo;, with the number of labels.</li>
        </ul>
      </Part>

      <Part title="Remeasurement / Release">
        <ul>
          <li>
            Opened for one position: the header (reference, {TERMS.jobNo}, customer, status, customs, days in the warehouse and free time, chargeable W/M), the cargo
            comparison — declared on the shipment, received at the gate, remeasured — with the differences beyond the tolerance (any piece, or more than 5 % on
            weight or volume), the remeasured lines, notes, &ldquo;Mark as sent&rdquo; with its history, the exceptions and the release readiness.
          </li>
          <li>
            Lines: Tab moves Qty → L → W → H → kg, Enter adds a line. One <b>Save changes</b> bar saves notes and lines together; leaving with unsaved changes asks
            first. <b>Use remeasured figures for the warehouse</b> sets the gate figures from the saved lines — the shipment&rsquo;s cargo is never changed.
          </li>
          <li>With no position open it lists the positions waiting for remeasurement (in the warehouse, no lines saved) or release (outbound, not released).</li>
          <li>The release itself is stamped on the gate job (&ldquo;Open gate job to release&rdquo;).</li>
        </ul>
      </Part>

      <Part title="Containers, stripping and stuffing">
        <p>
          A container holds many positions — its <b>houses</b>; a position is in at most one container at a time. The container page shows its stamps in
          order, the houses, the totals against the capacity of its type and its log. <b>Floor mode</b> on the container page (or scanning the container number
          in floor mode) opens the same list on a phone.
        </p>
        <ul>
          <li>
            <b>{TERMS.importContainer}</b> (outbound cargo): {TERMS.containerGateIn} → (start stripping) → the <b>{TERMS.strippingTally}</b>: count each house
            (pieces, condition, location) and <b>Tick received</b> — that is its receipt: the free time starts that day and the shipment gets the received date
            and the WCZ reference. A house not (fully) there is marked {TERMS.short.toLowerCase()} / {TERMS.notArrived.toLowerCase()} with a reason; a count that
            differs offers a Short / Over exception. Stripping is complete when every house is accounted for; then the {TERMS.containerGateOut}. The WH release of
            a house waits for its tick-off.
          </li>
          <li>
            <b>{TERMS.exportContainer}</b> (inbound cargo): the <b>{TERMS.stuffingPlan}</b> — add positions in the warehouse (received, not on hold, not in another
            container; by POD, then ETD), order them by dragging or with the arrows, watch the fill. {TERMS.containerGateIn} (empty at the dock) → mark each house{" "}
            <b>{TERMS.stuffed}</b> → <b>{TERMS.closeContainer}</b> with the seal → {TERMS.containerGateOut} with the truck plate: every stuffed house leaves the
            warehouse (its storage clock stops; its shipment gets the released date and the plate). Planned houses not stuffed stay in the warehouse.
          </li>
          <li>
            The close and the gate-out need a connection; the gate-in, the start of stripping, tally ticks and stuffed marks also work offline in floor mode. A
            manager voids a container stamp or a tally tick with a reason (logged); voiding an export gate-out brings its houses back into the warehouse.
          </li>
          <li>
            <b>{TERMS.reweigh}</b>: LCL cargo is re-weighed on receipt — inbound before the {TERMS.receipt} stamp, import before its tick-off. The re-weighed weight
            shows on the gate job, in the Remeasurement / Release cargo comparison and with &ldquo;Mark VGM as sent&rdquo;; more than 5 % off the declared weight is a
            variance.
          </li>
          <li>
            The <b>{TERMS.lifecycle}</b> of each position (Positions column, gate job, floor mode): Expected → Arrived → Received → In warehouse → Stuffed / Ready for
            release → Left.
          </li>
        </ul>
      </Part>

      <Part title="The other tabs">
        <ul>
          <li>
            <b>Containers</b>: every container with its houses (one container, many positions), its kind, status, totals and fill against its capacity. A row
            opens the container page — see &ldquo;Containers, stripping and stuffing&rdquo;.
          </li>
          <li>
            <b>Dock &amp; Yard</b>: dock schedule, yard / container park, labour and equipment. A {TERMS.dockSlot.toLowerCase()} is booked for a position
            (pick it in the form, or <b>Book dock slot</b> on the gate job) with a date, time and duration; direction, reference, party and vehicle come from
            the position. The same dock door cannot be booked twice for overlapping times — the form says which booking is in the way. Cancelled and Completed
            slots free the door. Slots booked before this link stay editable without a position.
          </li>
          <li>
            <b>Stock</b>: stock on hand, locations and occupancy, movements, ageing and free time, bonded register.
          </li>
          <li>
            <b>Reports</b>: throughput, consol utilisation, quality and claims, report library. The line on top shows shipment updates still pending or failed,
            and the cargo in the warehouse by free time.
          </li>
        </ul>
        <p>The sub-tab you are on is kept in the address too.</p>
      </Part>

      <Part title="Keyboard">
        <ul>
          <li>Tab to the tab bar and use the arrow keys to move between tabs.</li>
          <li>In a grid, Tab moves through the rows and Enter opens the row.</li>
          <li>
            <b>/</b> jumps to the grid&rsquo;s search when you are not typing in a field.
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
}
