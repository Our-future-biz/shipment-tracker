import { type Tx } from "../db/db";
import { internalRepository } from "../repositories/internal.repository";
import { truckingOutboxRepository, type TruckingOutboxInput } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import type { TruckingExceptionRecord } from "../schemas/avizace.schema";
import type { NewTruckingInternalChargeRecord } from "../schemas/internal.schema";
import type { RateRequest } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { consignmentLine, monthOf, NOT_PRICED, targetMonth, unreversed } from "../lib/internalBilling";
import { internalCosts } from "../lib/truckingLinks";
import { isPriced } from "../lib/rateEngine";
import { rateService } from "./rate.service";

// Internal billing as it happens (Phase 6 C): a delivered internal consignment's POD writes its
// charge from the Internal tariff (in the month of the delivery, or - that month closed - in the
// current month as an adjustment), a voided POD writes the reversal, an exception charged to an
// internal consignment adds an EXCEPTION row. Every write runs in the caller's transaction with
// the ledger locked and re-sends the job's one internal buying line (the sum of the consignment's
// rows, with the statement numbers of its closed months). Month close and statements are in
// internalMonth.service.ts.

type BillingActor = Pick<Actor, "userID" | "role" | "companyID">;
type Charged = Pick<TruckingConsignmentRecord, "id" | "ref" | "shipmentId" | "jobNumber" | "department" | "deliveredAt" | "serviceLevel" | "chargeableKg">;

/** What the Internal tariff gives a consignment: the CZK amount, or why it could not be priced. */
interface InternalPrice {
  amount: number;
  tariffVersionId: string | null;
  chargeableKg: number | null;
  text: string;
  notPriced: boolean;
}

class InternalBillingService {
  /** The Internal tariff's price of a consignment (rating date = pick-up date); never throws. */
  async price(companyId: string, request: RateRequest | null): Promise<InternalPrice> {
    const notPriced = (why: string): InternalPrice => ({ amount: 0, tariffVersionId: null, chargeableKg: null, text: `${NOT_PRICED}: ${why}`, notPriced: true });
    if (!request) return notPriced("no service level, or not a CZ → CZ consignment");
    try {
      const rated = await rateService.rate(companyId, { ...request, includeBuy: false, includeInternal: true });
      const side = rated.results[0]?.internal ?? null;
      if (!side) return notPriced("the service level is not in the trucking settings");
      if (!isPriced(side)) return notPriced(side.reason);
      return {
        amount: side.totalCzk,
        tariffVersionId: side.tariffVersionId,
        chargeableKg: side.chargeable.basis === "KG" ? side.chargeable.quantity : null,
        text: `Internal road freight, ${side.tariffName} v${side.versionNo}`,
        notPriced: false,
      };
    } catch {
      return notPriced("the Internal tariff could not be rated");
    }
  }

  /**
   * POD received on an internal consignment: its charge from the Internal tariff in the month of
   * the delivery (Prague); that month closed → the current month, as an ADJUSTMENT saying so. Not
   * priced → amount 0 and "Not priced: …" (the month cannot be closed until it is reversed).
   */
  async chargeDelivered(tx: Tx, actor: BillingActor, c: Charged, by: string, request: RateRequest | null): Promise<void> {
    const companyId = actor.companyID;
    const price = await this.price(companyId, request);
    await internalRepository.lockLedger(tx, companyId);
    const deliveredAt = c.deliveredAt ?? new Date();
    const own = monthOf(deliveredAt);
    const closed = new Set((await internalRepository.closedMonths(companyId, [own], tx)).map((m) => m.month));
    const { month, note } = targetMonth(own, monthOf(new Date()), closed);
    await internalRepository.insertCharges(tx, [
      {
        ...this.base(companyId, c, deliveredAt, by),
        month,
        serviceLevel: c.serviceLevel,
        chargeableKg: price.chargeableKg ?? c.chargeableKg,
        tariffVersionId: price.tariffVersionId,
        amount: price.amount,
        kind: note ? "ADJUSTMENT" : "CHARGE",
        description: `${price.text}${note}`,
        notPriced: price.notPriced,
      },
    ]);
    await appendEvent(tx, companyId, {
      kind: "internal_charged",
      consignmentId: c.id,
      byUserId: null,
      byName: by,
      payload: {
        changes: {},
        summary: price.notPriced
          ? `Internal charge for ${c.department} in ${month} not priced: ${price.text.slice(NOT_PRICED.length + 2)}`
          : `Charged internally to ${c.department}: ${price.amount} CZK in ${month}${note}`,
        facts: { month, amount: price.amount, notPriced: price.notPriced },
      },
    });
    await this.sendLine(tx, actor, c);
  }

