import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { fx, invoicing } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { capacityOf, containerCapacity } from "../../../lib/containerCapacity";
import type { BoxCostChange, BoxUtilization, CoLoadingSailingItem, SailingEarnings, SailingProfit, SailingRemovedShipment, ShipmentSailing } from "../interfaces/interfaces";
import { boxCostsOf, checkBoxCosts, type BoxCostLineInput, type BoxCostStored, type BoxRates } from "../lib/coLoadingBoxCosts";
import { canManageServices } from "../lib/coLoadingService";
import { BoxCostsChangedMeanwhile, coLoadingBoxCostRepository as boxCostRepo } from "../repositories/coLoadingBoxCost.repository";
import { sailingEarnings, sailingProfit, type ShipmentMoney } from "../lib/coLoadingEarnings";
import { boxFillOf, boxUtilization } from "../lib/boxUtilization";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { checkSailingInput, LINK_AT_ONCE_MAX, linkRefusal, moveRefusal, oddInBox, sailingEdit, sailingRemovalRefusal, type SailingDetails, type SailingInput } from "../lib/coLoadingSailing";
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

/** How many shipments' money Invoicing answers in one call. */
const MONEY_AT_ONCE = 500;

/** How many days' rates the list of sailings reads at once: the rates service's connections are shared by every page. */
const RATE_DAYS_AT_ONCE = 4;

/** Today in Prague, YYYY-MM-DD: the day a departure date is judged against. */
const today = () => businessDay(new Date());

/** The shipments a master job shares costs into. */
const mastersOf = (linked: readonly LinkedCargo[]) => new Set(linked.filter((s) => s.masterJobId).map((s) => s.id));

/**
 * The money of these shipments by id, from Invoicing, 500 at a time; null when it could not be
 * read - then nothing is known, and nothing is shown as 0.
 */
async function moneyOf(linked: readonly LinkedCargo[]): Promise<Map<string, ShipmentMoney> | null> {
  const money = new Map<string, ShipmentMoney>();
  try {
    for (let i = 0; i < linked.length; i += MONEY_AT_ONCE) {
      const { items } = await invoicing._internalCoLoadingMoney({
        jobs: linked.slice(i, i + MONEY_AT_ONCE).map((s) => ({
          shipmentId: s.id,
          tradeDirection: s.tradeDirection,
          estimatedArrival: s.estimatedArrival,
          estimatedDeparture: s.estimatedDeparture,
          actualArrival: s.actualArrival,
          actualDeparture: s.actualDeparture,
        })),
      });
      for (const m of items) money.set(m.shipmentId, m);
    }
    return money;
  } catch (err) {
    log.warn(err, "Co-Loading earnings: the shipments' money could not be read", { shipments: linked.length });
    return null;
  }
}

/**
 * The ČNB rates that value box costs: those of the departure date (D10), the latest ones while the
 * sailing has none. null when they could not be read - then only CZK amounts are valued and the
 * other currencies are named as left out.
 */
async function ratesOn(departureDate: string | null): Promise<BoxRates | null> {
  try {
    const on = await fx.fxRatesOn(departureDate ? { date: departureDate } : {});
    // A fixing that should be stored and is not (the import failed) is no rate to trust yet.
    return { rates: new Map(on.rates.map((r) => [r.currency, r.rate])), fixingDate: on.fixingDate, provisional: on.provisional || on.missing };
  } catch (err) {
    log.warn(err, "Co-Loading earnings: the rates for the box costs could not be read", { departureDate });
    return null;
  }
}

/** The rates of these departure dates ("" = no date: the latest rates), read RATE_DAYS_AT_ONCE at a time. */
async function ratesOfDays(days: readonly string[]): Promise<Map<string, BoxRates | null>> {
  const out = new Map<string, BoxRates | null>();
  const left = [...days];
  const reader = async () => {
    for (let day = left.shift(); day !== undefined; day = left.shift()) out.set(day, await ratesOn(day || null));
  };
  await Promise.all(Array.from({ length: Math.min(RATE_DAYS_AT_ONCE, left.length) }, reader));
  return out;
}

