import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { customers, invoicing, sales } from "~encore/clients";
import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingConsignmentRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { DocLanguageCode, FileDownload, LegKind, TripDetail, TruckingSettings } from "../interfaces/interfaces";
import type { DocParty } from "../lib/documentTypes";
import type { Actor } from "../../../lib/rbac";
import { emailConfigured, sendMail, type MailResult } from "../../../lib/email";
import { appUrl } from "../../../lib/appUrl";
import {
  cleanPin,
  cleanRecipients,
  consignmentStatus,
  fillOrderText,
  transportOrderRefusal,
  tripStatus,
} from "../lib/consignmentRules";
import { factsOf, moneyOf } from "../lib/consignmentView";
import { cmrDoc, EMPTY_PARTY, platesText, transportOrderDoc } from "../lib/truckingDocs";
import { asQuoteCompanyDetails, haulierParty, ourCompanyParty, type IssuerProfile, type QuoteCompanyDetails } from "../lib/truckingParties";
import { haulierLinkUrl, linkExpiry, newToken } from "../lib/haulierToken";
import { formatDay } from "../lib/format";
import { buildTransportOrderPdf } from "../lib/transportOrderPdf";
import { buildCmrPdf } from "../lib/cmrPdf";
import { buildLtlTransportOrderPdf } from "../lib/ltlTransportOrderPdf";
import { ltlTransportOrderDoc, type DocLeg } from "../lib/ltlDocs";
import { ltlTripStatus } from "../lib/ltlRules";
import { inStopOrder } from "../lib/ltlView";
import { userName } from "../lib/users";
import { haulierService } from "./haulier.service";
import { consignmentService } from "./consignment.service";
import { tripService } from "./trip.service";
import { deliverDue } from "./truckingOutbox.service";
import { settingsService } from "./settings.service";
import { ltlTrips } from "./ltlTrips";

// The transport order (print, send - recorded only while e-mail is off - and a confirmation the
// user records) and the CMR. The Pick-up PIN is typed by the user for each print or send: it goes
// into the PDF and nowhere else - no column, no event, no log; the event says only whether one
// was printed.

const LANGUAGES: readonly DocLanguageCode[] = ["cs", "en", "both"];

export interface TransportOrderPrintInput {
  pickupPin: string | null;
  language: DocLanguageCode;
}

export interface TransportOrderSendInput extends TransportOrderPrintInput {
  to: string[];
  note: string;
}

const pdfFile = (fileName: string, bytes: Uint8Array): FileDownload => ({
  fileName,
  fileBase64: Buffer.from(bytes).toString("base64"),
  contentType: "application/pdf",
});

const language = (v: unknown): DocLanguageCode => {
  if (!LANGUAGES.includes(v as DocLanguageCode)) throw APIError.invalidArgument("The language must be cs, en or both");
  return v as DocLanguageCode;
};

/** Who an internal call is made as when the request has no app user (the haulier portal). */
export type CallAs = Pick<Actor, "userID" | "companyID" | "role">;

const callOpts = (as?: CallAs) => (as ? { authData: as } : undefined);

/** Our company as printed (issuer details, the quotation details filling gaps); empty when neither can be read. */
export async function ourCompany(as?: CallAs): Promise<DocParty> {
  const [profile, quote] = await Promise.all([
    invoicing
      .invoiceProfileGet(callOpts(as))
      .then((r): IssuerProfile => r.profile)
      .catch((err: unknown) => {
        log.warn(err, "trucking: invoicing company details not read");
        return null;
      }),
    sales
      .prefGet({ prefKey: "company_details" }, callOpts(as))
      .then((r): QuoteCompanyDetails => asQuoteCompanyDetails(r.value))
      .catch((err: unknown) => {
        log.warn(err, "trucking: quotation company details not read");
        return null;
      }),
  ]);
  return profile || quote ? ourCompanyParty(profile, quote) : EMPTY_PARTY;
}

