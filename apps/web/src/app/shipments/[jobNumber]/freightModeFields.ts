// The job page's rows in the words of the job's freight mode (user council O17, owner's answer Q8):
// an air job names its documents, flight and airports as air freight does, and leaves out the rows
// only sea freight has. A row left out on air that already holds a value stays, under its sea name,
// so nothing typed disappears; switched back to sea, the job shows every row again. The grid's column
// titles and History's field names stay generic (columnConfig). Pure.
// A road job leaves out the empty rows a truck has no use for the same way (user council T9).

import { chargeBasis, fmtChargeBasis, isAirFreight } from "@/lib/chargeBasis";
import { waitsForOriginalBl } from "@/lib/columnConfig";
import { isDeliveryDated } from "@/lib/deliveryDated";

/** What says how a job travels and whether it is Trucking's; a bare string is its Freight Mode. */
export interface JobMode {
  freightMode?: string | null;
  tradeDirection?: string | null;
  department?: string | null;
  mrn?: string | null;
  customsDeadline?: string | null;
}
type ModeArg = JobMode | string | null | undefined;
const jobOf = (m: ModeArg): JobMode => (m !== null && typeof m === "object" ? m : { freightMode: m });

/**
 * A Trucking job: a Domestic job or one of the Road Department (lib/deliveryDated), as the server's
 * lib/trackingEvents isTruckingJob decides it.
 */
export const isTruckingJob = (m: ModeArg): boolean => isDeliveryDated(jobOf(m));

/**
 * A job that goes by road: a Trucking job, or one whose Freight Mode says road - the server's rule
 * (lib/trackingEvents freightKindOf), which the managers' cockpit and the Tracking tab go by. Road
 * comes first there too: a Domestic job is road whatever its Freight Mode says.
 */
export const isRoadJob = (m: ModeArg): boolean => {
  const job = jobOf(m);
  return isTruckingJob(job) || /road/i.test(job.freightMode ?? "");
};

/** Air, unless the job goes by road. */
const isAirJob = (m: ModeArg): boolean => !isRoadJob(m) && isAirFreight(jobOf(m).freightMode);

/** An air job's names for rows whose sea name says Vessel, BoL or Port. */
export const AIR_LABELS: Readonly<Record<string, string>> = {
  vessel: "Flight",
  houseBolNumber: "HAWB Number",
  houseBolType: "HAWB Type",
  masterBolNumber: "MAWB Number",
  masterBolType: "MAWB Type",
  pol: "Airport of Departure",
  pod: "Airport of Destination",
  // The carrier of an air job is an airline.
  shippingLine: "Airline / Coloader",
  bolDraft: "AWB Draft",
  // The house air waybill is released, not a bill of lading (mock council S4-3).
  houseBolRelease: "HAWB Release",
};

/** A row's name in the words of the job's (or master job's) freight mode: on air its AIR_LABELS name, else `sea`. */
export const modeLabel = (key: string, sea: string, mode: ModeArg): string => (isAirJob(mode) ? (AIR_LABELS[key] ?? sea) : sea);

/** What the House BoL release row, its button and its dialog say: on an air job the house air waybill (mock council S4-3). */
export function houseReleaseWords(mode: ModeArg): { label: string; button: string; document: string } {
  return isAirJob(mode)
    ? { label: "HAWB Release", button: "Release Air Waybill", document: "Air Waybill" }
    : { label: "House BoL Release", button: "Release Bill of Lading", document: "Bill of Lading" };
}

/**
 * Rows only sea freight has, left out of an air job while they are empty: the voyage (the flight
 * says it), the container and its TEU, and the VGM (a SOLAS rule for containers) with the VGM and SI
 * closings. Compliance's Shipping Instructions stay: an air shipper gives instructions too (SLI).
 */
export const AIR_HIDDEN: ReadonlySet<string> = new Set(["voyage", "containerNumber", "containerTypeSummary", "totalTeu", "vgmClosing", "siClosing", "vgm"]);

/**
 * The value a sea-only row starts with before anyone touches it (the server's starting states,
 * fieldDefaults): on an air job it counts as empty, so the row is still left out (step 3 review M1).
 * Air jobs made before the server stopped seeding the VGM on air still hold it.
 */
const AIR_UNTOUCHED: Readonly<Record<string, string>> = { vgm: "Pending (Red)" };

/**
 * Rows a truck has no use for, left out of a road job while they hold nothing of their own (user
 * council T9): the vessel, voyage, container and TEU, the VGM and the VGM / SI closings, the Shipping
 * Instructions, the BoL draft, types and release, and AMS / ISF with their deadlines (US sea
 * filings). The BoL numbers stay: a truck's CMR number has no row of its own.
 */
