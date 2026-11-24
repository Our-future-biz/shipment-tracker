// Plain API types of the Loading Planner. Never import Drizzle table types here — Encore's parser
// cannot resolve the $inferSelect generic chain.

/** What a plan can be linked to: a shipment, a quote, or a Co-Loading Concept sailing (its box). A plan without a link is a what-if plan. */
export type PlanLinkKind = "shipment" | "quote" | "sailing";

/** What a plan came to when it was last saved, as the browser worked it out: for the lists, which hold no loads. */
export interface PlanResult {
  /** The containers the plan takes, by type: "40' HC" × 2. */
  equipment: { name: string; count: number }[];
  /** Colli the plan found no place for. */
  notLoaded: number;
}

/** One line of a plan's cargo list. Sizes in mm, weight in kg per colli. */
export interface PlanCargoLine {
  id: string;
  name: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  weightKg: number;
  colli: number;
  /** May also be loaded crosswise. */
  canTurn: boolean;
  stackable: boolean;
  /** Dangerous goods, as the linked job marks the cargo. The planner only shows it. */
  dg?: boolean;
  /** The shipment the line belongs to in a box plan (its job number): what its pieces are coloured and named by. */
  group?: string;
  /** The line's dangerous goods, as its UN number ("1263") and class ("3", "2.1", "1.4S"), carried from the job or typed (Council Outlay 14, P11). Printed; the planner only warns when classes share a container. */
  un?: string;
  dgClass?: string;
  /** How the line is to be lashed or secured: a free note, printed on the plan. */
  lashing?: string;
  /** Pins (Council Outlay 14, P8): the end of the container its pieces stand at, and the container number it shares with the lines of the same number (1 to 9). */
  pinEnd?: "front" | "doors";
  pinBox?: number;
  /** The weight a piece of this line carries on top, in kg (Council Outlay 14, P9: mixed stacking); left out, it carries only its own kind when stackable. */
  topLoadKg?: number;
}

/** What a user sends to save a plan. The loads themselves are worked out from this in the browser. */
export interface PlanInput {
  name: string;
  linkKind: PlanLinkKind | null;
  /** Id of the linked shipment, quote or sailing; null without a link. */
  linkId: string | null;
  /** The job number or quote reference, as shown to the user. */
  linkRef: string;
  lines: PlanCargoLine[];
  /** Ids of the nominated container types; null lets the planner choose. */
  nominated: string[] | null;
  /** What the plan came to, as the browser worked it out; left out or null when not sent. Shown in the lists only. */
  result?: PlanResult | null;
  /** A free note for the stuffing gang and the surveyor (lashing, dunnage, what to mind), printed on the plan. Left out by a screen from before it was kept: the stored one then stays. */
  note?: string;
}

export interface LoadingPlanItem extends PlanInput {
  id: string;
  /** E-mail of the user who made the plan, and of the one who saved it last. */
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  /** When the plan was last saved. Sent back with the next save, which is refused when someone else saved in between. */
  updatedAt: string;
  /**
   * The shipment or quote the plan is linked to no longer exists (it was deleted). Told when one
   * plan is opened or saved; the plan stays linked until the user unlinks it.
   */
  linkGone: boolean;
}

/** A plan as the list shows it. */
export interface LoadingPlanSummary {
  id: string;
  name: string;
  linkKind: PlanLinkKind | null;
  linkId: string | null;
  linkRef: string;
  colli: number;
  weightKg: number;
  /** What the plan came to when it was last saved; null for one saved before this was kept. */
  result: PlanResult | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Out-of-gauge cargo on an open top or flat rack is warned about above these, in whole mm. */
export interface PlannerOogWarning {
  /** The width of a piece. */
  widthMm: number;
  /** How far a piece sticks out over one end of a flat rack. */
  overEndMm: number;
  /** How high the cargo stands above the floor. */
  heightMm: number;
}

/** A single piece in a standard container, in whole kg. */
export interface PlannerHeavyPiece {
  /** Above this the plan says to check how the piece is stuffed. */
  warnKg: number;
  /** Above this the piece is planned onto an open top or flat rack instead. */
  moveKg: number;
}

/** A company's Loading Planner settings. */
export interface PlannerSettings {
  clearance: PlannerClearance;
  oogWarning: PlannerOogWarning;
  heavyPiece: PlannerHeavyPiece;
  roadWeight: PlannerRoadWeight;
}

/** The gross weight (cargo with the empty container) above which a plan warns about the road leg, in whole kg; null: no warning. */
export interface PlannerRoadWeight {
  /** For a 20' container. */
  gross20Kg: number | null;
  /** For a 40' or a 45' container. */
  gross40Kg: number | null;
}

/** The room the planner leaves free in a standard container, in whole mm. */
export interface PlannerClearance {
  /** Beside a piece passing the door. */
  doorWidthMm: number;
  /** Above a piece passing the door. */
  doorHeightMm: number;
  /** Along the floor, between the cargo and the doors. */
  lengthMm: number;
}
