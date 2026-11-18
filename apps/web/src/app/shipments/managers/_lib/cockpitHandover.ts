import type { ShipmentsManagersCockpit } from "@/hooks/useShipmentsManagersCockpit";

// The hand-over line of Shipments → Managers (Council Outlay 11, step 5, D30): under the Team line,
// the updates our warehouse and Trucking owe the page's jobs - waiting longer than that module's own
// stale limit, or failed for good. While they wait, a job's dates and stamps may be behind what
// happened. The server counts; this file names the figures and decides whether the line is drawn.
// A figure the server could not read is null and is shown as "–", never as 0 (D29).

/** The four figures as the server sends them. */
export type CockpitHandover = ShipmentsManagersCockpit["handover"];

/** What a figure says on hover when it could not be read. */
export const HANDOVER_NOT_KNOWN = "Could not be read right now";

/** The line's label. */
export const HANDOVER_LABEL = "Hand-overs";

/** What the line's label says on hover: what its figures count. */
export const HANDOVER_HINT =
  "Updates the warehouse / Trucking owes these jobs that have waited too long (warehouse 30 min, Trucking 10 min) or failed for good: the job's dates and stamps may be behind.";

/** One figure of a part: "3", or "–" for one that was not read; `hot` draws it red. */
export interface HandoverFigure {
  text: string;
  /** Not read: "–", with HANDOVER_NOT_KNOWN on hover. */
  notKnown: boolean;
  hot: boolean;
}

/** One part of the line: "Warehouse updates to the jobs: 2 waiting · 1 failed". */
export interface HandoverPart {
  key: "warehouse" | "trucking";
  /** In front of the figures: "Warehouse updates to the jobs". */
  label: string;
  /** What the part counts, on hover. */
  hint: string;
  waiting: HandoverFigure;
  failed: HandoverFigure;
}

// The modules' own stale limits: warehouseConcept cockpitThresholds STALE_PENDING_MINUTES (30),
// trucking truckingOutbox.service STALE_PENDING_MINUTES (10).
const PARTS = [
  {
    key: "warehouse",
    label: "Warehouse updates to the jobs",
    hint: "Updates the warehouse owes these jobs that have waited too long (30 min) or failed for good: the job's dates and stamps may be behind.",
    waiting: "warehouseUpdatesWaiting",
    failed: "warehouseUpdatesFailed",
  },
  {
    key: "trucking",
    label: "Trucking updates to the jobs",
    hint: "Updates Trucking owes these jobs that have waited too long (10 min) or failed for good: the job's dates and stamps may be behind.",
    waiting: "truckingUpdatesWaiting",
    failed: "truckingUpdatesFailed",
  },
] as const satisfies readonly { key: HandoverPart["key"]; label: string; hint: string; waiting: keyof CockpitHandover; failed: keyof CockpitHandover }[];

const FIGURES = PARTS.flatMap((p) => [p.waiting, p.failed]);

/** A figure as the line shows it. Waiting is not red - an update that waits may still go; failed above 0 is. */
const figureOf = (value: number | null | undefined, redAbove0: boolean): HandoverFigure => {
  if (typeof value !== "number") return { text: "–", notKnown: true, hot: false };
  return { text: String(value), notKnown: false, hot: redAbove0 && value > 0 };
};

/**
 * Whether the line is drawn: when any figure is above 0 or not known. Hidden when all four are 0 -
 * nothing owed is nothing to say - and for an answer from before step 5, which has no line at all
 * (nothing is claimed of it).
 */
export function showHandoverLine(handover: Partial<CockpitHandover> | null | undefined): boolean {
  if (!handover) return false;
  return FIGURES.some((key) => handover[key] !== 0);
}

/** The line's two parts, warehouse first; none when the line is not drawn. */
export function handoverParts(handover: Partial<CockpitHandover> | null | undefined): HandoverPart[] {
  if (!handover || !showHandoverLine(handover)) return [];
  return PARTS.map((p) => ({
    key: p.key,
    label: p.label,
    hint: p.hint,
    waiting: figureOf(handover[p.waiting], false),
    failed: figureOf(handover[p.failed], true),
  }));
}