export const ROAD_HIDDEN: ReadonlySet<string> = new Set([
  "vessel",
  "voyage",
  "containerNumber",
  "containerTypeSummary",
  "totalTeu",
  "vgm",
  "vgmClosing",
  "siClosing",
  "shippingInstructions",
  "bolDraft",
  "houseBolType",
  "masterBolType",
  "houseBolRelease",
  "ams",
  "isf",
  "amsDeadline",
  "isfDeadline",
]);

/**
 * The values the server starts these rows with on every job (fieldDefaults startingStateDefaults):
 * on a road job they count as empty. Road jobs made before the server stopped seeding the VGM on
 * road still hold it.
 */
const ROAD_UNTOUCHED: Readonly<Record<string, string>> = {
  vgm: "Pending (Red)",
  shippingInstructions: "Not Queried",
  bolDraft: "Not Processed",
  ams: "Not Applicable",
  isf: "Not Applicable",
};

/**
 * A road export's too: the OBL the server starts an export's House and Master BoL Type with
 * (fieldDefaults exportBolDefaults). No other job gets a type seeded, so an OBL on an import was
 * set - and makes the job wait for an original B/L (waitsForOriginalBl).
 */
const ROAD_EXPORT_UNTOUCHED: Readonly<Record<string, string>> = { ...ROAD_UNTOUCHED, houseBolType: "OBL", masterBolType: "OBL" };

const BOL_TYPES: ReadonlySet<string> = new Set(["houseBolType", "masterBolType"]);

/** The customs status of a job none of whose paperwork is in yet (the server's PAPERWORK_WAITING). */
export const PAPERWORK_WAITING = "Waiting For Commercial Paperwork";

/**
 * Whether a job goes through customs as far as anyone can tell: any job but a Trucking one, and a
 * Trucking job once it has an MRN or a customs deadline - the rule the managers' cockpit and the
 * Tracking tab hide its customs by (lib/managersCockpitExtra goesThroughCustoms).
 */
export const goesThroughCustoms = (m: ModeArg): boolean => {
  const job = jobOf(m);
  return !isTruckingJob(job) || !!(job.mrn ?? "").trim() || !!(job.customsDeadline ?? "").trim();
};

/** Whether a left-out row holds a value of its own: not blank, not its untouched starting value. */
const holdsValue = (untouched: Readonly<Record<string, string>>, key: string, value: string | null | undefined): boolean => {
  const text = (value ?? "").trim();
  return !!text && text.toLowerCase() !== (untouched[key] ?? "").toLowerCase();
};

/**
 * The rows of a card as the job's freight mode shows them, in the card's order: on an air job the
 * air names, and the sea-only rows left out unless `valueOf` gives them a value (their untouched
 * starting value is none); on a road job the rows a truck has no use for left out the same way -
 * but never the House and Master BoL Type while the job waits for an original B/L, which the page
 * says in red by those types - and on a Trucking job that goes through no customs
 * (goesThroughCustoms) the Customs Status while it still waits for paperwork. Any other mode keeps
 * the rows as they are. `mode` is the job (its Freight Mode, Trade Direction, Department, MRN and
 * customs deadline), or its Freight Mode alone. Used for the card and its "Show all" / field picker
 * alike.
 */
export function fieldsForMode<F extends { key: string; label: string }>(
  fields: readonly F[],
  mode: ModeArg,
  valueOf: (key: string) => string | null | undefined,
): F[] {
  if (isRoadJob(mode)) {
    const job = jobOf(mode);
    const customs = goesThroughCustoms(job);
    const untouched = (job.tradeDirection ?? "").trim().toLowerCase() === "export" ? ROAD_EXPORT_UNTOUCHED : ROAD_UNTOUCHED;
    const text = (key: string) => valueOf(key) ?? "";
    const oblWaiting = waitsForOriginalBl({
      tradeDirection: job.tradeDirection ?? "",
      houseBolType: text("houseBolType"),
      masterBolType: text("masterBolType"),
      originalsReceivedDate: text("originalsReceivedDate"),
      telexReleaseReceivedDate: text("telexReleaseReceivedDate"),
    });
    return fields.filter((f) => {
      if (f.key === "customsStatus" && !customs) return holdsValue({ customsStatus: PAPERWORK_WAITING }, f.key, valueOf(f.key));
      if (oblWaiting && BOL_TYPES.has(f.key)) return true;
      return !ROAD_HIDDEN.has(f.key) || holdsValue(untouched, f.key, valueOf(f.key));
    });
  }
  if (!isAirJob(mode)) return [...fields];
  return fields.flatMap((f) => {
    if (AIR_HIDDEN.has(f.key)) return holdsValue(AIR_UNTOUCHED, f.key, valueOf(f.key)) ? [f] : [];
    const label = AIR_LABELS[f.key];
    return label ? [{ ...f, label }] : [f];
  });
}

