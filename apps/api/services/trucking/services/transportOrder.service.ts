import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { customers, invoicing, sales } from "~encore/clients";
import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingConsignmentRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { DocLanguageCode, FileDownload, TripDetail } from "../interfaces/interfaces";
import type { DocParty } from "../lib/documentTypes";
import type { Actor } from "../../../lib/rbac";
import { sendMail } from "../../../lib/email";
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
import { userName } from "../lib/users";
import { haulierService } from "./haulier.service";
import { consignmentService } from "./consignment.service";
import { tripService } from "./trip.service";
import { settingsService } from "./settings.service";

// The transport order (print, send - recorded only while e-mail is off - and a confirmation the
// user records) and the CMR. The Pick-up PIN is typed by the user for each print or send: it goes
// into the PDF and nowhere else - no column, no event, no log; the event says only whether one
// was printed.

const APP_URL = process.env.APP_URL || "http://localhost:3001";
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

/** Our company as printed (issuer details, the quotation details filling gaps); empty when neither can be read. */
export async function ourCompany(): Promise<DocParty> {
  const [profile, quote] = await Promise.all([
    invoicing
      .invoiceProfileGet()
      .then((r): IssuerProfile => r.profile)
      .catch((err: unknown) => {
        log.warn(err, "trucking: invoicing company details not read");
        return null;
      }),
    sales
      .prefGet({ prefKey: "company_details" })
      .then((r): QuoteCompanyDetails => asQuoteCompanyDetails(r.value))
      .catch((err: unknown) => {
        log.warn(err, "trucking: quotation company details not read");
        return null;
      }),
  ]);
  return profile || quote ? ourCompanyParty(profile, quote) : EMPTY_PARTY;
}

/** The haulier as printed, with its payment days; the address and contact from the Customer Database. */
async function haulierOf(companyId: string, haulierId: string) {
  const detail = await haulierService.get(companyId, haulierId);
  const [customer, contacts] = await Promise.all([
    customers.customerGet({ id: haulierId }).then((r) => r.customer).catch(() => null),
    customers.contactList({ customerId: haulierId }).then((r) => r.data).catch(() => []),
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
      podLink,
    });
    return buildTransportOrderPdf(doc);
  }

  /** Any user. The transport order as a PDF, the PIN printed when typed; the print is logged (PIN printed yes / no). */
  async pdf(actor: Actor, tripId: string, input: TransportOrderPrintInput): Promise<FileDownload> {
    const lang = language(input.language);
    const pin = cleanPin(input.pickupPin);
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
   * planned pick-up) replaces the old one and is printed on the order. Trip and consignment become ORDERED.
   */
  async send(actor: Actor, tripId: string, input: TransportOrderSendInput): Promise<{ trip: TripDetail; recordedOnly: boolean; file: FileDownload }> {
    const lang = language(input.language);
    const pin = cleanPin(input.pickupPin);
    const to = cleanRecipients(input.to);
    const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
    const companyId = actor.companyID;
    const { trip, c, settings, haulier } = await this.ready(actor, tripId);
    const our = await ourCompany();
    const { token, hash } = newToken();
    const expiresAt = linkExpiry(trip.plannedPickupDate);
    const link = haulierLinkUrl(APP_URL, token);
    const bytes = await this.build(trip, c, lang, pin, link, haulier, settings.vehicleTypes, our);
    const file = pdfFile(`${trip.ref}.pdf`, bytes);

    const texts = { orderRef: trip.ref, haulier: trip.haulierName, date: formatDay(trip.plannedPickupDate) };
    const mail = await sendMail({
      to,
      cc: [],
      subject: fillOrderText(settings.transportOrder.emailSubject, texts),
      text: [fillOrderText(settings.transportOrder.emailBody, texts), note, `Confirm the order and upload the POD: ${link}`].filter(Boolean).join("\n\n"),
      attachments: [{ filename: file.fileName, content: file.fileBase64 }],
      idempotencyKey: `${trip.id}:${trip.version}`,
    });
    const recordedOnly = !mail.sent;
    const by = await userName(actor.userID);
    const now = new Date();
    await inTx(async (tx) => {
      await tripRepository.renewLink(tx, companyId, trip.id, hash, expiresAt);
      const sent = { ...trip, orderSentAt: now, rejectedAt: null };
      const row = await tripRepository.update(
        tx,
        companyId,
        trip.id,
        {
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
          summary: `Transport order ${trip.ref} ${recordedOnly ? "marked as sent (recorded only)" : "sent"}${to.length ? ` to ${to.join(", ")}` : ""}${pin ? " (PIN printed)" : ""}`,
          facts: { recordedOnly, to, pinPrinted: !!pin, language: lang, note, linkExpiresAt: expiresAt.toISOString() },
        },
      });
    });
    return { trip: await tripService.get(actor, trip.id), recordedOnly, file };
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
        { confirmedAt: now, confirmedVia: "USER", confirmedBy: by, status: tripStatus({ ...trip, confirmedAt: now }, c) },
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
