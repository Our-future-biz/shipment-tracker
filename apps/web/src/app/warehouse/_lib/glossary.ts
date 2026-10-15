// One set of words for the Warehouse module: screens, Gate Log, labels, Read me and exports.
// Display only — stored values stay as they are (handling "Import" / "Export" / "Domestic", visit
// "příjem" / "výdej"), and so do the API fields.

export const TERMS = {
  warehouseRef: "Warehouse ref",
  jobNo: "Job no.",
  direction: "Direction",
  inbound: "Inbound",
  outbound: "Outbound",
  domestic: "Domestic",
  releaseGates: "Release gates",
  clear: "Clear",
  blocked: "Blocked",
  whRelease: "WH release",
  released: "Released",
  warehouseStatus: "Warehouse status",
  pieces: "Pieces",
  weightKg: "Weight kg",
  volumeCbm: "Volume cbm",
  plate: "Plate",
  driver: "Driver's name",
  gateIn: "Gate-in",
  gateInTruck: "Gate-in (truck)",
  draftReceipt: "Draft receipt",
  receipt: "Receipt",
  gateOut: "Gate-out",
  pickupPin: "Pick-up PIN",
  archived: "Archived",
  voidStamp: "Void a stamp",
  floorMode: "Floor mode",
  dockSlot: "Dock slot",
  waitingToSend: "Waiting to send",
  reweigh: "Re-weigh (VGM)",
  importContainer: "Import container (stripping)",
  exportContainer: "Export container (stuffing)",
  stuffingPlan: "Stuffing plan",
  stuffed: "Stuffed",
  closeContainer: "Close (seal)",
  strippingTally: "Stripping tally",
  tickOff: "Tick off (Received)",
  short: "Short",
  notArrived: "Not arrived",
  containerGateIn: "Container gate-in",
  containerGateOut: "Container gate-out",
  lifecycle: "Lifecycle",
  capacity: "Capacity / fill",
  house: "House",
  customsDeadline: "Customs deadline",
  temporaryStorage: "Temporary storage",
  customsWarehouse: "Customs warehouse",
  bondedRegister: "Bonded register",
  manualLine: "Manual line",
  autoLine: "Auto",
  buildStock: "Build stock from gate records",
  dwellTime: "Dwell time",
  gateToReceipt: "Gate-to-receipt time",
  receiptToRelease: "Receipt-to-release time",
  dockUtilisation: "Dock utilisation",
  onTimeVsSlot: "On time vs dock slot",
  reweighVarianceRate: "Re-weigh variance rate",
  exceptionRate: "Exception rate",
  warehouseSettings: "Warehouse settings",
  supplierEmail: "Supplier e-mail",
  recordedOnly: "Recorded only",
} as const;

