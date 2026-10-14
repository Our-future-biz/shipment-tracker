"use client";

// Read me of the Warehouse module — the review note from the Warehouse prototype (v0.6),
// shown as it was written, in the app's card style.
export function ReadmeTab() {
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                What this file is
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                  prototype v0.6
                </span>
              </div>
            </div>
            <div className="p-4 text-[13px] leading-relaxed text-slate-600">
              <p className="mt-0 mb-2.5">
                A working front-end prototype of a <b>Warehouse module</b> for an internal freight
                forwarding application (Shipment Tracker). It is a single self-contained HTML file —
                no server, no build step, no external libraries, no internet connection needed. Open
                it in any modern browser and everything works.
              </p>
              <p className="mt-0 mb-2.5">
                The purpose is to agree <b>screens, fields and behaviour</b> before development
                starts. It is not production software: all data is mock data held in memory, and
                nothing is saved. Refreshing the page resets it.
              </p>
              <p className="m-0">
                <b>The operation being modelled</b> is a consolidator / CFS warehouse in the Czech
                Republic handling LCL import and export: cargo received against a warehouse
                position, surveyed, stored, consolidated into containers or devanned out of them,
                then released in one or several runs.
              </p>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                v0.5 — Gate Log (gate desk workstation)
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500 normal-case">
                  council-ruled before build
                </span>
              </div>
            </div>
            <div className="p-4 text-[13px] leading-relaxed text-slate-600">
              <p className="mt-0 mb-2">
                <b>What it is.</b> The gate clerk&rsquo;s workstation — one row per expected
                movement (position, WCZ-n run, or FCL box), carrier / driver / plate written once at
                the gate and written back to the position. <b>Placement (per Lukáš):</b> Gate Log
                lives in the MAIN navigation as a subsection nested under Warehouse — one click from
                anywhere in the application, and it reads as what it is: a separate workstation, not
                another module tab. The Council had granted a module-tab placement as a workstation
                exception; the main-menu subsection supersedes it and serves the same argument
                better. In production the natural key is the vehicle visit (one truck, several rows)
                — the two TQM rows in the seed share a plate to show the grouping requirement.
              </p>
              <p className="mt-0 mb-2">
                <b>Layout (per Lukáš&rsquo;s sketch).</b> The dashboard is three tiles, all of them
                filters:
                <b>Need attention</b> (missing release authorisation or missing MRN),{" "}
                <b>Consol shipments</b> (LCL) and
                <b>FCL shipments</b> — click to filter the grid, click again to clear. The grid
                shows the sketched columns in order: Gate ref · Handling · Operation · Packing ·
                Weight · Measure · Customer · Customer contact · Shipment owner · Customs docs · MRN
                · Customs status · Release · PIN. Everything else the gate desk sometimes needs
                (Příjem/výdej, Colli, Status, Slot, Carrier, Driver, Plate) lives behind the{" "}
                <b>Columns</b> button — nothing was deleted, the default view is just clean.{" "}
                <i>Open question:</i> &ldquo;Gate ref&rdquo; currently shows the movement ID (WCZ…-n
                or the container number). If you want a separate gate series (GL-26-0001 per vehicle
                visit), say so.
              </p>
              <p className="mt-0 mb-2">
                <b>Release box + PIN.</b> The tick is a derived view of the position&rsquo;s
                release-gate panel, never hand-set. The PIN is never displayed — the clerk types
                what the driver says and gets match / no match; three failures lock the row to
                supervisor. Overrides log who, when, a snapshot of the gates at that moment, and a
                mandatory reason — and badge the row &ldquo;released on override&rdquo;. Screens at
                the gate face outward: no charges, no other customers&rsquo; data (see the Gate
                clerk role in Users &amp; permissions).
              </p>
              <p className="mt-0 mb-2">
                <b>Flow.</b> Expected → At gate → In progress → Done, plus <b>Refused</b> (mandatory
                reason — the refusal entry is the evidence when a haulier bills waiting time) and
                No-show. Import → WH release stamps date+time; Export → draft receipt stamps Export
                draft, confirming converts to Export receipt. Every stamp files a Documents row
                automatically; Documents are <b>append-only</b> — a confirmed receipt never deletes
                its draft (superseded badge instead), because the delta between them is claims
                evidence.
              </p>
              <p className="mt-0 mb-2">
                <b>Checklist.</b> Six icons — HT (ISPM-15), Photos, Measure, VGM, Seal, DG/ADR —
                green done / amber pending / red problem / grey n/a. HT keys off the heat-treatment
                service; VGM applies to export boxes only; Seal reuses the interchange state; DG
                must be green before the truck enters the yard. Walk-ins hold at the fence: the gate
                creates an <i>unlinked</i> row and notifies ops — the gate captures events, ops
                creates work.
              </p>
              <p className="m-0">
                <b>Spec-only:</b> real PIN generation and supervisor authentication, vehicle-visit
                grouping key, ANPR / weighbridge, GDPR retention for driver data, kiosk mode,
                driver-facing CZ/EN slip, SMS to driver.
              </p>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                v0.4 — statuses, carrier booking, full Survey
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500 normal-case">
                  council-ruled before build
                </span>
              </div>
            </div>
            <div className="p-4 text-[13px] leading-relaxed text-slate-600">
              <p className="mt-0 mb-2">
                <b>Three status fields</b>, three different mechanics by ruling:{" "}
                <b>Customs status</b>
                is manual (the clerk is the source of truth) with a CZ lifecycle list constrained by
                customs mode — it cannot reach Propuštěno without an MRN. <b>Invoicing status</b> is
                strictly derived from the charge lines (No charges · Accruing · Ready to invoice ·
                Partly billed · Billed · Dispute open) — money arguments belong in the lines, not a
                dropdown. <b>Shipment status</b> is a read-only mirror of the linked CZ job, dash
                when unlinked.
              </p>
              <p className="mt-0 mb-2">
                <b>Carrier booking proklik</b> works off a URL template per carrier (&#123;ref&#125;
                placeholder, seeded for Maersk/MSC/Hapag/ONE/CMA CGM) — ops record the booking
                reference they need anyway and never paste URLs. Grid and tile both deep-link.
              </p>
              <p className="mt-0 mb-2">
                <b>Survey is now built</b> (the reference print screen never arrived, so it is built
                from the agreed field list): one record per container with a selector,{" "}
                <b>two passes</b> — receipt documents inherited damage, release closes our custody
                window — damaged/lost counts inside each pass, your original checkbox lists with
                review-normalised labels (items marked * were added or reworded: crushed, re-taped,
                crate, drum; &quot;pour out&quot; → leaking/spilled; &quot;not visible&quot; → not
                inspected — packaging intact/STC; &quot;bad loose&quot; → loose/unsecured). The
                printed survey carries three signature lines: delivering driver, warehouse surveyor,
                collecting driver.
              </p>
              <p className="mt-0 mb-2">
                <b>Also:</b> container + seal numbers roll up to the grid (transloads show IN →
                OUT), Files renamed to Documents, Transport gains pick-up address and Typ nakládky
                per leg (bok / jeřáb / rampa / plato — CZ stored, EN tooltip), &quot;Total
                pieces&quot; label, intake titled Nová zásilka while the entity stays a warehouse
                position — renaming it &quot;shipment&quot; would collide with the linked forwarding
                shipment and the floor would book charges to the wrong object.
              </p>
              <p className="m-0">
                <b>Spec-only:</b> Settings editor for URL templates, customs-status derivation from
                NCTS/AES messages, live CZ-job status feed, e-signature capture, full CZ/EN i18n.
              </p>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                v0.3 — FCL operations as a sidekick
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500 normal-case">
                  market-scan informed · council-reviewed
                </span>
              </div>
            </div>
            <div className="p-4 text-[13px] leading-relaxed text-slate-600">
              <p className="mt-0 mb-2">
                <b>Scope.</b> LCL consolidation stays the core; v0.3 adds what a CFS needs to run
                single-customer full boxes on the side: <b>operation type</b> on every position (LCL
                consolidation, FCL stuffing, FCL stripping, FCL transload/cross-stuff, cargo
                storage, container yard storage), FCL charge codes (WHS-STF, WHS-STR, WHS-YRD on our
                own yard free time), equipment <b>interchange records</b> (EIR) per container as
                gate-in and gate-out events, a <b>release gate</b> whose checks switch with the
                operation type, and
                <b>detention watch</b> — carrier clocks anchored to terminal gate-out, stopped only
                by the depot&apos;s empty-return receipt, with a D-2 warning notification.
              </p>
              <p className="mt-0 mb-2">
                <b>Two clocks, never welded.</b> The CFS yard tariff (our free days, our invoice,
                from our gate-in) and carrier detention (their free days, their invoice, from
                terminal gate-out) are separate rules in Charges → Free-Time Rules. Detention is an
                exposure alert; WHS-YRD is revenue.
              </p>
              <p className="mt-0 mb-2">
                <b>A transload is two boxes.</b> One position can hold an inbound and an outbound
                container, each with its own interchange passes and its own detention clock — see
                WCZ00000012.
              </p>
              <p className="m-0">
                <b>Spec-only in this version</b> (documented, not built): the EIR document layout,
                the depot-receipt field list, live detention-date computation, real photo capture,
                per-carrier rule editing. Deliberately out of scope entirely: empty-depot business
                (carrier container storage, reefer PTI, M&amp;R) — different P&amp;L, not a
                sidekick.
              </p>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                How to walk through it in five minutes
              </h3>
            </div>
            <div className="p-4">
              <div className="relative pl-5 before:content-[''] before:absolute before:left-1 before:top-1 before:bottom-1 before:w-px before:bg-slate-200">
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">1 · Positions grid</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    The landing screen. Every field of the position header is a column, so the
                    register can be filtered, sorted and exported without opening anything. Try the
                    search box and the three dropdown filters.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">
                    2 · Open WCZ00000008
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    The fully populated record — an import position with one container, four
                    delivery runs, a damage survey and eight files. Click the internal reference in
                    the grid.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">3 · Overview tab</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Change pieces, weight or measure and watch chargeable w/m and loading metres
                    recalculate. Click a service chip to add or remove it. Change free days and the
                    last free day moves.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">
                    4 · Shipment management tab
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Sub-positions — one position delivered in several runs. Parent totals are
                    derived from the children, never typed. Click a row for the detail form.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">5 · Loading tab</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Tick containers and the selection summary updates; choose one packing list for
                    the selection or one per container.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">
                    6 · Back out, then Consolidation → Load Planner
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Cross-position view. Adding cargo recalculates container fill, remaining payload
                    and revenue live.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-white">
                  <div className="text-[13px] font-semibold text-slate-800">
                    7 · Open WCZ00000009
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    A position still in <i>Expected</i> status, so most tabs are legitimately empty.
                    Included on purpose so the empty state is visible.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">
                    8 · New in v0.3 — open WCZ00000012 (FCL transload)
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    The FCL sidekick end to end: two containers on one position (inbound ONE box,
                    outbound CMA CGM box), gate-in/gate-out interchange record on each container, an
                    FCL release-gate set, and an inbound empty at D-2 to detention expiry with the
                    depot slot not yet booked — the exact situation the module exists to catch.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">
                    9 · New in v0.4 — Survey on WCZ00000008
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Open the Survey tab: receipt pass done (2 cases crushed, driver + surveyor
                    recorded), release pass still open. Switch to WCZ00000012 to see a completed
                    two-pass survey. Also try the carrier booking link and the three status columns
                    in the grid.
                  </div>
                </div>
                <div className="relative pb-3.5 before:content-[''] before:absolute before:-left-5 before:top-1 before:w-2.5 before:h-2.5 before:rounded-full before:border-2 before:border-indigo-500 before:bg-indigo-500">
                  <div className="text-[13px] font-semibold text-slate-800">
                    10 · New in v0.5 — Gate Log
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Open Gate Log from the left menu — it sits under Warehouse as its own
                    subsection. Verify a PIN on WCZ00000008-3 (it is 4471 — printed here only for
                    the demo), confirm the draft receipt on WCZ00000007 and watch it convert to
                    Export receipt with the draft kept as superseded, and read the refusal log on
                    WCZ00000006 — bonded cargo, release box never armed.
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                Structure
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500 normal-case">
                  module tabs → position tile tabs
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs readme-table">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      Level
                    </th>
                    <th className="text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      Screen
                    </th>
                    <th className="text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      Contains
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Positions</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Register of warehouse positions (WCZ series) — the landing screen
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Stock
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      On hand · Locations &amp; occupancy · Movements · Ageing &amp; free time ·
                      Bonded register
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Containers
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Container register · Unloading / loading schedule · VGM register
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Consolidation
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Open consols · Load planner · Stuffing &amp; sealing · Consol documents
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Dock &amp; Yard
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Dock schedule · Yard / container park · Labour &amp; equipment
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Charges
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Chargeable events · Tariffs · Free-time rules · Ready to invoice
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Reports
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Throughput · Consol utilisation · Quality &amp; claims · Report library
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-600">
                        Module
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Settings
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Warehouses &amp; zones · Master data · Document templates · Users &amp;
                      permissions · Integration
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Overview
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Position header — identification, cargo, dates, services &amp; customs, gate
                      transport, milestone notifications
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Details
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Parties, routing, cargo particulars — standard shipment information
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Container
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Prefix, number, seal, equipment, pieces, weight, cbm, direction, VGM + date,
                      note
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Survey
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Layout pending</b> — field inventory listed, awaiting the reference screen
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Loading
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Container selection → packing list generation
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Shipment management
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Sub-positions WCZ…-1, -2, -3 with own quantity, transport and VGM
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Invoicing
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Charge lines generated from physical events and ticked services
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Files
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Photos and documents against milestones, object-storage model
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Tile
                      </span>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Transport
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Delivery address, carrier, driver, plate, cost and currency; legs list
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                Design decisions worth challenging
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500 normal-case">the point of the review</span>
              </div>
            </div>
            <div className="p-4 text-[13px] leading-relaxed text-slate-600">
              <p className="mt-0 mb-2.5">
                <b>1 · The warehouse never issues an invoice.</b> Every physical event — receipt,
                put-away, storage day, rework, pick, load — writes a chargeable event against the
                position using the tariff on the customer card. The Invoicing module reads that
                queue. One source of truth, and no argument between operations and finance about
                what actually happened.
              </p>
              <p className="mt-0 mb-2.5">
                <b>2 · Chargeable w/m is derived once, at receipt, from measured dimensions</b> and
                never re-keyed downstream. This is what kills the standard LCL dispute where the
                shipper declares 1.8 cbm and the measurement says 3.05.
              </p>
              <p className="mt-0 mb-2.5">
                <b>3 · A warehouse position is independent of a shipment job.</b> WCZ00000008 can
                exist with no forwarding file, and carries an optional link to one. Pure warehousing
                customers do not need a shipment opened for them.
              </p>
              <p className="mt-0 mb-2.5">
                <b>4 · Parent totals derive from sub-positions.</b> Where a position moves in
                several runs, the children hold the truth and the parent is a sum. The alternative —
                typing both — guarantees they drift.
              </p>
              <p className="mt-0 mb-2.5">
                <b>5 · Release is gate-controlled.</b> B/L, customs, charges and storage each have
                to be green before cargo can be picked. Overriding is a permission, not a button
                everyone has.
              </p>
              <p className="m-0">
                <b>6 · Files live in object storage, not in the database.</b> ~20 MB per position,
                mostly survey photos. See the Files tab of any position for the field list the
                database keeps.
              </p>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                Open questions
              </h3>
              <div className="ml-auto flex items-center gap-2">
                <span className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold bg-amber-50 text-amber-700">
                  input wanted
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs readme-table">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      Topic
                    </th>
                    <th className="text-left px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-50 border-b border-slate-200">
                      Question
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Survey</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Layout not yet drawn — reference screen awaited. Is a survey one record per
                      container, or one per position with a container selector?
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Survey</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Should the printed survey carry a driver signature line? Recommended — it is
                      what makes the evidence hold when liability is argued.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Interchange</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      v0.3 position: the driver signs the EIR at our gate in both directions; the
                      depot signs the empty return and we file their receipt as proof the detention
                      clock stopped. Confirm this matches the carriers&rsquo; depot practice we use.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Detention data</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Detention free days come off the booking, not a static table — the per-carrier
                      rows in Free-Time Rules are defaults with a per-booking override. Who
                      maintains the overrides: ops or pricing?
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Load WH date</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Read here as the date cargo entered the warehouse, with OUT WH date as the
                      date it left. Confirm, or relabel.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>PIN</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      On the Transport tab, read as a delivery / gate PIN. If it means postcode
                      (PSČ) the label changes.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Currency</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Placed against transport cost with a derived CZK value at ROE. If it is the
                      position&rsquo;s invoicing currency it belongs on Invoicing instead.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Free time</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Counted from the receipt date, calendar days including weekends, unless the
                      customer card overrides. Correct for import as well as export?
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Notifications</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Sent by the application directly, or drafted for an operator to approve first?
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      <b>Multi-site</b>
                    </td>
                    <td className="px-4 py-2 border-b border-slate-100 align-top text-slate-600">
                      Two warehouses are listed but the prototype holds single-site data. Do
                      positions ever move between sites?
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                Notes for whoever builds this
              </h3>
            </div>
            <div className="p-4 text-[13px] leading-relaxed text-slate-600">
              <p className="mt-0 mb-2.5">
                <b>Where the data is.</b> Everything sits in a single <code>DB</code> object at the
                top of the second script block: <code>DB.positions</code>, <code>DB.subpos</code>,{" "}
                <code>DB.tileCtn</code>,<code>DB.files</code>, <code>DB.legs</code>,{" "}
                <code>DB.posCharges</code>, plus the cross-position arrays. Replace each array with
                an API response and the screens work unchanged.
              </p>
              <p className="mt-0 mb-2.5">
                <b>Rendering.</b> One generic{" "}
                <code>table(name, mountId, columns, rows, options)</code>
                helper draws every grid, with search, dropdown filters and column sorting built in.
                Column definitions are declarative, so adding or removing a field is a one-line
                change.
              </p>
              <p className="mt-0 mb-2.5">
                <b>Derived fields</b> are marked in the interface with a blue tint and are
                read-only: chargeable w/m, loading metres, last free day, storage state, container
                fill, sub-position roll-ups, transport cost in CZK. None of them should ever be
                stored as typed input.
              </p>
              <p className="m-0">
                <b>Deliberately not built:</b> persistence, authentication, real file upload, PDF
                generation, e-mail sending, and the Survey layout. Buttons for those actions are
                present and produce a confirmation message so the intended flow is visible.
              </p>
            </div>
          </div>
          <div className="h-5"></div>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="px-4 py-2.5 flex items-center gap-2.5 bg-indigo-50 border-b border-indigo-100 rounded-t-xl">
              <h3 className="text-[13px] font-bold text-slate-800 uppercase tracking-wider m-0">
                Known limits of the prototype
              </h3>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  nothing persists on refresh
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  single-site data; warehouse selector is decorative
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  dock board is hour-granular
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  zone occupancy outside seeded stock is randomised
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  QR image is a placeholder pattern
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  no permissions enforced — every screen is visible
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  dates render in the browser&rsquo;s locale
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  survey print + e-signature are mocked
                </span>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-500">
                  detention dates are seeded, not computed
                </span>
              </div>
              <div className="mt-3.5 bg-white border border-slate-200 border-l-[3px] border-l-indigo-500 rounded-lg px-3.5 py-2.5 text-xs text-slate-600 leading-relaxed">
                Reviewed something that looks wrong? The most useful feedback is which{" "}
                <b>field is missing</b>, which
                <b>field never gets filled in real life</b>, and where the{" "}
                <b>sequence of screens does not match how the floor actually works</b>. Cosmetic
                points are cheap to change later; a wrong data model is not.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