/** The haulier as printed, with its payment days; the address and contact from the Customer Database. */
export async function haulierOf(companyId: string, haulierId: string, as?: CallAs) {
  const detail = await haulierService.get(companyId, haulierId, as);
  const [customer, contacts] = await Promise.all([
    customers.customerGet({ id: haulierId }, callOpts(as)).then((r) => r.customer).catch(() => null),
    customers.contactList({ customerId: haulierId }, callOpts(as)).then((r) => r.data).catch(() => []),
  ]);
  const contact = contacts.find((x) => x.isMain) ?? contacts[0] ?? null;
  return {
    detail,
    party: haulierParty(detail, customer, contact),
    paymentDays: detail.profile.paymentDays,
    email: contact?.email ?? "",
  };
}

class TransportOrderService {
  // The trip, its consignment and whether a transport order may go out now (else failed_precondition).
  private async ready(actor: Actor, tripId: string) {
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    const c = await consignmentRepository.findByTrip(companyId, trip.id);
    if (!c) throw APIError.failedPrecondition("The trip has no consignment");
    const [settings, haulier] = await Promise.all([settingsService.get(companyId), haulierOf(companyId, trip.haulierCustomerId)]);
    const money = moneyOf(c, trip, settings.marginFloor);
    const refusal = transportOrderRefusal({
      consignmentCancelled: !!c.cancelledAt,
      tripCancelled: !!trip.cancelledAt,
      belowFloor: money.belowFloor,
      marginApproved: money.marginApproved,
      haulierName: trip.haulierName,
      haulierBlockIssues: haulier.detail.issues.filter((i) => i.severity === "block").map((i) => i.message),
    });
    if (refusal) throw APIError.failedPrecondition(refusal);
    return { trip, c, settings, haulier };
  }

  private async build(
    trip: TruckingTripRecord,
    c: TruckingConsignmentRecord,
    lang: DocLanguageCode,
    pin: string | null,
    podLink: string | null,
    haulier: { party: DocParty; paymentDays: number },
    vehicles: { code: string; label: string; tailLift: boolean }[],
    our: DocParty,
    pinAsGiven = false,
  ): Promise<Uint8Array> {
    const vehicle = vehicles.find((v) => v.code === trip.vehicleTypeCode) ?? null;
    const doc = transportOrderDoc({
      language: lang,
      issuedAt: new Date(),
      ourCompany: our,
      haulier: haulier.party,
      paymentDays: haulier.paymentDays,
      trip,
      vehicle: vehicle ? { label: vehicle.label, tailLift: vehicle.tailLift } : null,
      consignment: c,
      pickupPin: pin,
      pinAsGiven,
      podLink,
    });
    return buildTransportOrderPdf(doc);
  }

