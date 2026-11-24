import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { mainSearchInput } from "../../../lib/mainSearch";
import { requireRole } from "../../../lib/rbac";
import type { BoxCostChange, BoxUtilization, CoLoadingBoard, CoLoadingSailingItem, SearchCoLoadingItem, SearchMasterJobsRequest, SailingEarnings, SailingLog, SailingProfit, SailingCopyResult, SailingPlanCargo, SailingRemovedShipment, SailingShipmentFacts, ShipmentSailing } from "../interfaces/interfaces";
import { coLoadingCopyService } from "../services/coLoadingCopy.service";
import { coLoadingLogService } from "../services/coLoadingLog.service";
import { coLoadingSailingService as service } from "../services/coLoadingSailing.service";

// A Co-Loading Concept service's sailings (lib/coLoadingSailing), for everyone in the company.

// The service's sailings, the newest first: the Sailings list on its page.
export const coLoadingSailingList = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/sailings" },
  async ({ id }: { id: string }): Promise<{ data: CoLoadingSailingItem[] }> => {
    return { data: await service.list(id, getAuthData()!.companyID) };
  },
);

// One sailing, opened from the service's Sailings list.
export const coLoadingSailingGet = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id" },
  async ({ id }: { id: string }): Promise<CoLoadingSailingItem> => {
    return service.page(id, getAuthData()!.companyID);
  },
);

// Box utilization: how full the sailing's box is by volume and by weight, with each linked shipment's part.
export const coLoadingSailingUtilization = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/utilization" },
  async ({ id }: { id: string }): Promise<BoxUtilization> => {
    return service.utilization(id, getAuthData()!.companyID);
  },
);

// Earnings: what the sailing's shipments sell for and cost of their own, from their Costs Breakdown.
// For managers and admins only (Council Outlay 13, decision D14).
export const coLoadingSailingEarnings = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/earnings" },
  async ({ id }: { id: string }): Promise<SailingEarnings> => {
    return service.earnings(id, requireRole("superadmin", "admin", "manager").companyID);
  },
);

// The profit of each of the service's sailings, for the list of sailings. Managers and admins only (D19).
export const coLoadingSailingProfits = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/sailing-profits" },
  async ({ id }: { id: string }): Promise<{ data: SailingProfit[] }> => {
    return { data: await service.profits(id, requireRole("superadmin", "admin", "manager").companyID) };
  },
);

interface BoxCostsRequest {
  id: string;
  /** Which of the sailing's containers: 1 up to its number of containers. */
  containerNo: number;
  /** Its Origin Costs ("origin"), Ocean Freight ("ocean") and Destination Costs ("destination"); no amount = not set. */
  lines: { kind: string; amount: number | null; currency: string; note: string }[] & MaxLen<3>;
  /** The three costs as the dialog showed them when it opened: a save over costs changed since then is refused. */
  expected?: { kind: string; amount: number | null; currency: string; note: string }[] & MaxLen<3>;
}

// Sets one container's box costs: estimates, for managers and admins, also on a closed service (D14, D17).
export const coLoadingSailingBoxCostsSave = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id/box-costs" },
  async ({ id, containerNo, lines, expected }: BoxCostsRequest): Promise<void> => {
    await service.saveBoxCosts(id, containerNo, lines, expected ?? null, requireRole("superadmin", "admin", "manager"));
  },
);

// Every change of the sailing's box costs, the last one first (D16). Managers and admins.
export const coLoadingSailingBoxCostChanges = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/box-cost-changes" },
  async ({ id }: { id: string }): Promise<{ data: BoxCostChange[] }> => {
    return { data: await service.boxCostChanges(id, requireRole("superadmin", "admin", "manager").companyID) };
  },
);

// The shipments taken off the sailing, the last one first: who took each off, when and why.
export const coLoadingSailingRemoved = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/removed" },
  async ({ id }: { id: string }): Promise<{ data: SailingRemovedShipment[] }> => {
    return { data: await service.removed(id, getAuthData()!.companyID) };
  },
);

interface CoLoadingSailingLinkRequest {
  id: string;
  /** At most 200 (lib/coLoadingSailing LINK_AT_ONCE_MAX): more is refused, never cut short */
  shipmentIds: string[] & MaxLen<200>;
  /** Why they still go on a sailing that is closed for cargo or at a later stage; asked only then */
  reason?: string & MaxLen<300>;
}

// Links shipments to the sailing (its box), all or none: the service's own (its Service Name), each on
// no sailing yet. Refused while the service is closed; a sailing closed for cargo takes them with a reason.
export const coLoadingSailingLinkShipments = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/shipments" },
  async ({ id, shipmentIds, reason }: CoLoadingSailingLinkRequest): Promise<{ linked: number }> => {
    return service.linkShipments(id, shipmentIds, getAuthData()!, reason);
  },
);