// What each term means, for the glossary in the Read me.
export const GLOSSARY: { term: string; meaning: string; replaces?: string }[] = [
  {
    term: TERMS.warehouseRef,
    meaning:
      "The position's own WCZ reference: WCZ, the year and a six-digit number that rises by one for every new position (e.g. WCZ2026000001), starting again each year. Older references (WCZ + date + two digits) keep their number. It is on the label, the QR code and the barcode.",
    replaces: "Gate ref, Internal ref., Warehouse Ref",
  },
  { term: TERMS.jobNo, meaning: "The shipment's job number (its internal reference in Shipments). Copied positions keep it as text only.", replaces: "Internal Reference" },
  { term: `${TERMS.direction}: ${TERMS.inbound} / ${TERMS.outbound} / ${TERMS.domestic}`, meaning: "Inbound cargo comes into the warehouse (export cargo). Outbound cargo leaves it (import cargo). Domestic cargo (Trucking's LTL through our warehouse) comes in at the gate-in and leaves through the WH release, which stamps the gate-out — no customs, no pick-up PIN.", replaces: "Trade direction Import / Export / Domestic, příjem / výdej" },
  { term: `${TERMS.releaseGates}: ${TERMS.clear} / ${TERMS.blocked}`, meaning: "Whether outbound cargo may be released: Clear when every release gate is OK (or a supervisor overrode), Blocked otherwise.", replaces: "Armed / NOT armed" },
  { term: TERMS.whRelease, meaning: "The stamp that releases outbound cargo. It also stamps the gate-out." },
  { term: TERMS.released, meaning: "Warehouse status after the WH release stamp. Used only as a status." },
  { term: TERMS.warehouseStatus, meaning: "Expected, In Warehouse, Released or Refused. It moves only through the stamps, Refuse and the supervisor override.", replaces: "Shipment status" },
  { term: TERMS.pieces, meaning: "Number of pieces (packages).", replaces: "Colli, Pcs, Total pieces" },
  { term: TERMS.weightKg, meaning: "Gross weight in kilograms.", replaces: "Gross kg, Gross weight" },
  { term: TERMS.volumeCbm, meaning: "Volume in cubic metres.", replaces: "Measure, CBM, Total volume (m³)" },
  { term: TERMS.plate, meaning: "The truck's licence plate.", replaces: "SPZ, License plate, Plate number" },
  {
    term: TERMS.pickupPin,
    meaning:
      "Six digits operations make in Shipments (Warehouse tab → Pick-up) and give to the haulier. At the outbound gate the clerk types the PIN the driver gives; a match sets the release gate \"Pick-up PIN verified\" to OK. After 3 wrong tries the PIN is locked until operations make a new one.",
    replaces: "PIN",
  },
  {
    term: TERMS.archived,
    meaning:
      "A gate record taken out of the Gate Log but kept, with who, when and why. A record without stamps can be deleted by anyone (it is archived); one with stamps only by a manager, with a reason. Show archived in the Gate Log lists them; a manager can restore one.",
    replaces: "Deleted",
  },
  {
    term: TERMS.voidStamp,
    meaning:
      "A manager clears a wrong stamp from its step (with a reason, logged). Later steps are voided first. The shipment is not changed back — if the stamp already set its warehouse date, correct it in Shipments.",
  },
  {
    term: "Free time / storage",
    meaning:
      "One calculation everywhere in the warehouse. The clock starts at the receipt — the gate-in for inbound cargo; for outbound cargo the tick-off at the stripping tally of its container (without a container tally, the “Received in warehouse” date) — and stops when the cargo leaves — the WH release (or gate-out) of outbound cargo, the gate-out of the export container inbound cargo was stuffed in (or its WH release). An inbound truck's gate-out is only the delivering truck leaving and does not stop it. Calendar days in Prague time; the receipt day is day 1. After the free days (7 unless set on the record) storage is CZK 22 per W/M a day, at least CZK 120. Expiring = 2 free days left or fewer.",
  },
  {
    term: "Exception / On hold",
    meaning:
      "Damaged, short or over cargo recorded on the gate job (from a survey or by hand). While one is open the cargo is on hold: the release gate “No open exceptions” is Blocked and the WH release is refused unless a supervisor overrides. Anyone resolves it with a note; both are logged.",
    replaces: "OS&D",
  },
  {
    term: TERMS.floorMode,
    meaning:
      "The Warehouse on a phone or handheld scanner (button Floor mode in the Warehouse header and the Gate Log): scan a label, then stamp the next gate step with one big button, re-weigh LCL cargo, do the survey with photos from the phone camera, record damage / short / over and check the pick-up PIN. Scanning a container number opens its tally (import) or stuffing (export) list. The same steps, rules and confirmations as the gate job.",
  },
  {
    term: TERMS.waitingToSend,
    meaning:
      "Floor mode without a connection: stamps (except the WH release), surveys, exceptions, photos, re-weighs, tally ticks, stuffed marks and a container's gate-in / start of stripping are kept on the phone and sent in order, with the time they were made, as soon as it is back online. Each is applied once; one stamped meanwhile by someone else is reported, not doubled. The PIN check and the WH release need a connection, and so do a container's close and gate-out. Items older than 12 hours are not sent.",
  },
  {
    term: TERMS.dockSlot,
    meaning:
      "A dock door booked for a position in Dock & Yard → Dock Schedule (date, time, duration). The same door cannot be booked twice for overlapping times; Cancelled and Completed slots free it. The slot shows on the gate job and in floor mode, and Expected today uses its time.",
    replaces: "Slot (free text)",
  },
  {
    term: TERMS.reweigh,
    meaning:
      "The warehouse re-weighs every LCL shipment (operation type LCL, or load type Consolidation) when it is received: inbound cargo before the Receipt stamp, import cargo before its house is ticked off at the stripping tally. Weighed gross kg, who, when, an optional scale photo and a note. It is compared with the declared weight of the shipment (the gate weight when there is none): more than 5 % off is a variance — flagged, and Operations can be informed. A correction is a new re-weigh: the history is kept and the latest counts. It turns the gate checklist's VGM icon green, and Mark VGM as sent records the re-weighed weight. FCL cargo is not re-weighed here.",
    replaces: "VGM (for LCL cargo)",
  },
  {
    term: TERMS.house,
    meaning: "A position (WCZ reference) inside a container. One container holds many houses; a position is in at most one container at a time.",
  },
  {
    term: `${TERMS.importContainer} / ${TERMS.exportContainer}`,
    meaning:
      "An import container (Unloading) arrives full and is stripped: its houses are outbound positions. An export container (Loading) is stuffed in the warehouse from inbound positions and leaves full.",
    replaces: "Loading / unloading",
  },
  {
    term: `${TERMS.containerGateIn} / ${TERMS.containerGateOut}`,
    meaning:
      "The container's own stamps (time and who, logged): the container arriving at our yard and leaving it. They fill the yard dates of Dock & Yard. The gate-out of a stuffed export container releases every stuffed house: its storage clock stops, it is Left, and its shipment gets the warehouse released date and the container's truck plate. The gate-out needs a connection.",
  },
  {
    term: TERMS.strippingTally,
    meaning:
      "Import container, after its gate-in: each house is counted (pieces, condition, location) and ticked off. Stripping is complete when every house is ticked received, or marked short / not arrived with a reason.",
  },
  {
    term: TERMS.tickOff,
    meaning:
      "Ticking a house off at the stripping tally receives it: its “Received in warehouse” date is the day of the tick (Prague time), its free time starts, and its shipment gets the warehouse received date and the WCZ reference. LCL cargo is re-weighed first. A count that differs from the expected pieces offers a Short / Over exception. Only a manager can void a tick, with a reason.",
  },
  {
    term: `${TERMS.short} / ${TERMS.notArrived}`,
    meaning: "A house that is not (fully) in the container: recorded at the tally with a reason. It stays in the container's list and is not received.",
  },
  {
    term: TERMS.stuffingPlan,
    meaning:
      "Export container: which inbound positions go into it, in order — picked from the positions in the warehouse (received, not on hold, not in another container), with pieces, weight and volume against the capacity of the container type. Over capacity is a warning.",
  },
  {
    term: `${TERMS.stuffed} / ${TERMS.closeContainer}`,
    meaning:
      "Stuffed: the house is loaded into the container (time and who; it can be taken back out until the close). Close: the stuffing is finished and the seal number recorded. Houses planned but not stuffed stay in the warehouse when the container goes out.",
  },
  {
    term: TERMS.capacity,
    meaning: "Usable volume and typical payload of the container type (20' DV 31 cbm / 28 200 kg, 40' DV 66 cbm / 26 700 kg, 40' HC 76 cbm / 26 500 kg, 45' HC 84 cbm / 27 600 kg); fill is the share used by the houses.",
  },
  {
    term: TERMS.lifecycle,
    meaning:
      "Where a position is, from its stamps, the stripping tally and the stuffing: Expected → Arrived (gate-in, or its container's gate-in) → Received (Receipt, or the tick-off) → In warehouse → Stuffed (inbound, in an export container) or Ready for release (outbound, release gates clear) → Left (WH release, or the stuffed container's gate-out). Refused shows next to the stage.",
  },
  {
    term: "W/M",
    meaning: "Weight or measure — the larger of the volume in cbm and the weight in tonnes; storage is charged on it.",
  },
  {
    term: TERMS.customsDeadline,
    meaning:
      "Goods in temporary storage (customs mode T1 or RDT, not cleared) must get a customs procedure within 90 days of the receipt in the warehouse (UCC art. 149). Counted in Prague days, receipt day = day 1; amber with 10 days left or fewer, red when overdue.",
  },
  { term: TERMS.temporaryStorage, meaning: "Non-Union goods held under customs supervision after arrival until a procedure is chosen; at most 90 days." },
  { term: TERMS.customsWarehouse, meaning: "Procedure 71: cargo stored under customs control (operation type Cargo storage (bonded)); no 90-day limit." },
  {
    term: TERMS.bondedRegister,
    meaning: "The entry / discharge record of goods under customs control: opened automatically at the receipt, discharged when the position leaves or customs clears it.",
  },
  {
    term: TERMS.manualLine,
    meaning: "A stock line or bonded entry typed by hand for odd cases, linked to a position with the picker; automatic lines follow the gate record.",
  },
  {
    term: TERMS.autoLine,
    meaning: "Follows the gate record: opened at the WH receipt or stripping tally, closed (Picked) when the position leaves, Voided when the receipt is voided.",
  },
  { term: TERMS.buildStock, meaning: "Manager action: creates or closes the automatic lines from the gate records; shows the counts first." },
  {
    term: TERMS.dwellTime,
    meaning:
      "Days from the receipt (WH receipt inbound; stripping tally tick outbound, or the typed received date without a container tally) to leaving (WH release, or the gate-out of the export container it was stuffed in).",
  },
  { term: TERMS.gateToReceipt, meaning: "Hours from arrival to receipt: inbound truck gate-in → WH receipt; outbound its container's gate-in → tally tick." },
  { term: TERMS.receiptToRelease, meaning: "Days from the receipt to the WH release stamp." },
  { term: TERMS.dockUtilisation, meaning: "Booked dock-slot minutes inside opening hours ÷ docks × opening minutes × working days (Warehouse settings)." },
  { term: TERMS.onTimeVsSlot, meaning: "Arrival (inbound) or WH release (outbound) no later than the end of its booked slot; early counts as on time." },
  { term: TERMS.reweighVarianceRate, meaning: "Share of positions whose latest re-weigh is more than 5 % off the declared weight." },
  { term: TERMS.exceptionRate, meaning: "Damage / short / over exceptions per 100 positions received in the period." },
  {
    term: TERMS.warehouseSettings,
    meaning: "Who gets the supplier e-mails (VGM, Survey, Remeasurement: To, Cc, on/off) and the docks with opening hours. Everyone can see them; only a manager changes them.",
  },
  {
    term: TERMS.supplierEmail,
    meaning:
      "Send VGM / Send survey / Send remeasurement e-mails the warehouse's record to the recipients in Warehouse settings. It is recorded as sent only once the e-mail went out; a failed send shows the reason and Retry.",
  },
  {
    term: TERMS.recordedOnly,
    meaning: "Mark as sent records that it went out outside the app; nothing is e-mailed. Set recipients in Warehouse settings to e-mail it.",
  },
];

