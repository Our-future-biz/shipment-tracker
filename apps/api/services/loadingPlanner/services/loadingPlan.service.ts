import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { quotes, shipments } from "~encore/clients";
import { userEmailOf } from "../../../lib/companyUsers";
import { iso } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import type { LoadingPlanItem, LoadingPlanSummary, PlanInput, PlanLinkKind } from "../interfaces/interfaces";
import { changedSinceMessage, cleanPlan, linkNeedsCheck, type CleanPlan } from "../lib/planInput";
import { loadingPlanRepository, type LoadingPlanListRow } from "../repositories/loadingPlan.repository";
import type { LoadingPlanRecord } from "../schemas/loadingPlan.schema";

const toItem = (r: LoadingPlanRecord, linkGone = false): LoadingPlanItem => ({
  id: r.id,
  name: r.name,
  linkKind: r.linkKind,
  linkId: r.linkId,
  linkRef: r.linkRef,
  lines: r.lines,
  nominated: r.nominated,
  createdBy: r.createdBy,
  updatedBy: r.updatedBy,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  linkGone,
});

const toSummary = (r: LoadingPlanListRow): LoadingPlanSummary => ({ ...r, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) });

const notFound = () => APIError.notFound("Loading plan not found");

const cleaned = (input: PlanInput): CleanPlan => {
  const result = cleanPlan(input);
  if ("problem" in result) throw APIError.invalidArgument(result.problem);
  return result.plan;
};

/**
 * What the linked shipment or quote is called now, asked of the service that owns it; null when
 * the caller's company has no such live job (it was deleted, or never was theirs). The call
 * carries the user's login, so the company is theirs. `reference` is what the plan holds: a quote
 * is found by it. Throws when the owning service does not answer.
 */
async function linkRefNow(kind: PlanLinkKind, id: string, reference: string): Promise<string | null> {
  if (kind === "shipment") return (await shipments._internalShipmentJobRef({ shipmentId: id })).jobNumber;
  return (await quotes._internalQuoteLinkRef({ quoteId: id, reference })).quoteNumber;
}

/**
 * The plan's link as the server vouches for it: the shipment or quote exists in the caller's
 * company, and the reference is what the job is called now, not what the browser sent. A plan
 * without a link passes as it is.
 */
async function withCheckedLink(plan: CleanPlan): Promise<CleanPlan> {
  if (!plan.linkKind || !plan.linkId) return plan;
  const linkRef = await linkRefNow(plan.linkKind, plan.linkId, plan.linkRef);
  if (linkRef === null) {
    throw APIError.invalidArgument(`The ${plan.linkKind} this plan is linked to was not found. Link the plan again, or unlink it.`);
  }
  return { ...plan, linkRef };
}

/**
 * A link the plan already has, as it stands now: what the job is called today (a shipment's job
 * number changes its letters until it is final, a quote takes the letters of its Freight Mode),
 * or that the job is gone. Best effort - when the owning service does not answer, the reference
 * the plan holds is kept and the job is taken to be there. Never refuses: a plan whose job was
 * deleted stays linked, and can still be opened and saved, until the user unlinks it.
 */
async function keptLink(stored: Pick<LoadingPlanRecord, "id" | "linkKind" | "linkId" | "linkRef">): Promise<{ linkRef: string; gone: boolean }> {
  if (!stored.linkKind || !stored.linkId) return { linkRef: "", gone: false };
  try {
    const now = await linkRefNow(stored.linkKind, stored.linkId, stored.linkRef);
    return { linkRef: now ?? stored.linkRef, gone: now === null };
  } catch (err) {
    log.warn(err, "what a loading plan's linked job is called now could not be read; the plan keeps the reference it holds", { planId: stored.id, linkKind: stored.linkKind });
    return { linkRef: stored.linkRef, gone: false };
  }
}

// Saved loading plans. Every user of the company may see and change all of its plans.
class LoadingPlanService {
  async list(companyId: string, link?: { kind: PlanLinkKind; id: string }): Promise<{ plans: LoadingPlanSummary[]; capped: boolean }> {
    const { rows, capped } = await loadingPlanRepository.listLatest(companyId, link);
    return { plans: rows.map(toSummary), capped };
  }