// Sets the sailing's stage by hand (Council Outlay 14, C3): open, closed (for cargo), departed, arrived or devanned.
// Anyone; refused while the service is closed. The change is kept in the sailing's record of changes.
export const coLoadingSailingStage = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id/stage" },
  async ({ id, stage }: { id: string; stage: string & MaxLen<20> }): Promise<CoLoadingSailingItem> => {
    return service.setStage(id, stage, getAuthData()!);
  },
);

// Takes a shipment off the sailing. Refused while the service is closed.
export const coLoadingSailingUnlinkShipment = api(
  { expose: true, auth: true, method: "DELETE", path: "/co-loading/sailings/:id/shipments/:shipmentId" },
  async ({ id, shipmentId }: { id: string; shipmentId: string }): Promise<void> => {
    await service.unlinkShipment(id, shipmentId, getAuthData()!);
  },
);

interface CoLoadingSailingDetailsRequest {
  id: string;
  /** How many containers of its type the sailing has: 1 to 20 */
  containerCount: number;
  /** The day cargo must be in by, YYYY-MM-DD, or null for none */
  cutoffDate: string | null;
  /** The day the sailing leaves, YYYY-MM-DD, or null for none; left out, it stays as it is */
  departureDate?: string | null;
  /** The vessel's name, or the week it sails ("WEEK 44"); left out, it stays as it is */
  vessel?: string & MaxLen<200>;
  /** Left out, it stays as it is; "" only with a week in vessel */
  voyage?: string & MaxLen<200>;
  /** Port of Loading; left out, it stays as it is */
  pol?: string & MaxLen<200>;
  /** Port of Discharge; left out, it stays as it is */
  pod?: string & MaxLen<200>;
  /** HUB; left out, it stays as it is */
  hub?: string & MaxLen<200>;
  /** "40' HC"; left out, it stays as it is */
  containerType?: string & MaxLen<20>;
}

// "Edit sailing": its vessel, voyage, ports, HUB and container type, its number of containers, its cut-off and its
// departure date (Council Outlay 14, A2). Refused while the service is closed.
export const coLoadingSailingDetails = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id" },
  async ({ id, containerCount, cutoffDate, departureDate, vessel, voyage, pol, pod, hub, containerType }: CoLoadingSailingDetailsRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    const facts = Object.fromEntries(Object.entries({ vessel, voyage, pol, pod, hub, containerType }).filter(([, v]) => v !== undefined));
    return { sailing: await service.setDetails(id, { containerCount, cutoffDate, ...(departureDate !== undefined ? { departureDate } : {}), ...facts }, getAuthData()!) };
  },
);

// Removes a sailing made by mistake: managers and admins, while it holds no shipment and no box cost (Council Outlay 14, D4).
export const coLoadingSailingRemove = api(
  { expose: true, auth: true, method: "DELETE", path: "/co-loading/sailings/:id" },
  async ({ id }: { id: string }): Promise<void> => {
    await service.remove(id, getAuthData()!);
  },
);

// A shipment's place in Co-Loading Concept, for its own page: the sailing it is on and the ones it could go on. No money.
export const coLoadingShipmentSailing = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/shipments/:shipmentId/sailing" },
  async ({ shipmentId }: { shipmentId: string }): Promise<ShipmentSailing> => {
    return service.ofShipment(shipmentId, getAuthData()!.companyID);
  },
);

interface CoLoadingSailingMoveRequest {
  id: string;
  shipmentId: string;
  /** Another sailing of the same service */
  toSailingId: string;
  /** Why the shipment is left behind here */
  reason: string & MaxLen<300>;
}

// "Move to another sailing": the shipment leaves this sailing for another of the service, with the reason.
export const coLoadingSailingMoveShipment = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/shipments/:shipmentId/move" },
  async ({ id, shipmentId, toSailingId, reason }: CoLoadingSailingMoveRequest): Promise<void> => {
    await service.moveShipment(id, shipmentId, toSailingId, reason, getAuthData()!);
  },
);

interface CoLoadingSailingMoveSeveralRequest {
  id: string;
  /** At most 200, each on this sailing: more is refused, never cut short */
  shipmentIds: string[] & MaxLen<200>;
  /** Another sailing of the same service */
  toSailingId: string & MaxLen<40>;
  /** Why they are left behind here: needed, at most 300 characters */
  reason: string & MaxLen<400>;
}

// Moves several shipments to another sailing of the service with one reason, all or none (Council Outlay 14, A9).
export const coLoadingSailingMoveShipments = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/move-shipments" },
  async ({ id, shipmentIds, toSailingId, reason }: CoLoadingSailingMoveSeveralRequest): Promise<{ moved: number }> => {
    return service.moveShipments(id, shipmentIds, toSailingId, reason, getAuthData()!);
  },
);

