import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { invoicing } from "~encore/clients";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import { appUrl } from "../../../lib/appUrl";
import { businessDay } from "../../../lib/businessDate";
import type { PublicShipmentStatus, ShipmentCustomerLink } from "../interfaces/interfaces";
import { LINK_INVALID, customerLinkUrl, hashLinkToken, linkMayOpen, linkOpenUntil, looksLikeLinkToken, newLinkToken, publicStatusOf } from "../lib/customerLink";
import { buildTracking } from "../lib/trackingTimeline";
import { userEmails } from "../lib/userEmails";
import { containerRepository } from "../repositories/container.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentCustomerLinkRepository } from "../repositories/shipmentCustomerLink.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import { DETAILS_REFUSAL } from "../lib/shipmentEditRule";
import { TRACKING_EVENTS_LIMIT, type TrackingActor } from "./tracking.service";
import { shipmentService } from "./shipment.service";

/** Whose page it is. Not knowing isn't worth failing the customer's page for. */
async function ourCompanyName(companyId: string): Promise<string> {
  try {
    const { profile } = await invoicing.invoiceProfileGet({ authData: await serviceActor(companyId) });
    return profile.companyName ?? "";
  } catch (err) {
    log.warn(err, "customer link: the company's name not read");
    return "";
  }
}

class CustomerLinkService {
  private async requireShipment(shipmentId: string, companyId: string) {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    return shipment;
  }

  private async assertMayChange(shipmentId: string, actor: TrackingActor) {
    const shipment = await this.requireShipment(shipmentId, actor.companyID);
    if (!(await shipmentService.mayChangeDetails(shipment, actor.userID, actor.role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    return shipment;
  }

  /** The shipment's link as the desk sees it. The URL itself can't be told again. */
  async get(shipmentId: string, companyId: string, now = new Date()): Promise<ShipmentCustomerLink | null> {
    const shipment = await this.requireShipment(shipmentId, companyId);
    const link = await shipmentCustomerLinkRepository.liveOf(shipmentId, companyId);
    if (!link) return null;
    const names = await userEmails();
    return {
      createdAt: link.createdAt.toISOString(),
      createdBy: names.get(link.createdById) ?? "",
      lastOpenedAt: link.lastOpenedAt?.toISOString() ?? null,
      openUntil: linkOpenUntil(shipment.actualDeliveryDate),
      open: linkMayOpen(shipment, businessDay(now)),
    };
  }

  /** A new link, in place of any earlier one. The answer is the only time the URL is known. */
  async create(shipmentId: string, actor: TrackingActor, now = new Date()): Promise<{ url: string; link: ShipmentCustomerLink }> {
    const shipment = await this.assertMayChange(shipmentId, actor);
    if (!linkMayOpen(shipment, businessDay(now))) throw APIError.failedPrecondition("This job is cancelled or was delivered too long ago for a link");
    const { token, hash } = newLinkToken();
    // In the shipment's write turn: a second click at the same moment waits, then replaces this link.
    await shipmentRepository.writeTurn(shipmentId, actor.companyID, (tx) =>
      shipmentCustomerLinkRepository.replace(tx, { companyId: actor.companyID, shipmentId, tokenHash: hash, createdById: actor.userID }),
    );
    return { url: customerLinkUrl(appUrl(), token), link: (await this.get(shipmentId, actor.companyID, now))! };
  }

  async revoke(shipmentId: string, actor: TrackingActor): Promise<void> {
    await this.assertMayChange(shipmentId, actor);
    if (!(await shipmentCustomerLinkRepository.revoke(shipmentId, actor.companyID, actor.userID))) throw APIError.notFound("This shipment has no link");
  }

  /** The customer's page: the token is the only key, and every link that doesn't open answers alike. */
  async publicStatus(token: string, now = new Date()): Promise<PublicShipmentStatus> {
    const invalid = () => APIError.notFound(LINK_INVALID);
    if (!looksLikeLinkToken(token)) throw invalid();
    const link = await shipmentCustomerLinkRepository.liveByHash(hashLinkToken(token));
    if (!link) throw invalid();
    const { companyId, shipmentId } = link;
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment || !linkMayOpen(shipment, businessDay(now))) throw invalid();
    const [events, customsStatus, containers, ourCompany] = await Promise.all([
      shipmentTrackingEventRepository.listByShipmentId(shipmentId, companyId, TRACKING_EVENTS_LIMIT),
      shipmentService.customsStatusOf(shipment, companyId),
      containerRepository.listByShipmentId(shipmentId, companyId),
      ourCompanyName(companyId),
    ]);
    // No names, audit or ticks go in, so none can come out.
    const { milestones } = buildTracking({ shipment, customsStatus, audit: [], changesCapped: false, events, notices: [], mayChangeDetails: false, tasks: [], names: new Map(), invoiced: null, now });
    // Knowing it was opened isn't worth failing the customer's page for.
    await shipmentCustomerLinkRepository.touchOpened(link.id, now).catch((err: unknown) => log.warn(err, "customer link: could not note the opening", { shipmentId }));
    return publicStatusOf(shipment, milestones, containers.map((c) => c.containerNumber).filter(Boolean), ourCompany, now);
  }
}

export const customerLinkService = new CustomerLinkService();
