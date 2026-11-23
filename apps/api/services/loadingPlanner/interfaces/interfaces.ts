// Plain API types of the Loading Planner. Never import Drizzle table types here — Encore's parser
// cannot resolve the $inferSelect generic chain.

/** What a plan can be linked to. A plan without a link is a what-if plan. */
export type PlanLinkKind = "shipment" | "quote";

/** One line of a plan's cargo list. Sizes in mm, weight in kg per piece. */
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
}

/** What a user sends to save a plan. The loads themselves are worked out from this in the browser. */
export interface PlanInput {
  name: string;
  linkKind: PlanLinkKind | null;
  /** Id of the linked shipment or quote; null without a link. */
  linkId: string | null;
  /** The job number or quote reference, as shown to the user. */
  linkRef: string;
  lines: PlanCargoLine[];
  /** Ids of the nominated container types; null lets the planner choose. */
  nominated: string[] | null;
}

export interface LoadingPlanItem extends PlanInput {
  id: string;
  /** E-mail of the user who made the plan, and of the one who saved it last. */
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
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
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}
