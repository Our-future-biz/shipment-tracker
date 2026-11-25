// "Next sailings" on a Sea LCL quote (Council Outlay 14, C7): the quote names one of the company's
// Co-Loading Concept services, and shows that service's next sailings with their cut-off, departure
// and the room left in the box - the answer to "when is the next departure?" without leaving the
// quote. The sailings come with the quote itself (SalesQuoteItem.nextSailings): the server asks
// Co-Loading Concept for them whenever it reads or saves the quote. Pure.

export interface LclService {
  id: string;
  name: string;
  /** sea_lcl | sea_fcl | air | rail | road */
  mode: string;
  /** import | export */
  direction: string;
  closedAt?: string | null;
}

/** The next sailings as the quote carries them: whose they are, and what Co-Loading Concept said. */
export interface NextSailingsAnswer {
  serviceId: string;
  state: "open" | "gone" | "unavailable";
  serviceName: string;
  sailings: readonly unknown[];
}

/** What the card says in place of the table of sailings. */
export interface NextSailingsNote {
  text: string;
  /** Something failed: said as an alert, not as a hint. */
  alert: boolean;
}

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

/** The card is left out: the quote names no service, and the company runs none to pick - known for sure, the services having been read. */
export const nextSailingsHidden = (picked: string | undefined, offered: number, servicesLoading: boolean, servicesFailed: boolean): boolean =>
  !picked && !servicesLoading && !servicesFailed && offered === 0;

/**
 * What the card says where it shows no sailings; null when it shows the table. `answer` is what the
 * quote was last read or saved with: a service picked since is not saved yet, and the sailings of the
 * service named before are not shown under the new one. A failure says that something could not be
 * read - never that there are no sailings, or that the service is closed.
 */
export function nextSailingsEmpty(picked: string | undefined, answer: NextSailingsAnswer | null | undefined, servicesFailed: boolean): NextSailingsNote | null {
  if (!picked) {
    return servicesFailed
      ? { text: "The Co-Loading services could not be read, so none can be picked just now. Reload the page to try again.", alert: true }
      : { text: "Pick the Co-Loading service this cargo would travel on to see its next sailings.", alert: false };
  }
  if (!answer || answer.serviceId !== picked) return { text: "This service's next sailings show once the quote is saved.", alert: false };
  if (answer.state === "unavailable") return { text: "The sailings of this service could not be read just now. Open the quote again in a moment to see them.", alert: true };
  if (answer.state === "gone") return { text: "This service is closed or no longer exists: pick another to see sailings.", alert: false };
  return answer.sailings.length === 0 ? { text: "This service has no sailing still to come. Create the next one in Co-Loading Concept.", alert: false } : null;
}

/** Said under the picker of a quote that names a service: the others to pick from could not be read. */
export const servicesProblem = (picked: string | undefined, servicesFailed: boolean): string | null =>
  picked && servicesFailed ? "The other Co-Loading services could not be read, so another cannot be picked just now." : null;

/**
 * How the picker names the service the quote names when it is not among those offered: by the name
 * the quote's answer gives, as "no longer open" once the services are known to lack it, and as the
 * quote's own while they cannot be read.
 */
export function namedServiceLabel(picked: string, answer: NextSailingsAnswer | null | undefined, servicesFailed: boolean): string {
  if (answer?.serviceId === picked && answer.state === "open" && answer.serviceName) return answer.serviceName;
  return servicesFailed ? "The service this quote names" : "A service no longer open";
}
