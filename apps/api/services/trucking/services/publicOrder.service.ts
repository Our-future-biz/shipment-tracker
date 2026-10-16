import { APIError } from "encore.dev/api";
import { inTx, type Tx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { truckingDocumentRepository } from "../repositories/truckingDocument.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingConsignmentRecord, TruckingHaulierLinkRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { PublicTransportOrder, Stop } from "../interfaces/interfaces";
import { consignmentStatus, stampTime, tripStatus } from "../lib/consignmentRules";
import { ltlTripStatus } from "../lib/ltlRules";
import { factsOf } from "../lib/consignmentView";
import { hashToken, looksLikeToken, tokenMatches } from "../lib/haulierToken";
import { checkUpload } from "../lib/truckingFiles";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import { consignmentService } from "./consignment.service";
import { insertDocument, storeFile } from "./truckingDocument.service";
import { deliverDue } from "./truckingOutbox.service";

// The haulier's page (no login): the transport order without the customer's prices, Confirm /
// Reject once, and the POD upload. The link's token is 32 random bytes; only its SHA-256 is
// stored. Unknown, revoked and expired links - and a cancelled trip - all get the same 404, so
// nothing can be learnt by trying tokens.

export const LINK_INVALID = "This link is no longer valid";
const MAX_NAME = 100;
const MAX_REASON = 500;

interface Opened {
  link: TruckingHaulierLinkRecord;
  trip: TruckingTripRecord;
  c: TruckingConsignmentRecord;
}

const publicStop = ({ id: _id, siteId: _siteId, ...s }: Stop): PublicTransportOrder["pickup"] => s;

export function publicOrder(o: Opened, podUploaded: boolean): PublicTransportOrder {
  const { trip, c, link } = o;
  const status: PublicTransportOrder["status"] = c.deliveredAt ? "DELIVERED" : trip.confirmedAt ? "CONFIRMED" : trip.rejectedAt ? "REJECTED" : "AWAITING_CONFIRMATION";
  return {
    orderNumber: trip.ref,
    haulierName: trip.haulierName,
    ourCompany: trip.ourCompanyName,
    plannedPickupDate: trip.plannedPickupDate,
    pickup: publicStop(c.pickup),
    delivery: publicStop(c.delivery),
    load: c.load,
    agreedPrice: trip.buy ? { total: trip.buy.total, currency: trip.buy.currency } : null,
    status,
    podUploaded,
    linkExpiresAt: link.expiresAt.toISOString(),
  };
}

/**
 * The haulier's answer to a transport order, once (a second answer is refused): the trip
 * confirmed (with an FTL trip's consignment) or rejected with the reason, and the event. `via`
 * says where it came from: the order's link or the haulier portal (both stored as LINK).
 */
export async function recordAnswer(
  tx: Tx,
  trip: TruckingTripRecord,
  c: TruckingConsignmentRecord | null,
  action: "CONFIRM" | "REJECT",
  who: string,
  reason: string,
  via: "LINK" | "PORTAL",
): Promise<void> {
  const companyId = trip.companyId;
  const now = new Date();
  const confirmedStatus = trip.kind === "FTL" ? tripStatus({ ...trip, confirmedAt: now }, c) : ltlTripStatus({ ...trip, confirmedAt: now });
  const values =
    action === "CONFIRM" ? { confirmedAt: now, confirmedVia: "LINK" as const, confirmedBy: who, status: confirmedStatus } : { rejectedAt: now, rejectReason: reason };
  const row = await tripRepository.update(tx, companyId, trip.id, values, { live: true, sent: true, unanswered: true });
  if (!row) throw APIError.failedPrecondition("This transport order was already answered");
  if (action === "CONFIRM" && trip.kind === "FTL" && c && !c.confirmedAt) {
    await consignmentRepository.update(
      tx,
      companyId,
      c.id,
      { confirmedAt: now, confirmedBy: who, status: consignmentStatus({ ...factsOf(c, row), confirmedAt: now }) },
      { stampEmpty: "confirmed", tripId: trip.id },
    );
  }
  await appendEvent(tx, companyId, {
    kind: action === "CONFIRM" ? "transport_order_confirmed" : "transport_order_rejected",
    tripId: trip.id,
    consignmentId: c?.id ?? null,
    customerId: trip.haulierCustomerId,
    byUserId: null,
    byName: who,
    payload: {
      changes: {},
      ...(reason ? { reason } : {}),
      summary: action === "CONFIRM" ? `Transport order ${trip.ref} confirmed by the haulier` : `Transport order ${trip.ref} rejected by the haulier: ${reason}`,
      facts: { via },
    },
  });
}

const name = (v: unknown, what: string, min: number, max: number): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) throw APIError.invalidArgument(`${what} (${min} to ${max} characters)`);
  return s;
};

