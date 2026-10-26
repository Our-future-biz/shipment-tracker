import log from "encore.dev/log";
import { isUuid } from "../../../lib/uuid";
import type { ContactChangedEvent, CustomerChangedEvent } from "../../customers/topics";
import type { QuoteLinksNormalizeResult } from "../interfaces/interfaces";
import { readCustomerRefs } from "../lib/customerRefs";
import { quoteCustomerLinksRepository } from "../repositories/quoteCustomerLinks.repository";
import { salesQuoteRepository } from "../repositories/salesQuote.repository";
import { CUSTOMER_KEYS, refreshCopies } from "../utils/customerLinks.utils";

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "");

// The customer copies of open quotes follow the Customer Database (customerLinks.utils): its
// change events rewrite them, and a superadmin's run links and refreshes the ones from before.
class QuoteLinksService {
  /**
   * A customer was edited, deleted or restored: its open quotes take its name and account type.
   * The event is only a signal: what is written is what the Customer Database holds now, read
   * under the customer's turn, so an older event delivered late or again never writes an outdated
   * name back. A deleted customer is no longer answered there: its delete event carries its last
   * name (a deleted customer is not edited), so that one is written; an edit of a customer deleted
   * since writes nothing (its delete event does). A failure is thrown, so the event is delivered again.
   */
  async customerChanged(event: CustomerChangedEvent): Promise<number> {
    if (!isUuid(event.companyId) || !isUuid(event.customerId)) {
      log.warn("a customer change names no customer; ignored", { companyId: event.companyId, customerId: event.customerId });
      return 0;
    }
    const { companyId } = event;
    const customerId = event.customerId.toLowerCase();
    const changed = await quoteCustomerLinksRepository.followCustomer(companyId, customerId, async () => {
      const current = (await readCustomerRefs([customerId], companyId)).customers.find((c) => c.id === customerId);
      if (current) return { name: current.companyName, label: current.label };
      return event.deleted ? { name: textOf(event.companyName), label: textOf(event.label) } : null;
    });
    if (changed.length) log.info("open quotes took the customer's current name", { customerId, quotes: changed.length });
    return changed.length;
  }

  /**
   * A contact person was edited or deleted: the open quotes linked to them take their name, e-mail
   * and phone as the Customer Database holds them now (read under the contact's turn, as above).
   * Once the contact is gone the quotes keep its last details - from its delete event, the last
   * word on it - as typed text without the link; one still live (restored) keeps its link.
   */
  async contactChanged(event: ContactChangedEvent): Promise<number> {
    if (!isUuid(event.companyId) || !isUuid(event.customerId) || !isUuid(event.contactId)) {
      log.warn("a contact change names no contact; ignored", { companyId: event.companyId, contactId: event.contactId });
      return 0;
    }
    const { companyId } = event;
    const customerId = event.customerId.toLowerCase();
    const contactId = event.contactId.toLowerCase();
    const changed = await quoteCustomerLinksRepository.followContact(companyId, customerId, contactId, async () => {
      const refs = await readCustomerRefs([customerId], companyId);
      const current = refs.contacts.find((c) => c.id === contactId && c.customerId === customerId);
      if (current) return { name: current.name, email: current.email, phone: current.phone, gone: false };
      return event.deleted ? { name: textOf(event.name), email: textOf(event.email), phone: textOf(event.phone), gone: true } : null;
    });
    if (changed.length) log.info("open quotes took the contact's current details", { contactId, quotes: changed.length });
    return changed.length;
  }

  // The one-time run (a superadmin starts it; it can be run again at any time): every open quote
  // of the company that names a customer record gets the customer's current name and account
  // type and its linked contact's current details; a contact name from before contacts were linked
  // is linked to the customer's contact it names (matchContact). A contact an editor typed by hand
  // stays typed. Sent and decided quotes stay as they were sent.
  async normalize(companyId: string): Promise<QuoteLinksNormalizeResult> {
    // Quotes older code left without columns get them first: which quotes are open is read from the columns.
    await salesQuoteRepository.adoptPending(companyId);
    const quotes = await quoteCustomerLinksRepository.openWithCustomer(companyId);
    // Without the Customer Database nothing can be decided: the run fails instead of guessing.
    const refs = await readCustomerRefs(quotes.map((q) => q.customerId));
    const unmatched = new Map<string, { field: string; value: string; count: number }>();
    const note = (field: string, value: string) => {
      const key = `${field}\u0000${value}`;
      const entry = unmatched.get(key) ?? { field, value, count: 0 };
      entry.count += 1;
      unmatched.set(key, entry);
    };
    let changed = 0;
    for (const quote of quotes) {
      const refresh = refreshCopies(quote.doc, refs, { linkByName: true });
      const customerName = textOf(refresh.set[CUSTOMER_KEYS.customerName]) || textOf(quote.doc[CUSTOMER_KEYS.customerName]);
      if (refresh.customerMissing) note("customer", customerName || quote.customerId);
      if (refresh.unmatchedContact) note("customerContact", `${refresh.unmatchedContact} (${customerName || quote.customerId})`);
      if (!Object.keys(refresh.set).length) continue;
      // Written only while the quote still names what it was read with: an edit saved meanwhile wins.
      if (await quoteCustomerLinksRepository.applyCopies(companyId, quote.id, { customerId: quote.customerId, doc: quote.doc }, refresh)) changed += 1;
    }
    return {
      checked: quotes.length,
      changed,
      unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count || a.field.localeCompare(b.field) || a.value.localeCompare(b.value)),
    };
  }
}

export const quoteLinksService = new QuoteLinksService();