// Takes several shipments off the sailing, all or none (Council Outlay 14, A9). Refused while the service is closed.
export const coLoadingSailingUnlinkShipments = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/remove-shipments" },
  async ({ id, shipmentIds }: { id: string; shipmentIds: string[] & MaxLen<200> }): Promise<{ removed: number }> => {
    return service.unlinkShipments(id, shipmentIds, getAuthData()!);
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
  /** How many containers of that type: 1 to 20; 1 when left out */
  containerCount?: number;
  /** The day cargo must be in by, YYYY-MM-DD; none when left out */
  cutoffDate?: string | null;
  /** The day the sailing leaves, YYYY-MM-DD; none when left out */
  departureDate?: string | null;
}

// "Create new sailing" on the service's page. Refused while the service is closed.
export const coLoadingSailingCreate = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services/:id/sailings" },
  async ({ id, ...input }: CoLoadingSailingCreateRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    return { sailing: await service.create(id, input, getAuthData()!) };
  },
);

// The board of all services: their sailings still to come and the shipments waiting for a box (Council Outlay 14, A6). No money.
export const coLoadingBoard = api({ expose: true, auth: true, method: "GET", path: "/co-loading/board" }, async (): Promise<CoLoadingBoard> => {
  return service.board(getAuthData()!.companyID);
});

// The profit of the board's sailings. Managers and admins.
export const coLoadingBoardProfits = api({ expose: true, auth: true, method: "GET", path: "/co-loading/board/profits" }, async (): Promise<{ data: SailingProfit[] }> => {
  return { data: await service.boardProfits(requireRole("superadmin", "admin", "manager").companyID) };
});

// The main search (the top bar) in Co-Loading Concept: services and sailings. Fewer than 2 characters give nothing.
export const searchCoLoading = api(
  { expose: true, auth: true, method: "GET", path: "/search/co-loading" },
  async (req: SearchMasterJobsRequest): Promise<{ items: SearchCoLoadingItem[]; total: number }> => {
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    const auth = getAuthData()!;
    return service.searchMain(auth.companyID, auth.role, input.q, input.limit);
  },
);

// The sailing's shipments beside its facts: what "Copy to linked shipments" would change, and the ports that differ (Council Outlay 14, A3).
export const coLoadingSailingShipmentFacts = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/shipment-facts" },
  async ({ id }: { id: string }): Promise<{ data: SailingShipmentFacts[] }> => {
    return { data: await coLoadingCopyService.facts(id, getAuthData()!.companyID) };
  },
);

// "Copy to linked shipments": the sailing's vessel, voyage, departure (ETD) and cut-off (Closing Date) written to the shipments
// picked. Each through its own rules: one that refuses is named. Refused while the service is closed.
export const coLoadingSailingCopyToShipments = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/copy-to-shipments" },
  async ({ id, shipmentIds }: { id: string; shipmentIds: string[] & MaxLen<200> }): Promise<SailingCopyResult> => {
    return coLoadingCopyService.copy(id, shipmentIds, getAuthData()!);
  },
);

// The sailing's box as the Loading Planner takes it: its shipments' cargo lines, by job number (Council Outlay 14, C1).
export const coLoadingSailingPlanCargo = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/plan-cargo" },
  async ({ id }: { id: string }): Promise<SailingPlanCargo> => {
    return service.planCargo(id, getAuthData()!.companyID);
  },
);

// Internal only (the Loading Planner, before it saves a plan linked to a sailing): whether the sailing exists in the
// caller's company, and what it is called now. Company from the caller's auth.
export const _internalSailingRef = api(
  { expose: false, auth: true, method: "POST", path: "/internal/co-loading/sailing-ref" },
  async ({ sailingId }: { sailingId: string }): Promise<{ reference: string | null }> => {
    return { reference: await service.referenceOf(sailingId, getAuthData()!.companyID) };
  },
);

// A sailing's checklist, hand-over note and history (Council Outlay 14, C5). For everyone; no money.
export const coLoadingSailingLog = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/log" },
  async ({ id }: { id: string }): Promise<SailingLog> => {
    return coLoadingLogService.log(id, getAuthData()!.companyID);
  },
);

// Ticks or unticks a step of the sailing's checklist. Refused while the service is closed.
export const coLoadingSailingTick = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id/checklist" },
  async ({ id, step, done }: { id: string; step: string & MaxLen<200>; done: boolean }): Promise<SailingLog> => {
    return coLoadingLogService.setTick(id, step, done, getAuthData()!);
  },
);

// Writes the sailing's hand-over note; "" clears it. Refused while the service is closed.
export const coLoadingSailingNote = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id/note" },
  async ({ id, note }: { id: string; note: string & MaxLen<4000> }): Promise<SailingLog> => {
    return coLoadingLogService.setNote(id, note, getAuthData()!);
  },
);
