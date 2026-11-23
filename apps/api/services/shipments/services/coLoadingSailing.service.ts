import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { fx, invoicing } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import { capacityOf, containerCapacity } from "../../../lib/containerCapacity";
import type { BoxCostChange, BoxCostKind, BoxUtilization, CoLoadingSailingItem, SailingBoxCosts, SailingEarnings, SailingProfit, SailingRemovedShipment } from "../interfaces/interfaces";
import { boxCostChanges, boxCostsOf, checkBoxCosts, type BoxCostLineInput, type BoxCostStored, type BoxRates } from "../lib/coLoadingBoxCosts";
import { coLoadingBoxCostRepository as boxCostRepo } from "../repositories/coLoadingBoxCost.repository";
import { sailingEarnings, sailingProfit, type ShipmentMoney } from "../lib/coLoadingEarnings";
import { boxFillOf, boxUtilization } from "../lib/boxUtilization";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { checkSailingInput, linkRefusal, moveRefusal, oddInBox, sailingDetailsProblem, type SailingDetails, type SailingInput } from "../lib/coLoadingSailing";
import { userNameOf } from "../lib/userName";
import { coLoadingSailingRepository as repo, type LinkedCargo } from "../repositories/coLoadingSailing.repository";
import type { CoLoadingSailingRecord } from "../schemas/coLoadingSailing.schema";
import { coLoadingServiceService } from "./coLoadingService.service";

const toItem = (r: CoLoadingSailingRecord): CoLoadingSailingItem => ({
  id: r.id,
  serviceId: r.serviceId,
  vessel: r.vessel,
  voyage: r.voyage,
  pol: r.pol,
  pod: r.pod,
  hub: r.hub,
  containerType: r.containerType,
  containerCount: r.containerCount,
  cutoffDate: r.cutoffDate,
  departureDate: r.departureDate,
  createdByName: r.createdByName,
  createdAt: r.createdAt.toISOString(),
});

/**
 * The fill of a sailing's containers together, on this service, holding these shipments, planned to the company's share of their volume. A cancelled
 * one is listed, not counted; one of another kind than the box is for is counted and remarked on.
 */
/** How many sailings' earnings are worked out at the same time for the list of sailings. */
const PROFITS_AT_ONCE = 6;

/** A stored box cost as the rules read it. */
const storedCost = (r: { containerNo: number; kind: string; amount: string | null; currency: string; note: string }): BoxCostStored => ({
  containerNo: r.containerNo,
  kind: r.kind,
  amount: r.amount === null ? null : Number(r.amount),
  currency: r.currency,
  note: r.note,
});

const fillOf = (sailing: { containerType: string; containerCount: number }, service: { mode: string; inlandWeightKg: number | null }, planningPct: number, shipments: LinkedCargo[]) => {
  const one = containerCapacity(sailing.containerType, planningPct / 100);
  return boxUtilization(
    sailing.containerType,
    one && capacityOf(sailing.containerCount, one),
    shipments.map((s) => ({ ...s, cancelled: s.status === CANCELLED_STATUS, odd: oddInBox(service.mode, s) })),
    { planningPct, inlandWeightKg: service.inlandWeightKg, containers: sailing.containerCount },
  );
};

// A Co-Loading Concept service's sailings: listed on its page, made with "Create new sailing" by anyone
// in the company - not while the service is closed (requireOpen).
class CoLoadingSailingService {
  /** The service's sailings, the newest first; a closed service's too (it stays in the app). */
  async list(serviceId: string, companyId: string): Promise<CoLoadingSailingItem[]> {
    const service = await coLoadingServiceService.get(serviceId, companyId);
    const rows = await repo.listByService(serviceId, companyId);
    // Each sailing with how full its box is, so every open box is seen on the one list.
    const [cargo, planningPct] = await Promise.all([repo.boxShipmentsOf(rows.map((r) => r.id), companyId), coLoadingServiceService.planningVolumePct(companyId)]);
    return rows.map((r) => ({ ...toItem(r), fill: boxFillOf(fillOf(r, service, planningPct, cargo.get(r.id) ?? [])) }));
  }