class PublicOrderService {
  /** The live link of a token, its trip and consignment; the same 404 for anything else. */
  async open(token: string): Promise<Opened> {
    const invalid = () => APIError.notFound(LINK_INVALID);
    if (!looksLikeToken(token)) throw invalid();
    const link = await tripRepository.linkByHash(hashToken(token));
    if (!link || !tokenMatches(link.tokenHash, token) || link.revokedAt || link.expiresAt.getTime() < Date.now()) throw invalid();
    const trip = await tripRepository.find(link.companyId, link.tripId);
    if (!trip || trip.cancelledAt) throw invalid();
    const c = await consignmentRepository.findByTrip(link.companyId, trip.id);
    if (!c || c.cancelledAt) throw invalid();
    return { link, trip, c };
  }

  async get(token: string): Promise<PublicTransportOrder> {
    const o = await this.open(token);
    return publicOrder(o, await truckingDocumentRepository.hasPod(o.c.companyId, o.c.id));
  }

  /** Confirm or reject, once: a second answer is refused. A rejection needs the reason. */
  async respond(token: string, input: { action: unknown; name: unknown; reason: unknown }): Promise<PublicTransportOrder> {
    const o = await this.open(token);
    const { trip, c } = o;
    const action = input.action;
    if (action !== "CONFIRM" && action !== "REJECT") throw APIError.invalidArgument("The answer must be CONFIRM or REJECT");
    const who = `${name(input.name, "Give your name", 2, MAX_NAME)} (haulier)`;
    const reason = action === "REJECT" ? name(input.reason, "Give the reason for rejecting", 3, MAX_REASON) : "";
    if (trip.confirmedAt || trip.rejectedAt) throw APIError.failedPrecondition("This transport order was already answered");
    await inTx((tx) => recordAnswer(tx, trip, c, action, who, reason, "LINK"));
    return this.get(token);
  }

  /**
   * The POD through the link: a photo or a PDF of at most 10 MB. Stamps the pick-up and the
   * delivery when they are missing (at deliveredAt, default now) and POD received (source
   * HAULIER); a POD already stamped keeps its stamp and the file is added.
   */
  async pod(token: string, input: { fileName: unknown; fileBase64: unknown; deliveredAt: string | null; receiverName: unknown }): Promise<PublicTransportOrder> {
    const o = await this.open(token);
    const { trip } = o;
    if (trip.rejectedAt && !trip.confirmedAt) throw APIError.failedPrecondition("This transport order was rejected");
    const file = checkUpload(input.fileName, input.fileBase64, true);
    const receiver = typeof input.receiverName === "string" ? input.receiverName.trim().slice(0, MAX_NAME) : "";
    const now = new Date();
    const deliveredAt = stampTime(input.deliveredAt, now);
    const companyId = trip.companyId;
    const by = `${trip.haulierName} (haulier)`;
    const key = await storeFile(companyId, o.c.id, file);
    // What the haulier causes is sent to the job as the service identity ("Trucking (system)");
    // the haulier is named in the events.
    const actor = await serviceActor(companyId);
    await inTx(async (tx) => {
      await insertDocument(tx, companyId, o.c.id, file, key, { kind: "POD", source: "HAULIER", userId: null, name: receiver ? `${by}, received by ${receiver}` : by });
      // The stamps the POD proves, in order; each one guarded, each on the row the previous one left.
      let c = (await consignmentRepository.find(companyId, o.c.id, tx))!;
      if (!c.pickedUpAt) c = await consignmentService.stampInTx(tx, actor, c, trip, "pickedUp", deliveredAt, by, "HAULIER");
      if (!c.deliveredAt) c = await consignmentService.stampInTx(tx, actor, c, trip, "delivered", deliveredAt < c.pickedUpAt! ? c.pickedUpAt! : deliveredAt, by, "HAULIER");
      if (!c.podReceivedAt) await consignmentService.stampInTx(tx, actor, c, trip, "podReceived", now, by, "HAULIER");
    });
    await deliverDue(o.c.id);
    return this.get(token);
  }
}

export const publicOrderService = new PublicOrderService();
