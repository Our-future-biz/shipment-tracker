import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
import type { CustomerChangedEvent } from "../../customers/topics";
import type { SalesLinksNormalizeResult } from "../interfaces/interfaces";
import { followupTaskRepository } from "../repositories/followupTask.repository";

// How many customers one call to the Customer Database asks about (it takes at most 2000).
const REFS_CHUNK = 500;

// A Pub/Sub handler has no login. The customers service reads only the company of an internal
// call, so the handler calls for the event's company with no user (as shipments does).
const asCompany = (companyId: string) => ({ authData: { userID: "", companyID: companyId, role: "user" } });

// A follow-up task linked to a customer record (customer_id) shows the customer's name as the
// Customer Database has it now: "everything must be linked" (owner, 26 Oct 2026). The name is kept
// as text beside the id (customer_label) for a company that was typed and never linked; the
// customer's change events keep it current, and a superadmin's run brings the old ones up to date.
class FollowupLinksService {
  /**
   * A customer was edited, deleted or restored: the tasks linked to it take its name. The event is
   * only a signal: the name written is the one the Customer Database holds now, read under the
   * customer's turn, so an older event delivered late or again never writes an outdated name back.
   * A deleted customer is no longer answered there: its delete event carries its last name (a
   * deleted customer is not edited), so that one is written; an edit of a customer deleted since
   * writes nothing (its delete event does). A failure is thrown, so the event is delivered again.
   */
  async customerChanged(event: CustomerChangedEvent): Promise<number> {
    if (!isUuid(event.companyId) || !isUuid(event.customerId)) {
      log.warn("a customer change names no customer; ignored", { companyId: event.companyId, customerId: event.customerId });
      return 0;
    }
    const { companyId } = event;
    const customerId = event.customerId.toLowerCase();
    const changed = await followupTaskRepository.followCustomer(companyId, customerId, async () => {
      const { customers: found } = await customers._internalCustomerRefs({ customerIds: [customerId] }, asCompany(companyId));
      const current = found.find((c) => c.id === customerId);
      if (current) return current.companyName;
      return event.deleted ? (event.companyName ?? "") : null;
    });
    if (changed) log.info("follow-up tasks took the customer's current name", { customerId, tasks: changed });
    return changed;
  }

  // The one-time run (a superadmin starts it; it can be run again at any time): every live task
  // linked to a customer record gets the customer's current name. A task linked to a deleted
  // customer keeps its name and is listed.
  async normalize(companyId: string): Promise<SalesLinksNormalizeResult> {
    const links = await followupTaskRepository.customerLinks(companyId);
    const ids = [...new Set(links.map((link) => link.customerId))];
    // Without the Customer Database nothing can be decided: the run fails instead of guessing.
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += REFS_CHUNK) {
      const { customers: found } = await customers._internalCustomerRefs({ customerIds: ids.slice(i, i + REFS_CHUNK) });
      for (const customer of found) names.set(customer.id, customer.companyName);
    }
    let changed = 0;
    for (const id of ids) {
      const name = names.get(id);
      if (name !== undefined) changed += await followupTaskRepository.relabelCustomer(companyId, id, name);
    }
    const unmatched = new Map<string, number>();
    for (const link of links) {
      if (!names.has(link.customerId)) unmatched.set(link.customerLabel, (unmatched.get(link.customerLabel) ?? 0) + link.count);
    }
    return {
      checked: links.reduce((sum, link) => sum + link.count, 0),
      changed,
      unmatched: [...unmatched]
        .map(([value, count]) => ({ field: "customer", value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    };
  }
}

export const followupLinksService = new FollowupLinksService();