  /** Any user. The transport order as a PDF, the PIN printed when typed; the print is logged (PIN printed yes / no). */
  async pdf(actor: Actor, tripId: string, input: TransportOrderPrintInput): Promise<FileDownload> {
    const lang = language(input.language);
    const pin = cleanPin(input.pickupPin);
    if ((await tripService.load(actor.companyID, tripId)).kind !== "FTL") return this.pdfLtl(actor, tripId, lang, pin);
    const { trip, c, settings, haulier } = await this.ready(actor, tripId);
    const bytes = await this.build(trip, c, lang, pin, null, haulier, settings.vehicleTypes, await ourCompany());
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      if (pin) await tripRepository.update(tx, actor.companyID, trip.id, { pinPrinted: true }, { live: true });
      await appendEvent(tx, actor.companyID, {
        kind: "transport_order_printed",
        tripId: trip.id,
        consignmentId: c.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `Transport order ${trip.ref} printed${pin ? " (PIN printed)" : ""}`, facts: { pinPrinted: !!pin, language: lang } },
      });
    });
    return pdfFile(`${trip.ref}.pdf`, bytes);
  }

  /**
   * Any user. Sends the transport order - while e-mail is off it is recorded as sent ("recorded
   * only") and the PDF comes back for the user to send. A new haulier link (valid 30 days after the
   * planned pick-up) replaces the old one and is printed on the order. Trip and consignment become
   * ORDERED. The link's hash is stored in the trip's locked, version-checked transaction BEFORE the
   * order is mailed or returned: a send that loses a race (or any conflict) mails and returns
   * nothing, so the haulier never holds a link that was not stored.
   */
  async send(actor: Actor, tripId: string, input: TransportOrderSendInput): Promise<{ trip: TripDetail; recordedOnly: boolean; file: FileDownload }> {
    const lang = language(input.language);
    const pin = cleanPin(input.pickupPin);
    const to = cleanRecipients(input.to);
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
    const companyId = actor.companyID;
    if ((await tripService.load(companyId, tripId)).kind !== "FTL") return this.sendLtl(actor, tripId, lang, pin, to, note);
    const { trip, c, settings, haulier } = await this.ready(actor, tripId);
    const our = await ourCompany();
    const { token, hash } = newToken();
    const expiresAt = linkExpiry(trip.plannedPickupDate);
    const link = haulierLinkUrl(appUrl(), token);
    const bytes = await this.build(trip, c, lang, pin, link, haulier, settings.vehicleTypes, our);
    const file = pdfFile(`${trip.ref}.pdf`, bytes);
    // While e-mail is off every send is "recorded only"; a mail that fails later is recorded then.
    const mailing = emailConfigured() && to.length > 0;
    const by = await userName(actor.userID);
    const now = new Date();
    const sentRow = await inTx(async (tx) => {
      const locked = await tripRepository.lock(tx, companyId, trip.id);
      if (!locked || locked.cancelledAt || locked.version !== trip.version) throw APIError.aborted("The trip was changed by someone else. Reload and try again.");
      await tripRepository.renewLink(tx, companyId, trip.id, hash, expiresAt);
      const sent = { ...locked, orderSentAt: now, rejectedAt: null };
      const row = await tripRepository.update(
        tx,
        companyId,
        trip.id,
        {
          orderSentAt: now,
          orderSentBy: by,
          orderSentByUserId: actor.userID || null,
          orderSentByRole: actor.role,
          orderRecordedOnly: !mailing,
          orderTo: to,
          ...(pin ? { pinPrinted: true } : {}),
          ourCompanyName: our.name,
          rejectedAt: null,
          rejectReason: null,
          status: tripStatus(sent, c),
        },
        { live: true, version: trip.version },
      );
      if (!row) throw APIError.aborted("The trip was changed by someone else. Reload and try again.");
      const status = consignmentStatus({ ...factsOf(c, row) });
      if (status !== c.status) await consignmentRepository.update(tx, companyId, c.id, { status }, { tripId: trip.id, live: true });
      await appendEvent(tx, companyId, {
        kind: "transport_order_sent",
        tripId: trip.id,
        consignmentId: c.id,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary: `Transport order ${trip.ref} ${mailing ? "sent" : "marked as sent (recorded only)"}${to.length ? ` to ${to.join(", ")}` : ""}${pin ? " (PIN printed)" : ""}`,
          facts: { recordedOnly: !mailing, to, pinPrinted: !!pin, language: lang, note, linkExpiresAt: expiresAt.toISOString() },
        },
      });
      return row;
    });

    const texts = { orderRef: trip.ref, haulier: trip.haulierName, date: formatDay(trip.plannedPickupDate) };
    const mail = mailing
      ? await sendMail({
          to,
          cc: [],
          subject: fillOrderText(settings.transportOrder.emailSubject, texts),
          text: [fillOrderText(settings.transportOrder.emailBody, texts), note, `Confirm the order and upload the POD: ${link}`].filter(Boolean).join("\n\n"),
          attachments: [{ filename: file.fileName, content: file.fileBase64 }],
          idempotencyKey: `${trip.id}:${sentRow.version}`,
        })
      : null;
    if (mail && !mail.sent) await this.mailFailed(actor, sentRow, c.id, by, mail);
    return { trip: await tripService.get(actor, trip.id), recordedOnly: !mail?.sent, file };
  }

  // A transport order recorded as sent whose e-mail then failed: recorded only after all (the user
  // sends the PDF that came back), with the reason in the history. The stored link stays valid.
  private async mailFailed(actor: Actor, trip: TruckingTripRecord, consignmentId: string | null, by: string, mail: MailResult): Promise<void> {
    await inTx(async (tx) => {
      await tripRepository.update(tx, actor.companyID, trip.id, { orderRecordedOnly: true }, { live: true });
      await appendEvent(tx, actor.companyID, {
        kind: "transport_order_sent",
        tripId: trip.id,
        consignmentId,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary: `Transport order ${trip.ref}: the e-mail was not sent (${mail.timedOut ? "no answer from the provider in time" : mail.error}); send the PDF yourself`,
          facts: { recordedOnly: true, mailError: mail.error, timedOut: !!mail.timedOut },
        },
      });
    });
  }

  /** Any user: records the haulier's confirmation given by phone or e-mail (confirmedVia USER). */
  async confirm(actor: Actor, tripId: string, note: unknown): Promise<TripDetail> {
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is cancelled");
    if (!trip.orderSentAt) throw APIError.failedPrecondition("Send the transport order first");
    if (trip.confirmedAt) throw APIError.alreadyExists("The transport order is already confirmed");
    const c = await consignmentRepository.findByTrip(companyId, trip.id);
    const text = typeof note === "string" ? note.trim().slice(0, 1000) : "";
    const by = await userName(actor.userID);
    const now = new Date();
    await inTx(async (tx) => {
      const row = await tripRepository.update(
        tx,
        companyId,
        trip.id,
        {
          confirmedAt: now,
          confirmedVia: "USER",
          confirmedBy: by,
          status: trip.kind === "FTL" ? tripStatus({ ...trip, confirmedAt: now }, c) : ltlTripStatus({ ...trip, confirmedAt: now }),
        },
        { live: true, sent: true, unconfirmed: true },
      );
      if (!row) throw APIError.alreadyExists("The transport order is already confirmed");
      if (c && !c.confirmedAt && !c.cancelledAt) {
        await consignmentRepository.update(
          tx,
          companyId,
          c.id,
          { confirmedAt: now, confirmedBy: by, status: consignmentStatus({ ...factsOf(c, row), confirmedAt: now }) },
          { stampEmpty: "confirmed", tripId: trip.id },
        );
      }
      await appendEvent(tx, companyId, {
        kind: "transport_order_confirmed",
        tripId: trip.id,
        consignmentId: c?.id ?? null,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `Haulier's confirmation recorded${text ? `: ${text}` : ""}`, facts: { via: "USER", note: text } },
      });
    });
    return tripService.get(actor, trip.id);
  }

  // ---- LTL trips: one transport order with every stop ---------------------------------------------

  // An LTL trip, its legs in stop order with their consignments, and whether its transport order
  // may go out: not cancelled, with legs, no consignment below the floor without approval, the
  // haulier not blocked.
  private async readyLtl(actor: Actor, tripId: string) {
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    const [settings, haulier] = await Promise.all([settingsService.get(companyId), haulierOf(companyId, trip.haulierCustomerId)]);
    const { docLegs, consignments } = await this.docLegsOf(trip);
    const { legs: allLegs } = await consignmentService.ltlContext(companyId, consignments.map((c) => c.id));
    const low = consignments.find((c) => {
      const m = moneyOf(c, null, settings.marginFloor, allLegs);
      return m.belowFloor && !m.marginApproved;
    });
    const refusal = transportOrderRefusal({
      consignmentCancelled: false,
      tripCancelled: !!trip.cancelledAt,
      belowFloor: !!low,
      marginApproved: false,
      haulierName: trip.haulierName,
      haulierBlockIssues: haulier.detail.issues.filter((i) => i.severity === "block").map((i) => i.message),
    });
    if (refusal) throw APIError.failedPrecondition(low && !trip.cancelledAt ? `${low.ref}: ${refusal}` : refusal);
    if (!docLegs.length) throw APIError.failedPrecondition("The trip has no legs yet");
    return { trip, settings, haulier, docLegs, consignmentIds: consignments.map((c) => c.id) };
  }

  /** An LTL trip's legs in stop order with their consignments, as the transport order prints them. */
  private async docLegsOf(trip: TruckingTripRecord): Promise<{ docLegs: DocLeg[]; consignments: TruckingConsignmentRecord[] }> {
    const legs = inStopOrder(await legRepository.forTrips(trip.companyId, [trip.id]), trip.stopOrder);
    const consignments = await consignmentRepository.findMany(trip.companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    const docLegs = legs.map((l): DocLeg => ({ kind: l.kind as LegKind, toText: l.toText, toPostcode: l.toPostcode, consignment: byId.get(l.consignmentId)! }));
    return { docLegs, consignments };
  }

  /**
   * The haulier's copy of a sent transport order (the haulier portal), in Czech and English:
   * regenerated without a PIN - it says the PIN is given by the dispatcher - and without the
   * order link. Internal calls are made `as` the given app identity. The download is logged.
   */
  async haulierCopy(trip: TruckingTripRecord, as: CallAs, who: string): Promise<FileDownload> {
    const companyId = trip.companyId;
    const lang: DocLanguageCode = "both";
    const [settings, haulier, our] = await Promise.all([settingsService.get(companyId), haulierOf(companyId, trip.haulierCustomerId, as), ourCompany(as)]);
    let bytes: Uint8Array;
    let consignmentId: string | null = null;
    if (trip.kind === "FTL") {
      const c = await consignmentRepository.findByTrip(companyId, trip.id);
      if (!c) throw APIError.failedPrecondition("The trip has no consignment");
      consignmentId = c.id;
      bytes = await this.build(trip, c, lang, null, null, haulier, settings.vehicleTypes, our, true);
    } else {
      const { docLegs } = await this.docLegsOf(trip);
      if (!docLegs.length) throw APIError.failedPrecondition("The trip has no legs yet");
      bytes = await this.buildLtl(trip, docLegs, lang, null, haulier, settings, our, true);
    }
    await inTx((tx) =>
      appendEvent(tx, companyId, {
        kind: "transport_order_printed",
        tripId: trip.id,
        consignmentId,
        customerId: trip.haulierCustomerId,
        byUserId: null,
        byName: who,
        payload: { changes: {}, summary: `Transport order ${trip.ref} downloaded in the haulier portal`, facts: { pinPrinted: false, language: lang, via: "PORTAL" } },
      }),
    );
    return pdfFile(`${trip.ref}.pdf`, bytes);
  }

  private async buildLtl(
    trip: TruckingTripRecord,
    docLegs: DocLeg[],
    lang: DocLanguageCode,
    pin: string | null,
    haulier: { party: DocParty; paymentDays: number },
    settings: TruckingSettings,
    our: DocParty,
    pinAsGiven = false,
  ): Promise<Uint8Array> {
    if (trip.kind === "FTL") throw new Error("not an LTL trip");
    const vehicle = settings.vehicleTypes.find((v) => v.code === trip.vehicleTypeCode) ?? null;
    const doc = ltlTransportOrderDoc({
      language: lang,
      issuedAt: new Date(),
      ourCompany: our,
      haulier: haulier.party,
      paymentDays: haulier.paymentDays,
      trip: { ...trip, kind: trip.kind },
      vehicle: vehicle ? { label: vehicle.label, tailLift: vehicle.tailLift } : null,
      hub: settings.hub,
      legs: docLegs,
      pickupPin: pin,
      pinAsGiven,
      podLink: null,
    });
    return buildLtlTransportOrderPdf(doc);
  }

  private async pdfLtl(actor: Actor, tripId: string, lang: DocLanguageCode, pin: string | null): Promise<FileDownload> {
    const { trip, settings, haulier, docLegs } = await this.readyLtl(actor, tripId);
    const bytes = await this.buildLtl(trip, docLegs, lang, pin, haulier, settings, await ourCompany());
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      if (pin) await tripRepository.update(tx, actor.companyID, trip.id, { pinPrinted: true }, { live: true });
      await appendEvent(tx, actor.companyID, {
        kind: "transport_order_printed",
        tripId: trip.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `Transport order ${trip.ref} printed${pin ? " (PIN printed)" : ""}`, facts: { pinPrinted: !!pin, language: lang } },
      });
    });
    return pdfFile(`${trip.ref}.pdf`, bytes);
  }

  /**
   * An LTL trip's transport order sent (recorded only while e-mail is off). No haulier link: the
   * haulier's page shows one consignment, so for groupage the confirmation is recorded by the
   * user and the PODs are uploaded per consignment. The trip is announced to our warehouse.
   */
  private async sendLtl(
    actor: Actor,
    tripId: string,
    lang: DocLanguageCode,
    pin: string | null,
    to: string[],
    note: string,
  ): Promise<{ trip: TripDetail; recordedOnly: boolean; file: FileDownload }> {
    const companyId = actor.companyID;
    const { trip, settings, haulier, docLegs } = await this.readyLtl(actor, tripId);
    const our = await ourCompany();
    const file = pdfFile(`${trip.ref}.pdf`, await this.buildLtl(trip, docLegs, lang, pin, haulier, settings, our));
    // Recorded first (trip locked, version checked), mailed after: a send that loses a race mails nothing.
    const mailing = emailConfigured() && to.length > 0;
    const recordedOnly = !mailing;
    const by = await userName(actor.userID);
    const now = new Date();
    const sentRow = await inTx(async (tx) => {
      const locked = await tripRepository.lock(tx, companyId, trip.id);
      if (!locked || locked.cancelledAt || locked.version !== trip.version) throw APIError.aborted("The trip was changed by someone else. Reload and try again.");
      const values = {
        orderSentAt: now,
        orderSentBy: by,
        orderSentByUserId: actor.userID || null,
        orderSentByRole: actor.role,
        orderRecordedOnly: recordedOnly,
        orderTo: to,
        ...(pin ? { pinPrinted: true } : {}),
        ourCompanyName: our.name,
        rejectedAt: null,
        rejectReason: null,
      };
      const row = await tripRepository.update(tx, companyId, trip.id, { ...values, status: ltlTripStatus({ ...locked, ...values }) }, { live: true });
      if (!row) throw APIError.aborted("The trip was changed by someone else. Reload and try again.");
      await appendEvent(tx, companyId, {
        kind: "transport_order_sent",
        tripId: trip.id,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary: `Transport order ${trip.ref} ${recordedOnly ? "marked as sent (recorded only)" : "sent"}${to.length ? ` to ${to.join(", ")}` : ""}${pin ? " (PIN printed)" : ""}`,
          facts: { recordedOnly, to, pinPrinted: !!pin, language: lang, note },
        },
      });
      await ltlTrips.settle(tx, actor, row);
      return row;
    });
    await deliverDue();
    const texts = { orderRef: trip.ref, haulier: trip.haulierName, date: formatDay(trip.plannedPickupDate) };
    const mail = mailing
      ? await sendMail({
          to,
          cc: [],
          subject: fillOrderText(settings.transportOrder.emailSubject, texts),
          text: [fillOrderText(settings.transportOrder.emailBody, texts), note].filter(Boolean).join("\n\n"),
          attachments: [{ filename: file.fileName, content: file.fileBase64 }],
          idempotencyKey: `${trip.id}:${sentRow.version}`,
        })
      : null;
    if (mail && !mail.sent) await this.mailFailed(actor, sentRow, null, by, mail);
    return { trip: await tripService.get(actor, trip.id), recordedOnly: !mail?.sent, file };
  }

  /** Any user: the CMR (consignment note) of a consignment; the carrier is its trip's haulier when planned. */
  async cmr(actor: Actor, consignmentId: string): Promise<FileDownload> {
    const { c, trip } = await consignmentService.load(actor.companyID, consignmentId);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    const liveTrip = trip && !trip.cancelledAt ? trip : null;
    const carrier = liveTrip ? (await haulierOf(actor.companyID, liveTrip.haulierCustomerId)).party : null;
    const bytes = await buildCmrPdf(
      cmrDoc({ issuedAt: new Date(), carrier, plates: liveTrip ? platesText(liveTrip.tractorPlate, liveTrip.trailerPlate) : "", consignment: c }),
    );
    const by = await userName(actor.userID);
    await inTx((tx) =>
      appendEvent(tx, actor.companyID, {
        kind: "cmr_printed",
        consignmentId: c.id,
        tripId: liveTrip?.id ?? null,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `CMR of ${c.ref} printed` },
      }),
    );
    return pdfFile(`CMR-${c.ref}.pdf`, bytes);
  }
}

export const transportOrderService = new TransportOrderService();
