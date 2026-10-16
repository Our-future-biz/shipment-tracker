import type { interfaces } from "@/lib/api/client";
import type { Tone } from "../gate-log/_lib/gate";

// The position's in-and-out lifecycle as the screens show it. The server derives it (one
// calculation, apps/api/services/warehouse/services/lifecycle.ts) and sends it on every gate
// record; this file only gives each stage its words and colour. Pure (tested in lifecycle.test.ts).

type Lifecycle = interfaces.GatePositionLifecycle;

export const LIFECYCLE_STAGES = ["expected", "arrived", "received", "in_warehouse", "stuffed", "ready", "left"] as const;
export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  expected: "Expected",
  arrived: "Arrived",
  received: "Received",
  in_warehouse: "In warehouse",
  stuffed: "Stuffed",
  ready: "Ready for release",
  left: "Left",
};

export const LIFECYCLE_TONE: Record<LifecycleStage, Tone> = {
  expected: "",
  arrived: "a",
  received: "b",
  in_warehouse: "b",
  stuffed: "i",
  ready: "g",
  left: "g",
};

/** Every stage label, for the column filter. */
export const LIFECYCLE_VALUES = LIFECYCLE_STAGES.map((s) => LIFECYCLE_LABEL[s]);

const isStage = (s: string): s is LifecycleStage => (LIFECYCLE_STAGES as readonly string[]).includes(s);

/** The stage's label ("In warehouse"), the server's label when the stage is unknown here. */
export const stageLabel = (stage: string, fallback = "") => (isStage(stage) ? LIFECYCLE_LABEL[stage] : fallback || stage);
export const stageTone = (stage: string): Tone => (isStage(stage) ? LIFECYCLE_TONE[stage] : "");

/** One word for grids and exports: "In warehouse", "Left", "Expected · Refused". */
export function lifecycleText(l: Lifecycle | null | undefined): string {
  if (!l) return "";
  const label = stageLabel(l.stage, l.label);
  return l.refused ? `${label} · Refused` : label;
}

/** A reached time as the strip shows it: a plain day stays a day, a time is shown as a time. */
export const isDayOnly = (at: string | null) => !!at && /^\d{4}-\d{2}-\d{2}$/.test(at);

/** Sort value of the stage (process order); unknown stages last. */
export const stageOrder = (stage: string) => {
  const i = (LIFECYCLE_STAGES as readonly string[]).indexOf(stage);
  return i < 0 ? LIFECYCLE_STAGES.length : i;
};
