import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { customerLinksRepository, type RenameCounts, type StoredName } from "../repositories/customerLinks.repository";
import type { CustomerChangedEvent } from "../../customers/topics";
import { asCompany } from "../../../lib/internalCall";
import { isUuid } from "../../../lib/uuid";
import type { TruckingLinksNormalizeResult, TruckingUnmatchedName } from "../interfaces/interfaces";

// "Everything must be linked" (owner, 26 Oct 2026): the customer of a consignment and the haulier
// of a trip are kept as text next to the Customer Database id, and follow a rename there. What
// stays as written on purpose: a received haulier invoice's haulier name, what a sent transport
// order recorded (order_to, our_company_name), the event history, and the legs' place texts (a
// partner's depot is an address, and addresses stay as they are).
// A trip already announced to our warehouse is not announced again on a rename: that call also
// books dock slots and fills cargo figures, so it would undo what the gate staff changed. The
// gate's copy of the haulier name needs a name-only refresh in Warehouse (not built yet).

/** How many customer ids one call of the Customer Database takes. */
const REFS_BATCH = 500;

const chunks = <T>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

class CustomerLinksService {
  /**
   * Topic customer-changed: an edit, a delete or a restore. The event is only a signal: the name
   * written is the one the Customer Database holds now, read under the customer's lock, so an older
   * event delivered late or again never writes an outdated name back. A deleted customer is no
   * longer answered there: its delete event carries its last name (a deleted customer is not
   * edited), so that one is written; an edit of a customer deleted since writes nothing (its delete
   * event does). A failure is thrown, so the event is delivered again.
   */
  async customerChanged(event: CustomerChangedEvent): Promise<RenameCounts> {
    // Retrying an event that names no customer would fail the same way every time.
    if (!isUuid(event.companyId) || !isUuid(event.customerId)) {
      log.warn("a customer change names no customer; ignored", { companyId: event.companyId, customerId: event.customerId });
      return { consignments: 0, trips: 0 };
    }
    const { companyId } = event;
    const customerId = event.customerId.toLowerCase();
    return customerLinksRepository.renameCustomer(companyId, customerId, async () => {
      const { customers: found } = await customers._internalCustomerRefs({ customerIds: [customerId] }, asCompany(companyId));
      const current = found.find((c) => c.id === customerId);
      if (current) return current.companyName;
      return event.deleted ? event.companyName : null;
    });
  }

  /**
   * The one-off backfill (POST /trucking/links/normalize): every copied name of the company's
   * consignments and trips is brought up to the Customer Database's name by its id. Names whose
   * customer is gone (deleted, or unknown) are left and listed, most frequent first. Safe to run again.
   */
  async normalize(companyId: string): Promise<TruckingLinksNormalizeResult> {
    const stored = await customerLinksRepository.storedNames(companyId);
    const names = await this.namesOf([...new Set(stored.map((s) => s.id))]);
    // Only a customer whose name differs is written, under its turn with the name read again (as
    // an event's rename is), so a rename arriving meanwhile never loses to the name read above.
    const stale = new Set(
      stored
        .filter((s) => {
          const name = names.get(s.id)?.trim();
          return !!name && name !== s.name;
        })
        .map((s) => s.id),
    );
    let changed = 0;
    for (const id of stale) {
      const done = await customerLinksRepository.renameCustomer(companyId, id, async () => (await this.namesOf([id])).get(id) ?? null);
      changed += done.consignments + done.trips;
    }
    return {
      checked: stored.reduce((sum, s) => sum + s.count, 0),
      changed,
      unmatched: unmatchedOf(stored.filter((s) => !names.get(s.id)?.trim())),
    };
  }

  /** The Customer Database's names of the live customers among `ids`, by id. */
  private async namesOf(ids: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    for (const batch of chunks(ids, REFS_BATCH)) {
      const { customers: found } = await customers._internalCustomerRefs({ customerIds: batch });
      for (const c of found) names.set(c.id, c.companyName);
    }
    return names;
  }
}

/** The names left as stored, by field and text, most frequent first. */
export function unmatchedOf(rows: StoredName[]): TruckingUnmatchedName[] {
  const out = new Map<string, TruckingUnmatchedName>();
  for (const r of rows) {
    const key = `${r.field}\u0000${r.name}`;
    const seen = out.get(key);
    if (seen) seen.count += r.count;
    else out.set(key, { field: r.field, value: r.name, count: r.count });
  }
  return [...out.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field) || a.value.localeCompare(b.value));
}

export const customerLinksService = new CustomerLinksService();