  /** POD voided (or the delivery undone): every delivery charge not yet reversed is reversed by an ADJUSTMENT; a closed month is never touched. */
  async reverseDelivered(tx: Tx, actor: BillingActor, c: Charged, by: string, why: string): Promise<void> {
    const companyId = actor.companyID;
    await internalRepository.lockLedger(tx, companyId);
    const rows = await internalRepository.chargesForConsignment(companyId, c.id, tx);
    const open = unreversed(rows).filter((r) => !r.exceptionId && !r.reversesId);
    if (!open.length) return;
    const closed = new Set((await internalRepository.closedMonths(companyId, [...new Set(open.map((r) => r.month))], tx)).map((m) => m.month));
    const current = monthOf(new Date());
    const reversals: NewTruckingInternalChargeRecord[] = open.map((r) => {
      const { month, note } = targetMonth(r.month, current, closed);
      return {
        ...this.base(companyId, c, r.deliveredAt, by),
        month,
        serviceLevel: r.serviceLevel,
        chargeableKg: r.chargeableKg,
        tariffVersionId: r.tariffVersionId,
        amount: -r.amount,
        kind: "ADJUSTMENT",
        description: `Reversal of the ${r.month} charge: ${why}${note}`,
        reversesId: r.id,
      };
    });
    await internalRepository.insertCharges(tx, reversals);
    await appendEvent(tx, companyId, {
      kind: "internal_reversed",
      consignmentId: c.id,
      byUserId: null,
      byName: by,
      payload: { changes: {}, summary: `Internal charge reversed (${reversals.map((r) => r.month).join(", ")}): ${why}`, reason: why },
    });
    await this.sendLine(tx, actor, c);
  }

  /** An exception charged to an internal consignment: an EXCEPTION row in the current month (CZK). */
  async chargeException(tx: Tx, actor: BillingActor, c: Charged, e: Pick<TruckingExceptionRecord, "id">, amount: number, text: string, by: string): Promise<void> {
    const companyId = actor.companyID;
    await internalRepository.lockLedger(tx, companyId);
    const month = monthOf(new Date());
    await internalRepository.insertCharges(tx, [
      {
        ...this.base(companyId, c, c.deliveredAt ?? new Date(), by),
        month,
        serviceLevel: c.serviceLevel,
        chargeableKg: c.chargeableKg,
        amount,
        kind: "EXCEPTION",
        description: text,
        exceptionId: e.id,
      },
    ]);
    await appendEvent(tx, companyId, {
      kind: "internal_charged",
      consignmentId: c.id,
      byUserId: null,
      byName: by,
      payload: { changes: {}, summary: `${text}: ${amount} CZK charged internally to ${c.department} in ${month}`, facts: { month, amount, exceptionId: e.id } },
    });
    await this.sendLine(tx, actor, c);
  }

  /** The outbox row re-sending a consignment's internal line as it now stands. */
  async lineOwed(tx: Tx, actor: BillingActor, c: Pick<TruckingConsignmentRecord, "id" | "ref" | "shipmentId">): Promise<TruckingOutboxInput> {
    const charges = await internalRepository.chargesForConsignment(actor.companyID, c.id, tx);
    const statements = await internalRepository.statementsForMonths(actor.companyID, [...new Set(charges.map((x) => x.month))], tx);
    return {
      consignmentId: c.id,
      shipmentId: c.shipmentId,
      kind: "costs",
      payload: internalCosts(c, consignmentLine(charges, statements)) as unknown as Record<string, unknown>,
      actingUserId: actor.userID,
      actingRole: actor.role,
    };
  }

  private async sendLine(tx: Tx, actor: BillingActor, c: Charged): Promise<void> {
    await truckingOutboxRepository.enqueue(tx, actor.companyID, [await this.lineOwed(tx, actor, c)]);
  }

  private base(companyId: string, c: Charged, deliveredAt: Date, by: string) {
    return {
      companyId,
      consignmentId: c.id,
      consignmentRef: c.ref,
      shipmentId: c.shipmentId,
      jobNumber: c.jobNumber,
      department: c.department,
      deliveredAt,
      currency: "CZK" as const,
      createdBy: by,
    };
  }
}

export const internalBillingService = new InternalBillingService();