  /** One sailing, for its own page (Box utilization, Linked shipments, Earnings). */
  async get(id: string, companyId: string): Promise<CoLoadingSailingItem> {
    const row = isUuid(id) ? await repo.get(id, companyId) : null;
    if (!row) throw APIError.notFound("Sailing not found");
    return toItem(row);
  }

  /**
   * How full the sailing's box is: the cargo of its linked shipments against what its container type
   * takes (lib/boxUtilization). Read by everyone, a closed service's sailing too.
   */
  async utilization(id: string, companyId: string): Promise<BoxUtilization> {
    const sailing = await this.get(id, companyId);
    const service = await coLoadingServiceService.get(sailing.serviceId, companyId);
    return fillOf(sailing, service, await coLoadingServiceService.planningVolumePct(companyId), await repo.boxShipments(sailing.id, companyId));
  }

  /**
   * The sailing's earnings: its shipments' selling, inland delivery and other costs from their Costs
   * Breakdown (Invoicing, one call), beside each shipment's W/M (lib/coLoadingEarnings). For managers:
   * the controller lets only them ask. Money that cannot be read is said to be not known.
   */
  async earnings(id: string, companyId: string): Promise<SailingEarnings> {
    const sailing = await this.get(id, companyId);
    const service = await coLoadingServiceService.get(sailing.serviceId, companyId);
    const linked = await repo.boxShipments(sailing.id, companyId);
    const box = fillOf(sailing, service, await coLoadingServiceService.planningVolumePct(companyId), linked);
    let money: Map<string, ShipmentMoney> | null = null;
    try {
      const { items } = linked.length
        ? await invoicing._internalCoLoadingMoney({
            jobs: linked.map((s) => ({
              shipmentId: s.id,
              tradeDirection: s.tradeDirection,
              estimatedArrival: s.estimatedArrival,
              estimatedDeparture: s.estimatedDeparture,
              actualArrival: s.actualArrival,
              actualDeparture: s.actualDeparture,
            })),
          })
        : { items: [] };
      money = new Map(items.map((m) => [m.shipmentId, m]));
    } catch (err) {
      log.warn(err, "Co-Loading earnings: the shipments' money could not be read", { sailingId: sailing.id });
    }
    return sailingEarnings(box.rows, money, new Set(linked.filter((s) => s.masterJobId).map((s) => s.id)), await this.boxCosts(sailing, companyId), box.fullPct);
  }

  /**
   * The profit of each of a service's sailings, for the list of sailings (D19). For managers: the
   * controller lets only them ask. Each sailing is worked out as its Earnings tab does, a few at a
   * time; one that fails is left out, not shown as 0.
   */
  async profits(serviceId: string, companyId: string): Promise<SailingProfit[]> {
    await coLoadingServiceService.get(serviceId, companyId);
    const rows = await repo.listByService(serviceId, companyId);
    const out: SailingProfit[] = [];
    for (let i = 0; i < rows.length; i += PROFITS_AT_ONCE) {
      const batch = await Promise.all(
        rows.slice(i, i + PROFITS_AT_ONCE).map(async (r) => {
          try {
            return sailingProfit(r.id, await this.earnings(r.id, companyId));
          } catch (err) {
            log.warn(err, "Co-Loading: a sailing's profit could not be worked out", { sailingId: r.id });
            return null;
          }
        }),
      );
      out.push(...batch.filter((p): p is SailingProfit => p !== null));
    }
    return out;
  }