export const DIRECTIONS = [TERMS.inbound, TERMS.outbound, TERMS.domestic] as const;

// příjem (goods received) is inbound, výdej (goods issued) is outbound.
export const directionOfVisit = (visit: string): string =>
  visit === "příjem" ? TERMS.inbound : visit === "výdej" ? TERMS.outbound : visit;

// Import cargo leaves the warehouse (outbound), export cargo comes in (inbound); domestic cargo
// (Trucking's LTL through our hub) comes in and leaves again — no customs.
export const directionOfHandling = (handling: string): string =>
  handling === "Import" ? TERMS.outbound : handling === "Export" ? TERMS.inbound : handling === "Domestic" ? TERMS.domestic : handling;

export const handlingOfDirection = (direction: string): string =>
  direction === TERMS.outbound ? "Import" : direction === TERMS.inbound ? "Export" : direction === TERMS.domestic ? "Domestic" : direction;

/** A position's direction as the screens show it: Domestic, else from its visit (Inbound / Outbound). */
export const directionOf = (m: { visit: string; handling?: string }): string => (m.handling === "Domestic" ? TERMS.domestic : directionOfVisit(m.visit));

// The release-gates indicator in one word, for grids and exports. Inbound cargo has no release.
export const RELEASE_GATES_VALUES = [TERMS.clear, TERMS.blocked, TERMS.released, "n/a — inbound"];
// Domestic cargo comes in, then leaves through the WH release: its release gates count.
export const releaseGatesText = (m: { visit: string; armed: boolean; impRelease: string | null; handling?: string }): string =>
  m.visit !== "výdej" && m.handling !== "Domestic" ? "n/a — inbound" : m.impRelease ? TERMS.released : m.armed ? TERMS.clear : TERMS.blocked;