/** A stored box cost as the rules read it. */
const storedCost = (r: { containerNo: number; kind: string; amount: string | null; currency: string; note: string }): BoxCostStored => ({
  containerNo: r.containerNo,
  kind: r.kind,
  amount: r.amount === null ? null : Number(r.amount),
  currency: r.currency,
  note: r.note,
});

/**
 * The fill of a sailing's containers together, on this service, holding these shipments, planned to the company's share of their volume. A cancelled
 * one is listed, not counted; one of another kind than the box is for is counted and remarked on.
 */
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
   * Breakdown (Invoicing), beside each shipment's W/M (lib/coLoadingEarnings). For managers: the
   * controller lets only them ask. Money that cannot be read is said to be not known.
   */
  async earnings(id: string, companyId: string): Promise<SailingEarnings> {
    const sailing = await this.get(id, companyId);
    const service = await coLoadingServiceService.get(sailing.serviceId, companyId);
    const linked = await repo.boxShipments(sailing.id, companyId);
    const box = fillOf(sailing, service, await coLoadingServiceService.planningVolumePct(companyId), linked);
    const stored = (await boxCostRepo.list(sailing.id, companyId)).map(storedCost);
    // The rates are asked for only once a cost is set.
    const day = stored.some((s) => s.amount !== null) ? await ratesOn(sailing.departureDate) : null;
    return sailingEarnings(box.rows, await moneyOf(linked), mastersOf(linked), boxCostsOf(sailing.containerCount, stored, day, sailing.departureDate), box.fullPct);
  }

  /**
   * The profit of each of a service's sailings, for the list of sailings (D19). For managers: the
   * controller lets only them ask. Worked out as each sailing's Earnings tab does, but read
   * together (Council Review 7, K16): the cargo and the box costs of all sailings in one read each,
   * the shipments' money in one call per 500 shipments, and the rates once per departure date among
   * the sailings with a box cost, four dates at a time. The rates reads grow with those dates, about
   * one per sailing that has costs: the four at a time keep them from taking every connection of
   * the rates service.
   */
  async profits(serviceId: string, companyId: string): Promise<SailingProfit[]> {
    const service = await coLoadingServiceService.get(serviceId, companyId);
    const rows = await repo.listByService(serviceId, companyId);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [cargo, planningPct, costs] = await Promise.all([repo.boxShipmentsOf(ids, companyId), coLoadingServiceService.planningVolumePct(companyId), boxCostRepo.listOf(ids, companyId)]);
    const costsOf = new Map<string, BoxCostStored[]>();
    for (const c of costs) costsOf.set(c.sailingId, [...(costsOf.get(c.sailingId) ?? []), storedCost(c)]);
    const money = await moneyOf([...cargo.values()].flat());
    // One read of the rates per departure date among the sailings that have a cost set ("" = no date: the latest rates).
    const days = await ratesOfDays([...new Set(rows.filter((r) => costsOf.get(r.id)?.some((c) => c.amount !== null)).map((r) => r.departureDate ?? ""))]);
    return rows.map((r) => {
      const linked = cargo.get(r.id) ?? [];
      const box = fillOf(r, service, planningPct, linked);
      const boxCosts = boxCostsOf(r.containerCount, costsOf.get(r.id) ?? [], days.get(r.departureDate ?? "") ?? null, r.departureDate);
      return sailingProfit(r.id, sailingEarnings(box.rows, money, mastersOf(linked), boxCosts, box.fullPct));
    });
  }

  /**
   * Sets one container's Origin Costs, Ocean Freight and Destination Costs. For managers and admins
   * (the controller); allowed on a closed service too, to correct them (D17). Every changed line is
   * recorded with who changed it and the old and new figure (D16).
   */
  async saveBoxCosts(id: string, containerNo: number, lines: BoxCostLineInput[], expected: BoxCostLineInput[] | null, actor: { userID: string; companyID: string }): Promise<void> {
    const sailing = await this.get(id, actor.companyID);
    const checked = checkBoxCosts(containerNo, sailing.containerCount, lines);
    if ("error" in checked) throw APIError.invalidArgument(checked.error);
    try {
      await boxCostRepo.save(sailing.id, actor.companyID, containerNo, checked.lines, expected, { id: actor.userID, name: await userNameOf(actor.userID) });
    } catch (err) {
      // Somebody else saved this container's costs since the dialog read them (K12): nothing is overwritten unseen.
      if (err instanceof BoxCostsChangedMeanwhile)
        throw APIError.failedPrecondition(`These costs were changed meanwhile${err.by ? ` by ${err.by}` : ""}. Nothing was saved: close the dialog and open it again to see them.`);
      throw err;
    }
  }

  /** One sailing for its page: with the containers that have box costs, which decide who may edit it (K13). No money. */
  async page(id: string, companyId: string): Promise<CoLoadingSailingItem> {
    const sailing = await this.get(id, companyId);
    return { ...sailing, costedContainers: await boxCostRepo.costedContainers(sailing.id, companyId) };
  }

  /** The record of the box costs' changes, the last one first. */
  async boxCostChanges(id: string, companyId: string): Promise<BoxCostChange[]> {
    const sailing = await this.get(id, companyId);
    return (await boxCostRepo.changes(sailing.id, companyId)).map((c) => ({
      id: c.id,
      containerNo: c.containerNo,
      kind: c.kind as BoxCostChange["kind"],
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

  /**
   * "Edit sailing": its vessel, voyage, ports, HUB and container type, its number of containers, its
   * cut-off and its departure date (Council Outlay 14, A2). Not while the service is closed. The
   * container type, the number of containers and the departure date move the box costs, so once a
   * box cost is set only managers and admins change them (Council Review 7, K13), and every change
   * goes into the record of changes, written with it. The change is judged on the sailing as
   * it is under its lock (repository setDetailsRecorded), so no box cost is set in between.
   */
  async setDetails(id: string, details: SailingDetails, actor: { userID: string; companyID: string; role: string }): Promise<CoLoadingSailingItem> {
    const sailing = await this.get(id, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    // The name first: the record keeps it, and a lookup that fails must leave nothing written.
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    const context = { today: today(), mayMoveCosts: canManageServices(actor.role) };
    const row = await repo.setDetailsRecorded(sailing.id, actor.companyID, details, by, (now, costedContainers) => {
      const edit = sailingEdit(now, details, { ...context, costedContainers });
      if ("invalid" in edit) throw APIError.invalidArgument(edit.invalid);
      if ("denied" in edit) throw APIError.permissionDenied(edit.denied);
      return edit;
    });
    if (!row) throw APIError.notFound("Sailing not found");
    return toItem(row);
  }

  /**
   * Removes a sailing made by mistake (Council Outlay 14, D4): a manager or admin, while it holds no
   * shipment and no box cost, and not while the service is closed. Judged under the sailing's lock,
   * so nothing is linked or costed in between.
   */
  async remove(id: string, actor: { companyID: string; role: string }): Promise<void> {
    const sailing = await this.get(id, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const mayRemove = canManageServices(actor.role);
    const gone = await repo.removeJudged(sailing.id, actor.companyID, (linkedShipments, costedContainers) => {
      const refusal = sailingRemovalRefusal({ linkedShipments, costedContainers }, mayRemove);
      if (refusal && "denied" in refusal) throw APIError.permissionDenied(refusal.denied);
      if (refusal) throw APIError.failedPrecondition(refusal.refused);
    });
    if (!gone) throw APIError.notFound("Sailing not found");
  }

  /** The sailing each of these shipments is on, by shipment, for the Shipments list's Sailing column: one read for the page. */
  async sailingsOfShipments(shipmentIds: string[], companyId: string): Promise<Map<string, { id: string; serviceId: string; name: string }>> {
    const rows = await repo.sailingsOf(shipmentIds, companyId);
    return new Map(rows.map((l) => [l.shipmentId, { id: l.sailingId, serviceId: l.serviceId, name: [l.vessel, l.voyage].filter(Boolean).join(" ") }]));
  }

  /**
   * A shipment's place in Co-Loading, for its own page (Council Outlay 14, A1): the sailing it is
   * on with how full that box is, and the sailings still to come it could go on - those of the open
   * services that stand for its Service Name and take its kind of shipment. No money.
   */
  async ofShipment(shipmentId: string, companyId: string): Promise<ShipmentSailing> {
    const [shipment] = isUuid(shipmentId) ? await repo.shipmentsToLink([shipmentId], companyId) : [];
    if (!shipment) throw APIError.notFound("Shipment not found");
    const [on, open, planningPct] = await Promise.all([
      repo.sailingOfShipment(shipment.id, companyId),
      coLoadingServiceService.list(companyId, "user"),
      coLoadingServiceService.planningVolumePct(companyId),
    ]);
    const own = shipment.serviceName.trim().toLowerCase();
    const services = own ? open.filter((s) => s.serviceName.trim().toLowerCase() === own && !oddInBox(s.mode, shipment)) : [];
    const coming = await repo.comingOfServices(services.map((s) => s.id), companyId, today());
    // A closed service's sailing still shows on its shipment: it stays in the app.
    const onService = on ? (services.find((s) => s.id === on.serviceId) ?? (await coLoadingServiceService.get(on.serviceId, companyId))) : null;
    const cargo = await repo.boxShipmentsOf([...new Set([...(on ? [on.id] : []), ...coming.map((c) => c.id)])], companyId);
    const withFill = (r: CoLoadingSailingRecord, service: { name: string; mode: string; inlandWeightKg: number | null }) => ({
      ...toItem(r),
      serviceLabel: service.name,
      fill: boxFillOf(fillOf(r, service, planningPct, cargo.get(r.id) ?? [])),
    });
    return {
      on: on && onService ? { ...withFill(on, onService), serviceClosed: onService.closedAt !== null } : null,
      services: services.map((s) => ({ id: s.id, name: s.name })),
      coming: coming.flatMap((c) => {
        const service = services.find((s) => s.id === c.serviceId);
        return service ? [withFill(c, service)] : [];
      }),
    };
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
    // A shipment the box is not for stays out of the next box too (K3): it is taken off, not moved on.
    const service = await coLoadingServiceService.get(from.serviceId, actor.companyID);
    const [moved] = isUuid(shipmentId) ? await repo.shipmentsToLink([shipmentId], actor.companyID) : [];
    const odd = moved ? oddInBox(service.mode, moved) : null;
    if (moved && odd) throw APIError.failedPrecondition(`${moved.jobNumber} is ${odd}: it cannot go on another sailing of this service. Remove it from this one instead.`);
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
    // The API takes no more (MaxLen); never some of them in silence.
    if (ids.length > LINK_AT_ONCE_MAX) throw APIError.invalidArgument(`Link at most ${LINK_AT_ONCE_MAX} shipments at once.`);
    const sailing = await this.get(sailingId, actor.companyID);
    const service = await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const found = await repo.shipmentsToLink(ids.filter(isUuid), actor.companyID);
    if (found.length !== ids.length) throw APIError.notFound("A shipment to link was not found.");
    const onSailing = new Map((await repo.sailingsOf(ids, actor.companyID)).map((l) => [l.shipmentId, { id: l.sailingId, name: [l.vessel, l.voyage].filter(Boolean).join(" ") }]));
    const refusals = found.flatMap((s) => linkRefusal({ ...s, onSailing: onSailing.get(s.id) ?? null }, service.serviceName, sailingId, service.mode) ?? []);
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
    const checked = checkSailingInput(input, today());
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