  /**
   * The costs of the sailing's boxes, valued at the ČNB rates of its departure date (D10); the
   * latest rates while it has none or that day is still ahead - marked provisional. When the rates
   * cannot be read, only CZK amounts are valued and the other currencies are named as left out.
   */
  async boxCosts(sailing: { id: string; containerCount: number; departureDate: string | null }, companyId: string): Promise<SailingBoxCosts> {
    const stored = (await boxCostRepo.list(sailing.id, companyId)).map(storedCost);
    let day: BoxRates | null = null;
    // The rates are asked for only once a cost is set.
    if (stored.some((s) => s.amount !== null)) {
      try {
        const on = await fx.fxRatesOn(sailing.departureDate ? { date: sailing.departureDate } : {});
        // A fixing that should be stored and is not (the import failed) is no rate to trust yet.
        day = { rates: new Map(on.rates.map((r) => [r.currency, r.rate])), fixingDate: on.fixingDate, provisional: on.provisional || on.missing };
      } catch (err) {
        log.warn(err, "Co-Loading earnings: the rates for the box costs could not be read", { sailingId: sailing.id });
      }
    }
    return boxCostsOf(sailing.containerCount, stored, day, sailing.departureDate);
  }

  /**
   * Sets one container's Origin Costs, Ocean Freight and Destination Costs. For managers and admins
   * (the controller); allowed on a closed service too, to correct them (D17). Every changed line is
   * recorded with who changed it and the old and new figure (D16).
   */
  async saveBoxCosts(id: string, containerNo: number, lines: BoxCostLineInput[], actor: { userID: string; companyID: string }): Promise<void> {
    const sailing = await this.get(id, actor.companyID);
    const checked = checkBoxCosts(containerNo, sailing.containerCount, lines);
    if ("error" in checked) throw APIError.invalidArgument(checked.error);
    const stored = (await boxCostRepo.list(sailing.id, actor.companyID)).map(storedCost).filter((s) => s.containerNo === containerNo);
    await boxCostRepo.save(sailing.id, actor.companyID, containerNo, boxCostChanges(stored, checked.lines), { id: actor.userID, name: await userNameOf(actor.userID) });
  }

  /** The record of the box costs' changes, the last one first. */
  async boxCostChanges(id: string, companyId: string): Promise<BoxCostChange[]> {
    const sailing = await this.get(id, companyId);
    return (await boxCostRepo.changes(sailing.id, companyId)).map((c) => ({
      id: c.id,
      containerNo: c.containerNo,
      kind: c.kind as BoxCostKind,
      oldAmount: c.oldAmount === null ? null : Number(c.oldAmount),
      oldCurrency: c.oldCurrency,
      oldNote: c.oldNote,
      newAmount: c.newAmount === null ? null : Number(c.newAmount),
      newCurrency: c.newCurrency,
      newNote: c.newNote,
      changedByName: c.changedByName,
      changedAt: c.changedAt.toISOString(),
    }));
  }

  /** The shipments taken off the sailing, the last one first, with who took each off and why. */
  async removed(id: string, companyId: string): Promise<SailingRemovedShipment[]> {
    const sailing = await this.get(id, companyId);
    return (await repo.removedFrom(sailing.id, companyId)).map(({ movedToVessel, movedToVoyage, ...r }) => ({
      ...r,
      movedTo: [movedToVessel, movedToVoyage].filter(Boolean).join(" "),
      removedAt: (r.removedAt ?? r.linkedAt).toISOString(),
      linkedAt: r.linkedAt.toISOString(),
    }));
  }

  /** "Edit sailing": its number of containers and its cut-off. Not while the service is closed. */
  async setDetails(id: string, details: SailingDetails, companyId: string): Promise<CoLoadingSailingItem> {
    const problem = sailingDetailsProblem(details);
    if (problem) throw APIError.invalidArgument(problem);
    const sailing = await this.get(id, companyId);
    await coLoadingServiceService.requireOpen(sailing.serviceId, companyId);
    const row = await repo.setDetails(sailing.id, companyId, details);
    if (!row) throw APIError.notFound("Sailing not found");
    return toItem(row);
  }

