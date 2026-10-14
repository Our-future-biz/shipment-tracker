// One set of words for the Warehouse module: screens, Gate Log, labels, Read me and exports.
// Display only — stored values stay as they are (handling "Import" / "Export", visit
// "příjem" / "výdej"), and so do the API fields.

export const TERMS = {
  warehouseRef: "Warehouse ref",
  jobNo: "Job no.",
  direction: "Direction",
  inbound: "Inbound",
  outbound: "Outbound",
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
  { term: `${TERMS.direction}: ${TERMS.inbound} / ${TERMS.outbound}`, meaning: "Inbound cargo comes into the warehouse (export cargo). Outbound cargo leaves it (import cargo).", replaces: "Trade direction Import / Export, příjem / výdej" },
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
      "One calculation everywhere in the warehouse. The clock starts at the receipt — the gate-in for inbound cargo, the “Received in warehouse” date for outbound cargo — and stops when the cargo leaves — the WH release (or gate-out) of outbound cargo. An inbound gate-out is only the delivering truck leaving and does not stop it. Calendar days in Prague time; the receipt day is day 1. After the free days (7 unless set on the record) storage is CZK 22 per W/M a day, at least CZK 120. Expiring = 2 free days left or fewer.",
  },
  {
    term: "Exception / On hold",
    meaning:
      "Damaged, short or over cargo recorded on the gate job (from a survey or by hand). While one is open the cargo is on hold: the release gate “No open exceptions” is Blocked and the WH release is refused unless a supervisor overrides. Anyone resolves it with a note; both are logged.",
    replaces: "OS&D",
  },
  {
    term: "W/M",
    meaning: "Weight or measure — the larger of the volume in cbm and the weight in tonnes; storage is charged on it.",
  },
];

export const DIRECTIONS = [TERMS.inbound, TERMS.outbound] as const;

// příjem (goods received) is inbound, výdej (goods issued) is outbound.
export const directionOfVisit = (visit: string): string =>
  visit === "příjem" ? TERMS.inbound : visit === "výdej" ? TERMS.outbound : visit;

// Import cargo leaves the warehouse (outbound), export cargo comes in (inbound).
export const directionOfHandling = (handling: string): string =>
  handling === "Import" ? TERMS.outbound : handling === "Export" ? TERMS.inbound : handling;

export const handlingOfDirection = (direction: string): string =>
  direction === TERMS.outbound ? "Import" : direction === TERMS.inbound ? "Export" : direction;

// The release-gates indicator in one word, for grids and exports. Inbound cargo has no release.
export const RELEASE_GATES_VALUES = [TERMS.clear, TERMS.blocked, TERMS.released, "n/a — inbound"];
export const releaseGatesText = (m: { visit: string; armed: boolean; impRelease: string | null }): string =>
  m.visit !== "výdej" ? "n/a — inbound" : m.impRelease ? TERMS.released : m.armed ? TERMS.clear : TERMS.blocked;
