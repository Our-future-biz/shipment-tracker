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
          <b>{TERMS.warehouseRef}</b> (WCZ…). Everything about a position is kept on one page, its <b>Gate Log job</b>.
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
            The <b>{TERMS.jobNo}</b> link opens the shipment&rsquo;s warehouse part in Remeasurement / Release.
          </li>
          <li>
            <b>Create new</b> has two kinds of position:
            <ul className="mt-1">
              <li>
                <b>Copy from {TERMS.jobNo}</b>, <b>Copy from quote</b> or <b>Create blank</b>: a position of its own. The values are copied once and nothing stays linked,
                so the gate writes nothing back to Shipments. You go straight to its Gate Log job.
              </li>
              <li>
                <b>Import from Shipments</b> or <b>Import from Master Jobs</b>: one position per ticked shipment, linked to it. A shipment that is already in the warehouse
                keeps its position.
              </li>
            </ul>
          </li>
          <li>The tiles above the grid filter it (open consol outbound / inbound containers, open shuttle trucks), and so does the FCL / LCL switch.</li>
          <li>
            Tick rows to <b>Print labels</b> or <b>Remove from warehouse</b>. A removed position&rsquo;s reference is retired, not reused; the shipment is not affected.
          </li>
        </ul>
      </Part>

      <Part title="Gate Log and the job">
        <p>
          The Gate Log tab is the gate clerk&rsquo;s list: one row per gate movement. The tiles filter it (<b>Need attention</b>, consol, FCL). <b>Need attention</b>{" "}
          means outbound cargo whose {TERMS.releaseGates.toLowerCase()} are blocked, or outbound cargo still under customs with no MRN.
        </p>
        <p>
          The job has three tabs (Overview, Survey, Shipment Management); the open tab is kept in the address, so a shared link opens the same tab. Fields save when
          you leave them. The header shows the customer, the <b>{TERMS.jobNo}</b> (a link to the shipment, when the position is linked) and <b>Shipment Details</b>{" "}
          (the shipment&rsquo;s Remeasurement / Release).
        </p>
        <p>
          The Vehicle card shows the incoming truck (IN leg) for inbound cargo and the outgoing truck (OUT leg) for outbound cargo.
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
        </ul>
        <p>The stamp stands even if the shipment cannot be updated at that moment.</p>
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
          <b>Pick-up</b> works the other way round: Shipments enters the pick-up and generates the PIN; the warehouse only sees it here.
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

      <Part title="The other tabs">
        <ul>
          <li>
            <b>Containers</b>: the container register with its unloading / loading schedule and VGM.
          </li>
          <li>
            <b>Dock &amp; Yard</b>: dock schedule, yard / container park, labour and equipment.
          </li>
          <li>
            <b>Stock</b>: stock on hand, locations and occupancy, movements, ageing and free time, bonded register.
          </li>
          <li>
            <b>Reports</b>: throughput, consol utilisation, quality and claims, report library.
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
