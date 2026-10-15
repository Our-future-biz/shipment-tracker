import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { legRepository } from "../repositories/leg.repository";
import { appendEvent } from "../repositories/event.repository";
import type { DocLanguageCode, FileDownload, LegKind } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { labelDocs, manifestDoc, type DocLeg } from "../lib/ltlDocs";
import { inStopOrder } from "../lib/ltlView";
import { buildManifestPdf } from "../lib/manifestPdf";
import { buildLabelsPdf } from "../lib/labelsPdf";
import { userName } from "../lib/users";
import { haulierOf, ourCompany } from "./transportOrder.service";
import { tripService } from "./trip.service";
import { settingsService } from "./settings.service";
import { ltlTrips } from "./ltlTrips";
import { ltlService } from "./ltl.service";

// The LTL papers: the manifest (nakládací list) of a run or line haul, and the 100×150 mm piece
// labels of consignments. Each print is logged.

const LANGUAGES: readonly DocLanguageCode[] = ["cs", "en", "both"];
const MAX_CONSIGNMENTS = 200;
const MAX_LABELS = 2000;

const pdfFile = (fileName: string, bytes: Uint8Array): FileDownload => ({
  fileName,
  fileBase64: Buffer.from(bytes).toString("base64"),
  contentType: "application/pdf",
});

class LtlDocumentService {
  /** Any user. The manifest of an LTL trip: every leg in stop order, totals and the vehicle's fill. */
  async manifest(actor: Actor, tripId: string, language: unknown): Promise<FileDownload> {
    if (!LANGUAGES.includes(language as DocLanguageCode)) throw APIError.invalidArgument("The language must be cs, en or both");
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    if (trip.kind === "FTL") throw APIError.failedPrecondition("An FTL trip has the transport order and the CMR, not a manifest");
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is cancelled");
    const settings = await settingsService.get(companyId);
    const legs = inStopOrder(await legRepository.forTrips(companyId, [trip.id]), trip.stopOrder);
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    const [haulier, our, loads] = await Promise.all([haulierOf(companyId, trip.haulierCustomerId), ourCompany(), ltlTrips.loads(companyId, [trip], settings)]);
    const view = loads.get(trip.id)!;
    const vehicle = settings.vehicleTypes.find((v) => v.code === trip.vehicleTypeCode) ?? null;
    const docLegs: DocLeg[] = legs
      .filter((l) => byId.has(l.consignmentId))
      .map((l) => ({ kind: l.kind as LegKind, toText: l.toText, toPostcode: l.toPostcode, consignment: byId.get(l.consignmentId)! }));
    const bytes = await buildManifestPdf(
      manifestDoc({
        language: language as DocLanguageCode,
        trip: { ...trip, kind: trip.kind },
        ourCompany: our,
        haulier: haulier.party,
        vehicle: vehicle ? { label: vehicle.label, tailLift: vehicle.tailLift } : null,
        capacity: view.capacity,
        fill: view.fill,
        hub: settings.hub,
        legs: docLegs,
      }),
    );
    const by = await userName(actor.userID);
    await inTx((tx) =>
      appendEvent(tx, companyId, {
        kind: "manifest_printed",
        tripId: trip.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `Manifest of ${trip.ref} printed (${docLegs.length} consignment${docLegs.length === 1 ? "" : "s"})` },
      }),
    );
    return pdfFile(`${trip.ref}-manifest.pdf`, bytes);
  }

  /** Any user. Labels of consignments: one per piece ("n / N") or one per consignment. */
  async labels(actor: Actor, consignmentIds: unknown, perPiece: unknown): Promise<FileDownload> {
    const companyId = actor.companyID;
    const ids = Array.isArray(consignmentIds) ? [...new Set(consignmentIds.map(String))] : [];
    if (!ids.length || ids.some((id) => !isUuid(id))) throw APIError.invalidArgument("Choose the consignments to label");
    if (ids.length > MAX_CONSIGNMENTS) throw APIError.invalidArgument(`At most ${MAX_CONSIGNMENTS} consignments at once`);
    const found = await consignmentRepository.findMany(companyId, ids);
    const byId = new Map(found.map((c) => [c.id, c]));
    const missing = ids.find((id) => !byId.has(id));
    if (missing) throw APIError.notFound("Consignment not found");
    const cancelled = found.find((c) => c.cancelledAt);
    if (cancelled) throw APIError.failedPrecondition(`${cancelled.ref} is cancelled`);
    const settings = await settingsService.get(companyId);
    const zoneOf = await ltlService.zoneLabels(companyId, businessDay(new Date()));
    const labels = labelDocs(
      ids.map((id) => {
        const c = byId.get(id)!;
        return { ...c, serviceLabel: settings.serviceLevels.find((l) => l.code === c.serviceLevel)?.label ?? "", zoneLabel: zoneOf(c.delivery.postcode) };
      }),
      perPiece === true,
    );
    if (labels.length > MAX_LABELS) throw APIError.invalidArgument(`At most ${MAX_LABELS} labels at once`);
    const bytes = await buildLabelsPdf(labels);
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      for (const id of ids) {
        const n = labels.filter((l) => l.consignmentRef === byId.get(id)!.ref).length;
        await appendEvent(tx, companyId, {
          kind: "labels_printed",
          consignmentId: id,
          byUserId: actor.userID || null,
          byName: by,
          payload: { changes: {}, summary: `${n} label${n === 1 ? "" : "s"} printed` },
        });
      }
    });
    const first = byId.get(ids[0]!)!;
    return pdfFile(ids.length === 1 ? `${first.ref}-labels.pdf` : `labels-${ids.length}-consignments.pdf`, bytes);
  }
}

export const ltlDocumentService = new LtlDocumentService();