  // An id that is no id names no plan: answered so before Postgres refuses it with an error of its own.
  private async stored(id: string, companyId: string): Promise<LoadingPlanRecord> {
    const row = isUuid(id) ? await loadingPlanRepository.getByIdForCompany(id, companyId) : null;
    if (!row) throw notFound();
    return row;
  }

  /** One plan, with its linked job as it is now: its reference today (stored when it changed), or that it is gone. */
  async get(id: string, companyId: string): Promise<LoadingPlanItem> {
    const row = await this.stored(id, companyId);
    const { linkRef, gone } = await keptLink(row);
    if (row.linkKind && row.linkId && linkRef !== row.linkRef) {
      await loadingPlanRepository.setLinkRef(row.id, companyId, { kind: row.linkKind, id: row.linkId }, linkRef);
    }
    return toItem({ ...row, linkRef }, gone);
  }

  async create(companyId: string, userId: string, input: PlanInput): Promise<LoadingPlanItem> {
    const plan = await withCheckedLink(cleaned(input));
    const author = await userEmailOf(userId);
    return toItem(await loadingPlanRepository.createForCompany(companyId, { ...plan, createdBy: author, updatedBy: author }));
  }

  /**
   * Saves a plan again, whole. `basedOn` is the `updatedAt` the editor was given with the plan:
   * when someone else saved the plan since, this save is refused, not laid over theirs.
   */
  async update(id: string, companyId: string, userId: string, input: PlanInput, basedOn: string): Promise<LoadingPlanItem> {
    const base = new Date(basedOn);
    if (Number.isNaN(base.getTime())) throw APIError.invalidArgument("The plan's version is missing. Reload the plan and save again.");
    const stored = await this.stored(id, companyId);
    const changed = (now: LoadingPlanRecord) => APIError.aborted(changedSinceMessage(now.updatedBy, now.updatedAt));
    // Told before anything else is asked; the repository's conditional update below is what decides.
    if (stored.updatedAt.getTime() > base.getTime()) throw changed(stored);

    // A new or changed link is checked and refused when its job is not there (linkNeedsCheck); a
    // kept one is never refused, and takes the reference the job has now.
    const sent = cleaned(input);
    const fresh = linkNeedsCheck(sent, stored);
    const kept = fresh ? { linkRef: "", gone: false } : await keptLink({ ...stored, linkKind: sent.linkKind, linkId: sent.linkId });
    const plan = fresh ? await withCheckedLink(sent) : { ...sent, linkRef: kept.linkRef };

    const row = await loadingPlanRepository.updateIfUnchanged(id, companyId, base, { ...plan, updatedBy: await userEmailOf(userId) });
    if (row) return toItem(row, kept.gone);
    // Not written: deleted meanwhile, or saved by someone else between the read above and the write.
    throw changed(await this.stored(id, companyId));
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!isUuid(id) || !(await loadingPlanRepository.softDeleteForCompany(id, companyId))) throw notFound();
  }

  /** A quote was renamed (`from` → `to`): the plans linked to it name it as it is now. */
  async followQuoteRename(companyId: string, from: string, now: string): Promise<void> {
    await loadingPlanRepository.followQuoteRename(companyId, from, now);
  }

  /**
   * A quote was revised: its revision replaces it, and the plans linked to the quote go with it,
   * as a Won quote's shipments do. Returns how many plans moved.
   */
  async moveQuote(companyId: string, userId: string, fromQuoteId: string, to: { id: string; reference: string }): Promise<number> {
    const reference = to.reference.trim();
    if (!isUuid(fromQuoteId) || !isUuid(to.id) || !reference) throw APIError.invalidArgument("The quote and its revision are needed to move the loading plans");
    if (fromQuoteId === to.id) return 0;
    return loadingPlanRepository.moveQuote(companyId, fromQuoteId, { id: to.id, reference }, await userEmailOf(userId));
  }
}

export const loadingPlanService = new LoadingPlanService();
