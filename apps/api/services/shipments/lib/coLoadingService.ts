// Co-Loading Concept's services: the consolidation hub customer service works in, one service per
// lane ("Import from Shanghai"). A service is made in the Co-Loading Concept module; the shipments in it
// come from the Shipments module later. Pure, so it is tested without the database.

export const CO_LOADING_DIRECTIONS = ["import", "export"] as const;
export type CoLoadingDirection = (typeof CO_LOADING_DIRECTIONS)[number];

export const CO_LOADING_MODES = ["sea_lcl", "sea_fcl", "air", "rail", "road"] as const;
export type CoLoadingMode = (typeof CO_LOADING_MODES)[number];

/** What a new service is made from, as typed in the form. */
export interface CoLoadingServiceInput {
  name: string;
  direction: string;
  mode: string;
  origin?: string;
  destination?: string;
  note?: string;
}

/** A service as it is saved: every field trimmed, the optional ones "" when left out. */
export interface CoLoadingServiceValues {
  name: string;
  direction: CoLoadingDirection;
  mode: CoLoadingMode;
  origin: string;
  destination: string;
  note: string;
}

export const NAME_MAX = 80;

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

/** The values to save, or what is wrong with the input, in words for the form. */
export function checkServiceInput(input: CoLoadingServiceInput): { values: CoLoadingServiceValues } | { error: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { error: "Give the service a name." };
  if (name.length > NAME_MAX) return { error: `The name can be at most ${NAME_MAX} characters.` };
  if (!isOneOf(CO_LOADING_DIRECTIONS, input.direction)) return { error: "Pick Import or Export." };
  if (!isOneOf(CO_LOADING_MODES, input.mode)) return { error: "Pick the mode of transport." };
  return {
    values: {
      name,
      direction: input.direction,
      mode: input.mode,
      origin: (input.origin ?? "").trim(),
      destination: (input.destination ?? "").trim(),
      note: (input.note ?? "").trim(),
    },
  };
}

// ─── Who may make, close and reopen services, and what a closed one means ───

/** Managers and higher make services with New Service, and close and reopen them. */
export const CO_LOADING_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

export const canManageServices = (role: string): boolean => (CO_LOADING_MANAGER_ROLES as readonly string[]).includes(role);

/**
 * The services `role` sees as tiles: a manager all of them, closed ones too (to reopen them), anybody
 * else the open ones only. A closed service stays in the app; only its tile is hidden from users.
 */
export const servicesSeenBy = <T extends { closedAt: Date | null }>(services: T[], role: string): T[] =>
  canManageServices(role) ? services : services.filter((s) => s.closedAt === null);

/**
 * Why nothing new can be put in a service, or null when it is open. Every write of a service's data
 * (its shipments, once they come from the Shipments module) asks this first.
 */
export const closedServiceError = (s: { name: string; closedAt: Date | null }): string | null =>
  s.closedAt === null ? null : `"${s.name}" is closed. Nothing new can be put in it until a manager reopens it.`;
