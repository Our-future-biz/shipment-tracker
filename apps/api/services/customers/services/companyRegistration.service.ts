import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { appUrl } from "../../../lib/appUrl";
import { userEmailOf } from "../../../lib/companyUsers";
import { canManageSales } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import type { AresResult, AresSearchHit, CustomerRole, NewCustomerContact } from "../interfaces/interfaces";
import type { PublicRegistrationForm, RegistrationLinkItem, RegistrationSettings } from "../interfaces/registration";
import {
  DEFAULT_TERMS_NAME,
  REGISTRATION_LINK_DAYS,
  REGISTRATION_LINK_INVALID,
  TERMS_CHANGED,
  TERMS_URL_RULE,
  hashRegistrationToken,
  linkIsOpen,
  lookupAllowed,
  looksLikeRegistrationToken,
  newRegistrationToken,
  registrationLinkUrl,
  registrationSearchBucket,
  termsUrlOf,
} from "../lib/registrationLink";
import { customerRepository } from "../repositories/customer.repository";
import { companyRegistrationRepository as repository } from "../repositories/companyRegistration.repository";
import type { CompanyRegistrationLinkRecord, NewCompanyRegistrationRecord } from "../schemas/companyRegistration.schema";
import { aresService } from "./ares.service";
import { customerService, firstContact } from "./customer.service";
import { seatText } from "../lib/seat";

// A company registers itself through a link a colleague created (Customer Database): one use, 14 days,
// sent by the colleague themself. It fills in its details and accepts the terms; a manager then answers
// it on Sales → Managers → Company approval, as a new supplier is answered.

interface Actor {
  companyID: string;
  userID: string;
  role: string;
}

/** What the company filled in. */
export interface RegistrationInput {
  termsAccepted: boolean;
  country: string;
  /** Czech company: its IČO, read from ARES. */
  ico?: string;
  companyName?: string;
  registrationNumber?: string;
  vatId?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  contact: NewCustomerContact;
  /** The terms' address the form showed: refused when a manager changed it since. */
  termsUrl?: string;
}

const MAX_LABEL = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

const invalid = () => APIError.notFound(REGISTRATION_LINK_INVALID);

const toLinkItem = (l: CompanyRegistrationLinkRecord): RegistrationLinkItem => ({
  id: l.id,
  label: l.label,
  roles: l.roles,
  createdBy: l.createdBy,
  createdByUserId: l.createdByUserId,
  createdAt: l.createdAt.toISOString(),
  expiresAt: l.expiresAt.toISOString(),
});

class CompanyRegistrationService {
  async settings(companyId: string): Promise<RegistrationSettings> {
    const row = await repository.settings(companyId);
    return { termsName: row?.termsName || DEFAULT_TERMS_NAME, termsUrl: row?.termsUrl ?? "" };
  }

  async saveSettings(actor: Actor, input: RegistrationSettings): Promise<RegistrationSettings> {
    if (!canManageSales(actor.role)) throw APIError.permissionDenied("Only a manager can change the registration terms");
    const termsUrl = termsUrlOf(input.termsUrl);
    if (!termsUrl) throw APIError.invalidArgument(TERMS_URL_RULE);
    const termsName = input.termsName.trim() || DEFAULT_TERMS_NAME;
    await repository.saveSettings(actor.companyID, { termsName, termsUrl });
    return { termsName, termsUrl };
  }

  /** A new link. The answer is the only time the URL is known. */
  async createLink(actor: Actor, input: { roles: CustomerRole[]; label?: string }, now = new Date()): Promise<{ url: string; link: RegistrationLinkItem }> {
    const roles = [...new Set(input.roles)];
    if (!roles.length) throw APIError.invalidArgument("Choose at least one role");
    const settings = await this.settings(actor.companyID);
    if (!settings.termsUrl) throw APIError.failedPrecondition("The terms' web address is not set yet: a manager sets it on Sales → Settings");
    const { token, hash } = newRegistrationToken();
    const link = await repository.createLink({
      companyId: actor.companyID,
      tokenHash: hash,
      roles,
      label: (input.label ?? "").trim().slice(0, MAX_LABEL),
      createdBy: await userEmailOf(actor.userID),
      createdByUserId: actor.userID,
      expiresAt: new Date(now.getTime() + REGISTRATION_LINK_DAYS * DAY_MS),
    });
    return { url: registrationLinkUrl(appUrl(), token), link: toLinkItem(link) };
  }

