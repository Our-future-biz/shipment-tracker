import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CoLoadingSailingItem } from "../interfaces/interfaces";
import { coLoadingSailingService as service } from "../services/coLoadingSailing.service";

// A Co-Loading Concept service's sailings (lib/coLoadingSailing), for everyone in the company.

// The service's sailings, the newest first: the Sailings list on its page.
export const coLoadingSailingList = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/sailings" },
  async ({ id }: { id: string }): Promise<{ data: CoLoadingSailingItem[] }> => {
    return { data: await service.list(id, getAuthData()!.companyID) };
  },
);

interface CoLoadingSailingCreateRequest {
  id: string;
  /** The vessel's name, or the week it sails ("WEEK 44") while the vessel is not known */
  vessel: string & MaxLen<200>;
  /** Needed with a vessel's name; may be left out with a week */
  voyage?: string & MaxLen<100>;
  pol: string & MaxLen<200>;
  pod: string & MaxLen<200>;
  hub: string & MaxLen<200>;
  /** A container type as quotes and shipments name it: "40' HC" */
  containerType: string & MaxLen<20>;
}

// "Create new sailing" on the service's page. Refused while the service is closed.
export const coLoadingSailingCreate = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services/:id/sailings" },
  async ({ id, ...input }: CoLoadingSailingCreateRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    return { sailing: await service.create(id, input, getAuthData()!) };
  },
);
