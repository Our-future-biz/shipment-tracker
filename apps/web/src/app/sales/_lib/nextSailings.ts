// "Next sailings" on a Sea LCL quote (Council Outlay 14, C7): the quote names one of the company's
// Co-Loading Concept services, and shows that service's next sailings with their cut-off, departure
// and the room left in the box - the answer to "when is the next departure?" without leaving the
// quote. Read from the board of coming sailings, which everyone may read and which holds no money.
// Pure.

export interface LclService {
  id: string;
  name: string;
  /** sea_lcl | sea_fcl | air | rail | road */
  mode: string;
  /** import | export */
  direction: string;
  closedAt?: string | null;
}

/** How many sailings the quote shows. */
export const NEXT_SAILINGS = 3;

/**
 * The services a Sea LCL quote may name: the open sea-LCL ones, those of the quote's direction
 * first. The service named already stays in the list whatever became of it, so the quote still says
 * what it was quoted on.
 */
export function lclServicesFor<T extends LclService>(services: readonly T[], direction: string | undefined, picked?: string): T[] {
  const wanted = (direction ?? "").trim().toLowerCase();
  const usable = services.filter((s) => s.id === picked || (s.mode === "sea_lcl" && !s.closedAt));
  const rank = (s: T) => (wanted && s.direction === wanted ? 0 : 1);
  return [...usable].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The service's next sailings, the soonest first as the board lists them, at most three. */
export const nextSailingsOf = <T extends { serviceId: string }>(sailings: readonly T[], serviceId: string | undefined, count = NEXT_SAILINGS): T[] =>
  serviceId ? sailings.filter((s) => s.serviceId === serviceId).slice(0, count) : [];

/** What the card says where it has no sailing to show; "" when it has some. */
export function nextSailingsEmpty(picked: boolean, found: number, serviceKnown: boolean): string {
  if (!picked) return "Pick the Co-Loading service this cargo would travel on to see its next sailings.";
  if (!serviceKnown) return "This service is closed or no longer exists: pick another to see sailings.";
  return found === 0 ? "This service has no sailing still to come. Create the next one in Co-Loading Concept." : "";
}