  async openLinks(companyId: string, now = new Date()): Promise<RegistrationLinkItem[]> {
    return (await repository.openLinks(companyId, now)).map(toLinkItem);
  }

  /** Whoever created a link can cancel it, and a manager any. */
  async revokeLink(actor: Actor, id: string, now = new Date()): Promise<void> {
    if (!isUuid(id)) throw APIError.notFound("Link not found");
    const link = await repository.linkById(id, actor.companyID);
    if (!link) throw APIError.notFound("Link not found");
    if (link.createdByUserId !== actor.userID && !canManageSales(actor.role)) throw APIError.permissionDenied("Only the one who created a link, or a manager, can cancel it");
    if (!(await repository.revokeLink(id, actor.companyID, now))) throw APIError.failedPrecondition("This link was used or cancelled already");
  }

  // ─── The public side: the token is the only key, and every link that doesn't open answers alike ───

  private async openLink(token: string, now: Date): Promise<CompanyRegistrationLinkRecord> {
    if (!looksLikeRegistrationToken(token)) throw invalid();
    const link = await repository.linkByHash(hashRegistrationToken(token));
    if (!link || !linkIsOpen(link, now)) throw invalid();
    return link;
  }

  async publicForm(token: string, now = new Date()): Promise<PublicRegistrationForm> {
    const link = await this.openLink(token, now);
    const { termsName, termsUrl } = await this.settings(link.companyId);
    return { termsName, termsUrl };
  }

  private assertLookup(link: CompanyRegistrationLinkRecord): void {
    if (!lookupAllowed(link.id)) throw APIError.resourceExhausted("Too many look-ups — wait a while and try again");
  }

  async publicAresLookup(token: string, ico: string, now = new Date()): Promise<AresResult> {
    const link = await this.openLink(token, now);
    this.assertLookup(link);
    return aresService.lookup(ico);
  }

  async publicAresSearch(token: string, name: string, now = new Date()): Promise<{ companies: AresSearchHit[]; tooMany: boolean }> {
    const link = await this.openLink(token, now);
    this.assertLookup(link);
    // Counted for the link alone: a public link can't use up the searches of the company's own users.
    return aresService.search(registrationSearchBucket(link.id), name);
  }

  /**
   * The company's registration. The link is taken first, so it registers once; a registration that fails
   * before anything is written gives it back. Once something is written the link stays used: a retry would
   * register the company a second time.
   */
  async submit(token: string, input: RegistrationInput, now = new Date()): Promise<void> {
    if (input.termsAccepted !== true) throw APIError.invalidArgument("The terms must be accepted to register");
    const open = await this.openLink(token, now);
    const settings = await this.settings(open.companyId);
    if (!settings.termsUrl) throw invalid();
    // What was accepted is what the form showed: terms changed since are read first.
    if (input.termsUrl !== undefined && input.termsUrl !== settings.termsUrl) throw APIError.failedPrecondition(TERMS_CHANGED);
    // Before the link is taken: a mistake in the form leaves it usable.
    const contact = firstContact(input.contact);
    const country = input.country.trim().toUpperCase();
    const czech = country === "CZ";
    if (czech && !/^\d{8}$/.test(input.ico ?? "")) throw APIError.invalidArgument("Look the company up by its IČO first");
    if (!czech && (!input.companyName?.trim() || !input.street?.trim() || !input.city?.trim() || !input.postalCode?.trim())) {
      throw APIError.invalidArgument("Fill in the company's name and address");
    }
    // A Czech company is read from ARES on the way: it counts as the link's look-up, so a registration
    // tried again and again can't call the registry without end.
    if (czech) this.assertLookup(open);
    const link = await repository.claim(open.tokenHash, now);
    if (!link) throw invalid();
    const progress = { written: false };
    try {
      await this.register(link, settings, input, country, czech, contact, now, progress);
    } catch (err) {
      if (progress.written) {
        log.error(err, "a registration failed after it was written: its link stays used", { companyId: link.companyId, linkId: link.id });
      } else {
        await repository.release(link.companyId, link.id).catch((e: unknown) => log.error(e, "a registration link could not be given back"));
      }
      throw err;
    }
  }