  /**
   * "Move to another sailing": the shipment leaves this sailing for another of the same service,
   * with the reason it is left behind here, in one turn. Not while the service is closed.
   */
  async moveShipment(sailingId: string, shipmentId: string, toSailingId: string, reason: string, actor: { userID: string; companyID: string }): Promise<void> {
    const from = await this.get(sailingId, actor.companyID);
    await coLoadingServiceService.requireOpen(from.serviceId, actor.companyID);
    const to = isUuid(toSailingId) ? await repo.get(toSailingId, actor.companyID) : null;
    const refusal = moveRefusal(from, to, reason);
    if (refusal) throw APIError.invalidArgument(refusal);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    if (!isUuid(shipmentId) || !(await repo.move(from.id, toSailingId, shipmentId, actor.companyID, by, reason.trim()))) throw APIError.notFound("The shipment is not on this sailing.");
  }

  /**
   * Links the shipments to the sailing (its box), all or none: each must be the service's own (its
   * Service Name) and on no sailing yet. Not while the service is closed.
   */
  async linkShipments(sailingId: string, shipmentIds: string[], actor: { userID: string; companyID: string }): Promise<{ linked: number }> {
    const ids = [...new Set(shipmentIds)];
    if (ids.length === 0) throw APIError.invalidArgument("Pick the shipments to link.");
    const sailing = await this.get(sailingId, actor.companyID);
    const service = await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const found = await repo.shipmentsToLink(ids.filter(isUuid), actor.companyID);
    if (found.length !== ids.length) throw APIError.notFound("A shipment to link was not found.");
    const onSailing = new Map((await repo.sailingsOf(ids, actor.companyID)).map((l) => [l.shipmentId, { id: l.sailingId, name: [l.vessel, l.voyage].filter(Boolean).join(" ") }]));
    const refusals = found.flatMap((s) => linkRefusal({ ...s, onSailing: onSailing.get(s.id) ?? null }, service.serviceName, sailingId) ?? []);
    if (refusals.length > 0) throw APIError.failedPrecondition(refusals.join(" "));
    const linked = await repo.link(sailingId, ids, actor.companyID, { id: actor.userID, name: await userNameOf(actor.userID) });
    // Linked meanwhile by someone else: nothing is linked, and the list read again shows where.
    if (!linked) throw APIError.alreadyExists("A shipment was linked to a sailing meanwhile: nothing was linked. Try again.");
    return { linked: ids.length };
  }

  /** Takes a shipment off the sailing. Not while the service is closed. */
  async unlinkShipment(sailingId: string, shipmentId: string, actor: { userID: string; companyID: string }): Promise<void> {
    const sailing = await this.get(sailingId, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    if (!isUuid(shipmentId) || !(await repo.unlink(sailingId, shipmentId, actor.companyID, by))) throw APIError.notFound("The shipment is not on this sailing.");
  }

  /**
   * A deleted shipment leaves the box it was in, and the sailing's history says so. Best effort:
   * the shipment is gone either way, and a link left behind is not counted (its shipment is deleted).
   */
  async shipmentDeleted(shipmentId: string, companyId: string, userId?: string): Promise<void> {
    await repo.dropDeletedShipment(shipmentId, companyId, { id: userId ?? null, name: userId ? await userNameOf(userId) : "" });
  }

  async create(serviceId: string, input: SailingInput, actor: { userID: string; companyID: string }): Promise<CoLoadingSailingItem> {
    const checked = checkSailingInput(input);
    if ("error" in checked) throw APIError.invalidArgument(checked.error);
    // A closed service takes nothing new until it is reopened.
    const service = await coLoadingServiceService.requireOpen(serviceId, actor.companyID);
    const row = await repo.create({
      companyId: actor.companyID,
      serviceId: service.id,
      ...checked.values,
      createdById: actor.userID,
      createdByName: await userNameOf(actor.userID),
    });
    return toItem(row);
  }
}

export const coLoadingSailingService = new CoLoadingSailingService();
