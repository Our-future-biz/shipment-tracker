import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { asCompany } from "../../../lib/internalCall";
import { storedEmail, type CompanyUser } from "../../../lib/personPick";
import type { UserLinksBackfillResult } from "../interfaces/interfaces";
import { planUserLinks } from "../lib/userLinks";
import { shipmentRepository } from "../repositories/shipment.repository";

// The daily backfill of the users' ids beside Handled By and Holiday Cover (lib/userLinks): every
// write of the e-mails sets them (services/shipment.service linkUsers), this fills the rows written
// before that, and those a write could not link (the users unreadable at the time). Run by
// crons/shipmentUserLinks.cron.ts; safe to run again - a job that carries the right id is not
// written, and one edited since the read keeps the id its edit set.

class ShipmentUserLinksService {
  /** The active users of a company, read as the company itself (a cron has nobody signed in). */
  private async usersOf(companyId: string): Promise<CompanyUser[]> {
    const { users } = await auth.usersList(asCompany(companyId));
    return users.map((u) => ({ id: u.id, email: storedEmail(u.email), displayName: u.displayName }));
  }

  /** One company: the ids for every distinct value its live jobs hold. Returns the jobs changed. */
  async backfill(companyId: string): Promise<number> {
    const [values, users] = await Promise.all([shipmentRepository.personValuesOf(companyId), this.usersOf(companyId)]);
    return shipmentRepository.setUserLinks(companyId, planUserLinks(values, users));
  }

  /** Every company, each on its own: one that fails is logged and tried again on the next run. */
  async backfillAll(): Promise<UserLinksBackfillResult> {
    const companies = await shipmentRepository.companyIds();
    let failed = 0;
    let changed = 0;
    for (const companyId of companies) {
      try {
        changed += await this.backfill(companyId);
      } catch (err) {
        failed++;
        log.warn(err, "the users of Handled By and Holiday Cover were not linked", { companyId });
      }
    }
    return { companies: companies.length, failed, changed };
  }
}

export const shipmentUserLinksService = new ShipmentUserLinksService();
