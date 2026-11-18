import type { OpsCockpitDirection, OpsCockpitMode, OpsCockpitReports } from "../interfaces/interfaces";

// The filters of Shipments → Managers as its requests carry them, read the same way by every
// endpoint of the page (the cockpit, the Money tab): what is left out means "all". Pure: no
// Encore; the controllers turn a problem into an invalid-argument error. Tested in
// tests/managersFilters.test.ts.

export const MANAGERS_MODES: readonly OpsCockpitMode[] = ["all", "sea", "air", "rail", "road"];
export const MANAGERS_DIRECTIONS: readonly OpsCockpitDirection[] = ["all", "import", "export", "domestic"];
export const MANAGERS_REPORTS: readonly OpsCockpitReports[] = ["all", "mine"];

/** The filters as they are sent. */
export interface ManagersFiltersAsked {
  mode?: string;
  direction?: string;
  handledBy?: string;
  reports?: string;
}

/** The filters as they are judged by. */
export interface ManagersFiltersChosen {
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
  reports: OpsCockpitReports;
}

/** The filters chosen, or the plain sentence saying which of them is none of its values. */
export function managersFilters(asked: ManagersFiltersAsked): { filters: ManagersFiltersChosen } | { problem: string } {
  const mode = MANAGERS_MODES.find((m) => m === (asked.mode ?? "all"));
  if (!mode) return { problem: `mode must be one of ${MANAGERS_MODES.join(", ")}` };
  const direction = MANAGERS_DIRECTIONS.find((d) => d === (asked.direction ?? "all"));
  if (!direction) return { problem: `direction must be one of ${MANAGERS_DIRECTIONS.join(", ")}` };
  const reports = MANAGERS_REPORTS.find((r) => r === (asked.reports ?? "all"));
  if (!reports) return { problem: `reports must be one of ${MANAGERS_REPORTS.join(", ")}` };
  return { filters: { mode, direction, handledBy: asked.handledBy?.trim() || null, reports } };
}
