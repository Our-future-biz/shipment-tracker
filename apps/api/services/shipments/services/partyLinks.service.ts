import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { asCompany } from "../../../lib/internalCall";
import type { ContactChangedEvent, CustomerChangedEvent } from "../../customers/topics";
import { partyLinksRepository, type ShipmentParties } from "../repositories/partyLinks.repository";
import { linkedCustomerIds, planLinksNormalize, type LinkRefs, type LinksPlan } from "../lib/contactLinks";
import { shipmentPartiesChanged } from "../topics";
import type { LinksNormalizeResult } from "../interfaces/interfaces";

// How many customers one refs request may ask for (the customers endpoint's limit).
const REFS_CHUNK = 2000;
// How many backfill rewrites one transaction applies: row locks are held for a chunk only.
const APPLY_CHUNK = 500;
// How many events are published at once.
const PUBLISH_BATCH = 50;

/** How a change event reached the handler. */
export interface Delivery {
  /** Delivered before: that attempt may have renamed and then failed to tell. */
  redelivered: boolean;
}

// Keeps the names a shipment and a master job copy from the Customer Database current: the
// customers service's change events rename the copies that hold the id, and a one-off backfill
// links the copies stored before the ids were kept. "Everything must be linked" (owner, 26 Oct 2026).
class PartyLinksService {
  // Tells the services that copied a shipment's Customer / Customer's PIC (the warehouse gate
  // record, …). Called after the rename has committed, so no row stays locked while it runs.
  private async tell(companyId: string, parties: ShipmentParties[]): Promise<void> {
    for (let i = 0; i < parties.length; i += PUBLISH_BATCH) {
      await Promise.all(
        parties.slice(i, i + PUBLISH_BATCH).map(({ id, customer, customerPic }) => shipmentPartiesChanged.publish({ companyId, shipmentId: id, customer, customerPic })),
      );
    }
  }

  private async refsOf(companyId: string, customerId: string) {
    return customers._internalCustomerRefs({ customerIds: [customerId] }, asCompany(companyId));
  }

  /**
   * A customer was edited, deleted or restored. Its name as the Customer Database holds it now -
   * not the one in the event, which may be older than one applied already - goes to every copy
   * that holds its id. Once it is deleted, the delete's event brings the name it was deleted with
   * (see goneName); the copies keep the id, so a restore renames them again.
   * A failure is thrown, so the event is delivered again.
   */
  async customerChanged(event: CustomerChangedEvent, delivery: Delivery = { redelivered: false }): Promise<number> {
    const { companyId, customerId } = event;
    const { changed, parties } = await partyLinksRepository.renameCustomer(companyId, customerId, async () => {
      const refs = await this.refsOf(companyId, customerId);
      const live = refs.customers.find((c) => c.id === customerId);
      return live ? live.companyName : goneName(event.deleted, event.companyName);
    });
    // A repeated delivery can't tell what the failed one renamed: it tells about them all again
    // (whoever listens takes the same name twice without harm).
    await this.tell(companyId, delivery.redelivered ? await partyLinksRepository.partiesOfCustomer(companyId, customerId) : parties);
    return changed;
  }

  /**
   * A contact person was edited or deleted. Its name as the Customer Database holds it now goes to
   * every Customer's PIC and Shipper / Consignee Contact that links to it; once it is deleted, the
   * name its delete's event brings (see goneName). A failure is thrown, so the event is delivered again.
   */
  async contactChanged(event: ContactChangedEvent, delivery: Delivery = { redelivered: false }): Promise<number> {
    const { companyId, customerId, contactId } = event;
    const { changed, parties } = await partyLinksRepository.renameContact(companyId, customerId, contactId, async () => {
      const refs = await this.refsOf(companyId, customerId);
      const live = refs.contacts.find((c) => c.id === contactId && c.customerId === customerId);
      return (live ? live.name : goneName(event.deleted, event.name))?.trim() ?? null;
    });
    await this.tell(companyId, delivery.redelivered ? await partyLinksRepository.partiesOfContact(companyId, customerId, contactId) : parties);
    return changed;
  }

  /**
   * The backfill after the links were added (owner decision, 26 Oct 2026), for the caller's
   * company: party names linked to a customer take its current name, and a Customer's PIC or
   * Shipper / Consignee Contact stored by name is linked to the contact it names (and takes its
   * name). What finds nobody stays and is reported. Running it again changes nothing more.
   * Applied in chunks, each told about once it has committed; a chunk that can't be told is
   * logged (its rows stay changed, as after an edit - shipment.service tellParties).
   */
  async normalizeLinks(companyId: string): Promise<LinksNormalizeResult> {
    const { shipments, masterJobs } = await partyLinksRepository.linksOf(companyId);
    const ids = linkedCustomerIds(shipments, masterJobs);
    const refs: LinkRefs = { customers: [], contacts: [] };
    for (let i = 0; i < ids.length; i += REFS_CHUNK) {
      const chunk = await customers._internalCustomerRefs({ customerIds: ids.slice(i, i + REFS_CHUNK) });
      refs.customers.push(...chunk.customers);
      refs.contacts.push(...chunk.contacts);
    }
    const plan = planLinksNormalize(shipments, masterJobs, refs);
    let changed = 0;
    let untold = 0;
    for (const chunk of chunks(plan)) {
      const written = await partyLinksRepository.applyLinks(companyId, chunk);
      changed += written.changed;
      try {
        await this.tell(companyId, written.parties);
      } catch (err) {
        untold += written.parties.length;
        log.warn(err, "shipment parties change not published", { companyId, shipments: written.parties.length });
      }
    }
    log.info("shipment links normalized", { companyId, checked: plan.checked, changed, unmatched: plan.unmatched.length, untold });
    return { checked: plan.checked, changed, unmatched: plan.unmatched };
  }
}

/**
 * The name to write for a record the Customer Database no longer holds live. A delete's event
 * carries the name it was deleted with, the last it had: an edit's event handled after the delete
 * finds nothing to read, so without this a rename just before a delete would never arrive. Any
 * other event leaves it to the delete's. Null writes nothing: an empty name is never written.
 */
const goneName = (deleted: boolean, name: string): string | null => (deleted && name.trim() ? name : null);

/** The plan's rewrites, at most APPLY_CHUNK to a chunk: the shipments first, then the master jobs. */
function* chunks(plan: Pick<LinksPlan, "shipments" | "masterJobs">) {
  for (let i = 0; i < plan.shipments.length; i += APPLY_CHUNK) yield { shipments: plan.shipments.slice(i, i + APPLY_CHUNK), masterJobs: [] };
  for (let i = 0; i < plan.masterJobs.length; i += APPLY_CHUNK) yield { shipments: [], masterJobs: plan.masterJobs.slice(i, i + APPLY_CHUNK) };
}

export const partyLinksService = new PartyLinksService();