  private async register(
    link: CompanyRegistrationLinkRecord,
    settings: RegistrationSettings,
    input: RegistrationInput,
    country: string,
    czech: boolean,
    contact: ReturnType<typeof firstContact>,
    now: Date,
    progress: { written: boolean },
  ): Promise<void> {
    const { companyId } = link;
    const number = czech ? input.ico! : (input.registrationNumber ?? "").trim();
    const existing = number ? await customerRepository.findByIco(number, companyId) : null;
    const viaLink = { userId: link.createdByUserId, quoteNumber: "", viaLink: { requestedBy: link.createdBy } };

    let company: Pick<NewCompanyRegistrationRecord, "companyName" | "ico" | "dic" | "registeredAddress" | "city" | "country" | "dataSource">;
    let customerId: string;
    if (existing) {
      customerId = existing.id;
      if (czech) {
        const ares = await aresService.lookup(input.ico!);
        company = { companyName: ares.companyName, ico: ares.ico, dic: ares.dic, registeredAddress: ares.registeredAddress, city: ares.city, country: ares.country, dataSource: "ARES" };
      } else {
        const street = input.street!.trim();
        const city = input.city!.trim();
        const postalCode = input.postalCode!.trim();
        company = { companyName: input.companyName!.trim(), ico: number, dic: (input.vatId ?? "").trim(), registeredAddress: seatText(street, postalCode, city), city, country, dataSource: "Manual" };
      }
    } else {
      const customer = czech
        ? await customerService.createFromAres(companyId, "", input.ico!, input.contact, link.roles, viaLink)
        : await customerService.createManual(
            companyId,
            "",
            {
              country,
              companyName: input.companyName!,
              registrationNumber: input.registrationNumber,
              vatId: input.vatId,
              street: input.street!,
              city: input.city!,
              postalCode: input.postalCode!,
              contact: input.contact,
              roles: link.roles,
            },
            viaLink,
          );
      // The company is in the Customer Database now: the link is spent.
      progress.written = true;
      customerId = customer.id;
      company = { companyName: customer.companyName, ico: customer.ico, dic: customer.dic, registeredAddress: customer.registeredAddress, city: customer.city, country: customer.country, dataSource: czech ? "ARES" : "Manual" };
    }

    // For a company already there the registration is the first write: from here on the link is spent either way.
    progress.written = true;
    const registration = await repository.insert({
      companyId,
      linkId: link.id,
      customerId,
      alreadyInDatabase: !!existing,
      ...company,
      roles: link.roles,
      contactFirstName: input.contact.firstName.trim(),
      contactLastName: input.contact.lastName.trim(),
      contactEmail: contact.email ?? "",
      contactPhone: contact.phone ?? "",
      contactRole: contact.role ?? null,
      termsName: settings.termsName,
      termsUrl: settings.termsUrl,
      termsAcceptedAt: now,
      requestedBy: link.createdBy,
      requestedByUserId: link.createdByUserId,
    });

    // The one who created the link is in the chat from the start, and told by it. The registration is
    // made by now: a chat that can't be started is only logged (the creator is made a member again when
    // the chat is opened, and the registration waits on Company approval all the same).
    const threadId = existing ? registration.id : customerId;
    try {
      await repository.addMember(companyId, threadId, link.createdByUserId, null);
      await repository.addMessage({
        companyId,
        threadId,
        authorUserId: null,
        author: "",
        text: `${company.companyName} registered through the link${link.label ? ` for ${link.label}` : ""}${existing ? ". It is already in the Customer Database" : ""}.`,
      });
    } catch (err) {
      log.error(err, "the chat of a registration could not be started", { companyId, registrationId: registration.id });
    }
  }
}

export const companyRegistrationService = new CompanyRegistrationService();