/**
 * An air job's chargeable weight as its Cargo & Commercial card shows it (mock council S4-Q2 / R17, O17):
 * the greater of the gross weight and the volumetric weight, by the rule its quote uses (lib/chargeBasis,
 * m³ × 1,000,000 ÷ 6000), from the kg and m³ the card shows. "" on any other job, "—" with neither figure.
 * Read only: it is worked out, never typed.
 */
export function airChargeableWeight(mode: ModeArg, weightKg: string | null | undefined, volumeCbm: string | null | undefined): string {
  if (!isAirJob(mode)) return "";
  const kg = parseFloat((weightKg ?? "").replace(/,/g, "")) || 0;
  const m3 = parseFloat((volumeCbm ?? "").replace(/,/g, "")) || 0;
  return fmtChargeBasis(chargeBasis(jobOf(mode).freightMode, kg, m3));
}

/** Whether the job shows the Chargeable Weight row: an air job's (airChargeableWeight). */
export const showsChargeableWeight = (mode: ModeArg): boolean => isAirJob(mode);

/** The Carrier card's title: an air job's transport document is the air waybill. */
export const carrierCardTitle = (mode: ModeArg): string =>
  isAirJob(mode) ? "Carrier & Air Waybill" : "Carrier & Bill of Lading";

/**
 * Whether the job shows its Container Details tab: always, but on an air job only once it has a
 * container (or a container number), so one entered before the mode changed can still be reached.
 */
export function showsContainerTab(freightMode: string | null | undefined, containerCount: number, containerNumber?: string | null): boolean {
  return !isAirFreight(freightMode) || containerCount > 0 || !!(containerNumber ?? "").trim();
}

/** One stage of the job page's progress bar: its place among the six (TaskDef.stage) and its name. */
export interface ProgressStage {
  index: number;
  label: string;
}

/** The six stages as a sea job names them (taskDefinitions: 0 Booking confirmed … 5 Delivered). */
export const SEA_STAGES: readonly ProgressStage[] = [
  { index: 0, label: "Booking confirmed" },
  { index: 1, label: "Cargo ready" },
  { index: 2, label: "In transit" },
  { index: 3, label: "Arrive at Port of Discharge" },
  { index: 4, label: "Customs clearance" },
  { index: 5, label: "Delivered" },
];

const ARRIVAL_STAGE = 3;
const CUSTOMS_STAGE = 4;

/**
 * The progress bar's stages as the job travels (user council T9): an air job arrives at its
 * destination airport, a rail job at its terminal; a road job has no port to arrive at, and a
 * Trucking job that goes through no customs (goesThroughCustoms) no customs stage either - an
 * international road job keeps it. A stage left out still counts: the ticks and dates behind it move
 * the bar on to the next stage shown.
 */
export function progressStagesFor(mode: ModeArg): ProgressStage[] {
  if (isRoadJob(mode)) {
    const customs = goesThroughCustoms(mode);
    return SEA_STAGES.filter((s) => s.index !== ARRIVAL_STAGE && (customs || s.index !== CUSTOMS_STAGE));
  }
  const freightMode = jobOf(mode).freightMode ?? "";
  const arrival = isAirFreight(freightMode) ? "Arrive at destination airport" : /^\s*rail/i.test(freightMode) ? "Arrive at destination terminal" : null;
  return SEA_STAGES.map((s) => (s.index === ARRIVAL_STAGE && arrival ? { ...s, label: arrival } : s));
}

/**
 * The stage shown as in progress, by its place among the six: the first stage shown from the active
 * one on, so the ticks of a stage left out (a truck's "Booked for further transport", stage 4) move
 * the bar on to Delivered. Undefined once every stage shown is done.
 */
export const currentStageOf = (stages: readonly ProgressStage[], activeIndex: number): number | undefined =>
  stages.find((s) => s.index >= activeIndex)?.index;

/**
 * The Tasks card's heading, after the checklist it shows (taskDefinitions getTasksForDirection): an
 * export's, or the import list - which a Domestic job gets cut to a truck's tasks, so it is named
 * Domestic (user council T9). A Road Department job that is not Domestic gets a truck's tasks too,
 * so it is named Road, not Import or Export. The ticks of the tasks it no longer lists stay stored.
 */
export function workflowHeading(tradeDirection: string | null | undefined, department?: string | null): string {
  if ((tradeDirection ?? "").trim().toLowerCase() === "domestic") return "Domestic Workflow";
  if (isDeliveryDated({ department })) return "Road Workflow";
  return tradeDirection === "Export" ? "Export Workflow" : "Import Workflow";
}
