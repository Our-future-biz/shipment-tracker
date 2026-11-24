import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { fx, invoicing } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { hasEveryWord } from "../../../lib/mainSearch";
import { capacityOf, containerCapacity } from "../../../lib/containerCapacity";
import type { BoxCostChange, BoxUtilization, CoLoadingBoard, CoLoadingSailingItem, SailingEarnings, SailingProfit, SailingPlanCargo, SailingRemovedShipment, SearchCoLoadingItem, ServiceTrend, ShipmentSailing } from "../interfaces/interfaces";
import { boxCostsOf, checkBoxCosts, type BoxCostLineInput, type BoxCostStored, type BoxRates } from "../lib/coLoadingBoxCosts";
import { canManageServices } from "../lib/coLoadingService";
import { BoxCostsChangedMeanwhile, coLoadingBoxCostRepository as boxCostRepo } from "../repositories/coLoadingBoxCost.repository";
import { sailingEarnings, sailingProfit, type ShipmentMoney } from "../lib/coLoadingEarnings";
import { boxFillOf, boxUtilization } from "../lib/boxUtilization";
import { planCargoOf, sailingReference } from "../lib/coLoadingPlanCargo";
import { boxOverNotice } from "../lib/coLoadingBoxOverNotice";
import { moneyOfRow, serviceTrend, withFloor } from "../lib/coLoadingServiceMoney";
import { boxIsOver, overStep } from "../lib/coLoadingCargoChange";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { checkSailingInput, isSailingStage, LINK_AT_ONCE_MAX, linkReasonRefusal, linkRefusal, moveRefusal, stageChange, oddInBox, sailingEdit, sailingRemovalRefusal, type SailingDetails, type SailingInput } from "../lib/coLoadingSailing";
import { userNameOf } from "../lib/userName";
import { companyUsers } from "../../../lib/companyUsers";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";
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
  stage: isSailingStage(r.stage) ? r.stage : "open",
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
    const earnings = sailingEarnings(box.rows, await moneyOf(linked), mastersOf(linked), boxCostsOf(sailing.containerCount, stored, day, sailing.departureDate), box.fullPct);
    // The service's minimum earning per W/M marks the rows below it (Council Outlay 14, B4).
    return withFloor(earnings, (await coLoadingServiceService.money(sailing.serviceId, companyId)).minEarningPerWm);
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
    return (await this.earningsOfService(serviceId, companyId)).map(({ row, earnings }) => sailingProfit(row.id, earnings));
  }

  /**
   * The service's trend (Council Outlay 14, B5): its last sailings that have left, with how full
   * each was, what it made and whether it covered its box. Live figures, worked out as the list of
   * sailings works out its profits. For managers: the controller lets only them ask.
   */
  async trend(serviceId: string, companyId: string): Promise<ServiceTrend> {
    const all = await this.earningsOfService(serviceId, companyId);
    return serviceTrend(
      all.map(({ row, fullPct, earnings }) => ({ sailingId: row.id, name: [row.vessel, row.voyage].filter(Boolean).join(" "), departureDate: row.departureDate, stage: row.stage, createdAt: row.createdAt, fullPct, earnings })),
      today(),
    );
  }

  /** Every sailing of the service with its earnings, read together (see `profits`). */
  private async earningsOfService(serviceId: string, companyId: string): Promise<{ row: Awaited<ReturnType<typeof repo.listByService>>[number]; fullPct: number | null; earnings: SailingEarnings }[]> {
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
      return { row: r, fullPct: box.fullPct, earnings: sailingEarnings(box.rows, money, mastersOf(linked), boxCosts, box.fullPct) };
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
   * Sets the sailing's stage by hand (Council Outlay 14, C3): Open, Closed for cargo, Departed,
   * Arrived, Devanned, in any order - a stage set by mistake is set back. Anyone; not while the
   * service is closed. The change goes into the sailing's record of changes.
   */
  async setStage(id: string, stage: string, actor: { userID: string; companyID: string }): Promise<CoLoadingSailingItem> {
    const sailing = await this.get(id, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    const row = await repo.setStageRecorded(sailing.id, actor.companyID, stage, by, (now) => {
      const judged = stageChange(now, stage);
      if ("error" in judged) throw APIError.invalidArgument(judged.error);
      return judged.change;
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

  /**
   * The board of all services (Council Outlay 14, A6): every open service's sailings still to come
   * with how full each box is and the room left, and each service's shipments waiting for a box.
   * For everyone; no money. Read together: the services, their coming sailings, the cargo of all
   * those boxes in two reads, and the waiting shipments in one.
   */
  async board(companyId: string): Promise<CoLoadingBoard> {
    // Open services only, as users see them: a closed one takes nothing new.
    const services = await coLoadingServiceService.list(companyId, "user");
    const [coming, planningPct, waiting] = await Promise.all([
      repo.comingOfServices(services.map((s) => s.id), companyId, today()),
      coLoadingServiceService.planningVolumePct(companyId),
      repo.waitingByKind(companyId, CANCELLED_STATUS),
    ]);
    const cargo = await repo.boxShipmentsOf(coming.map((c) => c.id), companyId);
    return {
      sailings: coming.flatMap((c) => {
        const service = services.find((s) => s.id === c.serviceId);
        if (!service) return [];
        const box = fillOf(c, service, planningPct, cargo.get(c.id) ?? []);
        return [
          {
            ...toItem(c),
            serviceLabel: service.name,
            fill: boxFillOf(box),
            free: { cbm: box.volume?.free ?? null, kg: box.weight?.free ?? null },
            cancelled: box.notCounted,
            dangerous: box.rows.filter((r) => r.counted && r.dangerous).length,
          },
        ];
      }),
      services: services.map((s) => {
        const own = s.serviceName.trim().toLowerCase();
        // Of its Service Name, and of the kind its box is for: a full load or an air job waits for no LCL box.
        const mine = own ? waiting.filter((w) => w.serviceName === own && !oddInBox(s.mode, w)) : [];
        return { id: s.id, name: s.name, frequency: s.frequency, waiting: mine.reduce((n, w) => n + w.shipments, 0) };
      }),
    };
  }

  /**
   * The profit of every sailing still to come, for the board (D8). For managers: the controller lets
   * only them ask. Each service's sailings are worked out as its own list does (profits).
   */
  async boardProfits(companyId: string): Promise<SailingProfit[]> {
    const services = await coLoadingServiceService.list(companyId, "user");
    const coming = await repo.comingOfServices(services.map((s) => s.id), companyId, today());
    const ids = new Set(coming.map((c) => c.id));
    const out: SailingProfit[] = [];
    for (const serviceId of new Set(coming.map((c) => c.serviceId))) out.push(...(await this.profits(serviceId, companyId)).filter((p) => ids.has(p.sailingId)));
    return out;
  }

  /**
   * The main search in Co-Loading Concept: the services `role` sees and their sailings that have
   * every word typed - in a service's name, Service Name, route or note; in a sailing's vessel,
   * voyage, ports or HUB. Services first, then sailings, the newest first.
   */
  async searchMain(companyId: string, role: string, q: string, limit: number): Promise<{ items: SearchCoLoadingItem[]; total: number }> {
    const services = await coLoadingServiceService.list(companyId, role);
    const sailings = await repo.listOfServices(services.map((s) => s.id), companyId);
    const found: SearchCoLoadingItem[] = [
      ...services
        .filter((s) => hasEveryWord([s.name, s.serviceName, s.origin, s.destination, s.note], q))
        .map((s) => ({ kind: "service", id: s.id, serviceId: s.id, title: s.name, serviceLabel: "", serviceName: s.serviceName, pol: s.origin, pod: s.destination, cutoffDate: null, departureDate: null, closed: s.closedAt !== null })),
      ...sailings.flatMap((r) => {
        const service = services.find((s) => s.id === r.serviceId);
        if (!service || !hasEveryWord([r.vessel, r.voyage, r.pol, r.pod, r.hub, service.name], q)) return [];
        return [{ kind: "sailing", id: r.id, serviceId: r.serviceId, title: [r.vessel, r.voyage].filter(Boolean).join(" "), serviceLabel: service.name, serviceName: service.serviceName, pol: r.pol, pod: r.pod, cutoffDate: r.cutoffDate, departureDate: r.departureDate, closed: service.closedAt !== null }];
      }),
    ];
    return { items: found.slice(0, limit), total: found.length };
  }

  /**
   * The sailing's box as the Loading Planner takes it (Council Outlay 14, C1): its counted shipments'
   * cargo lines under their job numbers. Read by everyone; a closed service's sailing too.
   */
  async planCargo(id: string, companyId: string): Promise<SailingPlanCargo> {
    const sailing = await this.get(id, companyId);
    const service = await coLoadingServiceService.get(sailing.serviceId, companyId);
    const linked = await repo.boxShipments(sailing.id, companyId);
    return planCargoOf(sailing, service.name, linked.map((s) => ({ ...s, cancelled: s.status === CANCELLED_STATUS })));
  }

  /** What a loading plan linked to the sailing is to call it now; null when the company has no such live sailing. */
  async referenceOf(id: string, companyId: string): Promise<string | null> {
    const row = isUuid(id) ? await repo.get(id, companyId) : null;
    if (!row) return null;
    const service = await coLoadingServiceService.get(row.serviceId, companyId).catch(() => null);
    return sailingReference(row, service?.name ?? "");
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
    if (!isUuid(shipmentId) || !(await repo.move(from.id, toSailingId, shipmentId, actor.companyID, by, reason.trim(), to && to.stage !== "open" ? reason.trim() : ""))) throw APIError.notFound("The shipment is not on this sailing.");
    await Promise.all([this.boxTouched(toSailingId, actor.companyID, [shipmentId]), this.boxTouched(from.id, actor.companyID)]);
  }

  /**
   * After the box's shipments changed by hand (linked, moved, taken off): remembers what each of
   * `linked` counts now as its figures of the day of linking, and sets the sailing's "told that it
   * is over" mark to how the box stands - quietly: whoever links over the limit was warned on the
   * screen (Council Outlay 14, C4). Best effort: the link itself is made either way.
   */
  private async boxTouched(sailingId: string, companyId: string, linked: readonly string[] = []): Promise<void> {
    try {
      const sailing = await repo.get(sailingId, companyId);
      if (!sailing) return;
      const service = await coLoadingServiceService.get(sailing.serviceId, companyId);
      const box = fillOf(sailing, service, await coLoadingServiceService.planningVolumePct(companyId), await repo.boxShipments(sailing.id, companyId));
      if (linked.length > 0) await repo.rememberLinked(sailing.id, companyId, box.rows.filter((r) => linked.includes(r.shipmentId)));
      const over = boxIsOver(box);
      if (over !== sailing.overNotified) await repo.setOverNotified(sailing.id, companyId, over);
    } catch (err) {
      log.warn(err, "Co-Loading: a box's remembered figures could not be brought up to date", { sailingId });
    }
  }

  /**
   * A shipment's cargo, or whether it counts (its status), was changed (Council Outlay 14, C4): when
   * that takes its sailing's box over the limit, a line goes into the shipment's chat tagging its
   * Person in Charge and Holiday Cover and whoever made the sailing (D11) - once, until the box is
   * back within its limits. Best effort, after the shipment is saved: it never fails the save.
   */
  async cargoChanged(shipmentId: string, companyId: string, authorId: string): Promise<void> {
    try {
      const [link] = await repo.sailingsOf([shipmentId], companyId);
      if (!link) return;
      const sailing = await repo.get(link.sailingId, companyId);
      if (!sailing) return;
      const service = await coLoadingServiceService.get(sailing.serviceId, companyId);
      const box = fillOf(sailing, service, await coLoadingServiceService.planningVolumePct(companyId), await repo.boxShipments(sailing.id, companyId));
      const step = overStep(boxIsOver(box), sailing.overNotified);
      if (step === "keep") return;
      await repo.setOverNotified(sailing.id, companyId, step === "tell");
      const row = box.rows.find((r) => r.shipmentId === shipmentId);
      if (step !== "tell" || !row) return;
      const shipment = await repo.peopleOf(shipmentId, companyId);
      if (!shipment) return;
      const notice = boxOverNotice(shipment, { name: [sailing.vessel, sailing.voyage].filter(Boolean).join(" "), createdById: sailing.createdById }, await companyUsers(), box, { now: row, change: row.sinceLinked ?? null }, authorId);
      await shipmentCommentRepository.createForCompany(companyId, { shipmentId, authorId, message: notice.message, mentionedUserIds: notice.tagged.map((u) => u.id) });
    } catch (err) {
      log.warn(err, "Co-Loading: a cargo change could not be checked against its box", { shipmentId });
    }
  }

  /** The shipments named, each once: at least one, at most what one call takes. */
  private several(shipmentIds: string[], doing: string): string[] {
    const ids = [...new Set(shipmentIds)];
    if (ids.length === 0) throw APIError.invalidArgument(`Pick the shipments to ${doing}.`);
    if (ids.length > LINK_AT_ONCE_MAX) throw APIError.invalidArgument(`At most ${LINK_AT_ONCE_MAX} shipments at once.`);
    if (!ids.every(isUuid)) throw APIError.notFound("A shipment is not on this sailing.");
    return ids;
  }

  /**
   * Moves several shipments to another sailing of the service with one reason, all or none (Council
   * Outlay 14, A9): the rules of a single move hold for each. Not while the service is closed.
   */
  async moveShipments(sailingId: string, shipmentIds: string[], toSailingId: string, reason: string, actor: { userID: string; companyID: string }): Promise<{ moved: number }> {
    const ids = this.several(shipmentIds, "move");
    const from = await this.get(sailingId, actor.companyID);
    await coLoadingServiceService.requireOpen(from.serviceId, actor.companyID);
    const to = isUuid(toSailingId) ? await repo.get(toSailingId, actor.companyID) : null;
    const refusal = moveRefusal(from, to, reason);
    if (refusal) throw APIError.invalidArgument(refusal);
    // A shipment the box is not for stays out of the next box too (K3): none is moved while one of them is such.
    const service = await coLoadingServiceService.get(from.serviceId, actor.companyID);
    const odd = (await repo.shipmentsToLink(ids, actor.companyID)).flatMap((s) => {
      const why = oddInBox(service.mode, s);
      return why ? [`${s.jobNumber} is ${why}`] : [];
    });
    if (odd.length > 0) throw APIError.failedPrecondition(`${odd.join(", ")}: ${odd.length === 1 ? "it" : "they"} cannot go on another sailing of this service. Remove ${odd.length === 1 ? "it" : "them"} from this one instead. Nothing was moved.`);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    if (!(await repo.moveMany(from.id, toSailingId, ids, actor.companyID, by, reason.trim(), to && to.stage !== "open" ? reason.trim() : ""))) throw APIError.notFound("A shipment is no longer on this sailing: nothing was moved. Read the list again.");
    await Promise.all([this.boxTouched(toSailingId, actor.companyID, ids), this.boxTouched(from.id, actor.companyID)]);
    return { moved: ids.length };
  }

  /** Takes several shipments off the sailing, all or none. Not while the service is closed. */
  async unlinkShipments(sailingId: string, shipmentIds: string[], actor: { userID: string; companyID: string }): Promise<{ removed: number }> {
    const ids = this.several(shipmentIds, "remove");
    const sailing = await this.get(sailingId, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    if (!(await repo.unlinkMany(sailing.id, ids, actor.companyID, by))) throw APIError.notFound("A shipment is no longer on this sailing: nothing was removed. Read the list again.");
    await this.boxTouched(sailing.id, actor.companyID);
    return { removed: ids.length };
  }

  /**
   * Links the shipments to the sailing (its box), all or none: each must be the service's own (its
   * Service Name) and on no sailing yet. Not while the service is closed. A sailing closed for cargo
   * or at a later stage takes them only with a reason.
   */
  async linkShipments(sailingId: string, shipmentIds: string[], actor: { userID: string; companyID: string }, reason?: string): Promise<{ linked: number }> {
    const ids = [...new Set(shipmentIds)];
    if (ids.length === 0) throw APIError.invalidArgument("Pick the shipments to link.");
    // The API takes no more (MaxLen); never some of them in silence.
    if (ids.length > LINK_AT_ONCE_MAX) throw APIError.invalidArgument(`Link at most ${LINK_AT_ONCE_MAX} shipments at once.`);
    const sailing = await this.get(sailingId, actor.companyID);
    const service = await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    // Closed for cargo or later: the shipment still goes on it, with the reason kept on its link (C3).
    const noReason = linkReasonRefusal(sailing.stage, reason);
    if (noReason) throw APIError.invalidArgument(noReason);
    const found = await repo.shipmentsToLink(ids.filter(isUuid), actor.companyID);
    if (found.length !== ids.length) throw APIError.notFound("A shipment to link was not found.");
    const onSailing = new Map((await repo.sailingsOf(ids, actor.companyID)).map((l) => [l.shipmentId, { id: l.sailingId, name: [l.vessel, l.voyage].filter(Boolean).join(" ") }]));
    const refusals = found.flatMap((s) => linkRefusal({ ...s, onSailing: onSailing.get(s.id) ?? null }, service.serviceName, sailingId, service.mode) ?? []);
    if (refusals.length > 0) throw APIError.failedPrecondition(refusals.join(" "));
    const linked = await repo.link(sailingId, ids, actor.companyID, { id: actor.userID, name: await userNameOf(actor.userID) }, sailing.stage === "open" ? "" : (reason ?? "").trim());
    // Linked meanwhile by someone else: nothing is linked, and the list read again shows where.
    if (!linked) throw APIError.alreadyExists("A shipment was linked to a sailing meanwhile: nothing was linked. Try again.");
    await this.boxTouched(sailingId, actor.companyID, ids);
    return { linked: ids.length };
  }

  /** Takes a shipment off the sailing. Not while the service is closed. */
  async unlinkShipment(sailingId: string, shipmentId: string, actor: { userID: string; companyID: string }): Promise<void> {
    const sailing = await this.get(sailingId, actor.companyID);
    await coLoadingServiceService.requireOpen(sailing.serviceId, actor.companyID);
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    if (!isUuid(shipmentId) || !(await repo.unlink(sailingId, shipmentId, actor.companyID, by))) throw APIError.notFound("The shipment is not on this sailing.");
    await this.boxTouched(sailingId, actor.companyID);
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
    const by = { id: actor.userID, name: await userNameOf(actor.userID) };
    const row = await repo.create({
      companyId: actor.companyID,
      serviceId: service.id,
      ...checked.values,
      createdById: by.id,
      createdByName: by.name,
    });
    // The service's default box costs, on each of the new sailing's containers (Council Outlay 14, B4):
    // it has costs from day one, which a manager corrects. Best effort - the sailing is made either way.
    const defaults = moneyOfRow(service).defaultBoxCosts;
    if (defaults) {
      try {
        for (let containerNo = 1; containerNo <= row.containerCount; containerNo++) await boxCostRepo.save(row.id, actor.companyID, containerNo, defaults.map((d) => ({ ...d, note: d.note || "Service default" })), null, by);
      } catch (err) {
        log.warn(err, "Co-Loading: a new sailing did not get its service's default box costs", { sailingId: row.id });
      }
    }
    return toItem(row);
  }
}

export const coLoadingSailingService = new CoLoadingSailingService();
