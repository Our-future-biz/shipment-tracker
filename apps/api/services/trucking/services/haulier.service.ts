import { APIError } from "encore.dev/api";
import { customers } from "~encore/clients";
import { haulierRepository, type StoredProfile } from "../repositories/haulier.repository";
import type {
  HaulierDetail,
  HaulierIssue,
  HaulierListItem,
  HaulierProfile,
  HaulierProfileInput,
  HaulierStatus,
} from "../interfaces/interfaces";
import type { TruckingEventKind } from "../schemas/truckingEvent.schema";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import {
  cleanProfileInput,
  defaultProfile,
  haulierIssues,
  haulierStatus,
  NO_PROFILE_ISSUES,
  profileChanges,
} from "../lib/haulierRules";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { settingsService } from "./settings.service";

export const HAULIER_CONFLICT = "The haulier was changed by someone else. Reload and try again.";
const MAX_REASON = 500;

/** A haulier company as the Customer Database gives it. */
interface HaulierCompanyItem {
  id: string;
  companyName: string;
  ico: string;
  dic: string;
  city: string;
}

const toProfile = ({ profile: r, lanes }: StoredProfile): HaulierProfile => ({
  customerId: r.customerId,
  insurer: r.insurer,
  insurancePolicyNo: r.insurancePolicyNo,
  insuranceLimit: r.insuranceLimit,
  insuranceCurrency: r.insuranceCurrency,
  insuranceValidTo: r.insuranceValidTo,
  licenceNo: r.licenceNo,
  licenceValidTo: r.licenceValidTo,
  licenceUnlimited: r.licenceUnlimited,
  adrCapable: r.adrCapable,
  vehicleTypes: r.vehicleTypes,
  paymentDays: r.paymentDays,
  currency: r.currency,
  vatUnreliable: r.vatUnreliable,
  bankAccountPublished: r.bankAccountPublished,
  vatCheckedAt: r.vatCheckedAt,
  costSplitBasis: r.costSplitBasis,
  blocked: r.blocked,
  blockReason: r.blockReason,
  blockedAt: r.blockedAt ? r.blockedAt.toISOString() : null,
  blockedBy: r.blockedBy,
  notes: r.notes,
  preferredLanes: lanes.map((l) => ({
    id: l.id,
    originPostcodeFrom: l.originPostcodeFrom,
    originPostcodeTo: l.originPostcodeTo,
    destPostcodeFrom: l.destPostcodeFrom,
    destPostcodeTo: l.destPostcodeTo,
    serviceKind: l.serviceKind,
    note: l.note,
  })),
  version: r.version,
});

/** Issues and status of a haulier on `today`; a haulier without a profile cannot be used yet. */
export function assess(profile: HaulierProfile | null, today: string): { status: HaulierStatus; issues: HaulierIssue[] } {
  const issues = profile ? haulierIssues(profile, today) : NO_PROFILE_ISSUES;
  return { status: haulierStatus(issues), issues };
}

const today = () => businessDay(new Date());

const editable = (p: HaulierProfile): Omit<HaulierProfileInput, "preferredLanes"> => ({
  insurer: p.insurer,
  insurancePolicyNo: p.insurancePolicyNo,
  insuranceLimit: p.insuranceLimit,
  insuranceCurrency: p.insuranceCurrency,
  insuranceValidTo: p.insuranceValidTo,
  licenceNo: p.licenceNo,
  licenceValidTo: p.licenceValidTo,
  licenceUnlimited: p.licenceUnlimited,
  adrCapable: p.adrCapable,
  vehicleTypes: p.vehicleTypes,
  paymentDays: p.paymentDays,
  currency: p.currency,
  vatUnreliable: p.vatUnreliable,
  bankAccountPublished: p.bankAccountPublished,
  vatCheckedAt: p.vatCheckedAt,
  costSplitBasis: p.costSplitBasis,
  notes: p.notes,
});

class HaulierService {
  /** The company in the Customer Database, if it is a live haulier there. */
  private async company(customerId: string): Promise<HaulierCompanyItem> {
    if (!isUuid(customerId)) throw APIError.notFound("Haulier not found");
    const { hauliers } = await customers._internalHaulierList({ ids: [customerId] });
    const company = hauliers.find((h) => h.id === customerId);
    if (!company) throw APIError.notFound("Haulier not found");
    return company;
  }

  private detail(company: HaulierCompanyItem, stored: StoredProfile | null): HaulierDetail {
    const profile = stored ? toProfile(stored) : defaultProfile(company.id);
    return {
      customerId: company.id,
      companyName: company.companyName,
      ico: company.ico,
      dic: company.dic,
      city: company.city,
      profile,
      ...assess(stored ? profile : null, today()),
    };
  }

  /** Every haulier of the Customer Database with its trucking status, by company name. */
  async list(companyId: string, filter: { status?: HaulierStatus; search?: string }): Promise<HaulierListItem[]> {
    const [{ hauliers }, profiles] = await Promise.all([customers._internalHaulierList({}), haulierRepository.listWithLaneCounts(companyId)]);
    const byCustomer = new Map(profiles.map((x) => [x.profile.customerId, x]));
    const day = today();
    const search = filter.search?.trim().toLowerCase() ?? "";
    const items = hauliers.map((h): HaulierListItem => {
      const stored = byCustomer.get(h.id);
      const profile = stored ? toProfile({ profile: stored.profile, lanes: [] }) : null;
      return {
        customerId: h.id,
        companyName: h.companyName,
        ico: h.ico,
        city: h.city,
        hasProfile: !!profile,
        ...assess(profile, day),
        insuranceValidTo: profile?.insuranceValidTo ?? null,
        licenceValidTo: profile && !profile.licenceUnlimited ? profile.licenceValidTo : null,
        adrCapable: profile?.adrCapable ?? false,
        vehicleTypes: profile?.vehicleTypes ?? [],
        preferredLaneCount: stored?.laneCount ?? 0,
      };
    });
    return items
      .filter((i) => !filter.status || i.status === filter.status)
      .filter((i) => !search || [i.companyName, i.ico, i.city].some((v) => v.toLowerCase().includes(search)))
      .sort((a, b) => a.companyName.localeCompare(b.companyName, "cs"));
  }

  async get(companyId: string, customerId: string): Promise<HaulierDetail> {
    const company = await this.company(customerId);
    return this.detail(company, await haulierRepository.find(companyId, customerId));
  }

  /** Whether the haulier may be put on a trip today (no block issue), with all its issues. */
  async usable(companyId: string, customerId: string): Promise<{ usable: boolean; issues: HaulierIssue[] }> {
    const { status, issues } = await this.get(companyId, customerId);
    return { usable: status !== "blocked", issues };
  }

  // Any user. The whole profile is sent with the version read (0 when none is saved yet); the
  // block stays as it is. Refused when someone saved, blocked or unblocked meanwhile.
  async update(companyId: string, userId: string, customerId: string, input: HaulierProfileInput, version: number): Promise<HaulierDetail> {
    if (!Number.isInteger(version) || version < 0) throw APIError.invalidArgument("version must be the version you read (0 when none is saved yet)");
    const company = await this.company(customerId);
    const next = cleanProfileInput(input, await settingsService.vehicleCodes(companyId), today());
    const stored = await haulierRepository.find(companyId, customerId);
    const cur = stored ? toProfile(stored) : defaultProfile(customerId);
    if (cur.version !== version) throw APIError.aborted(HAULIER_CONFLICT);
    const changes = profileChanges(cur, next);
    if (stored && !Object.keys(changes).length) return this.detail(company, stored);
    const by = await userName(userId);
    const { preferredLanes, ...values } = next;
    const saved = await haulierRepository.save(companyId, customerId, version, values, preferredLanes, {
      kind: stored ? "profile_updated" : "profile_created",
      byUserId: userId || null,
      byName: by,
      payload: { changes },
    });
    if (!saved) throw APIError.aborted(HAULIER_CONFLICT);
    return this.get(companyId, customerId);
  }

  /** Manager only: keeps the haulier off trips until unblocked, with the reason. */
  async block(companyId: string, userId: string, role: string, customerId: string, reason: string): Promise<HaulierDetail> {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can block a haulier");
    const why = typeof reason === "string" ? reason.trim() : "";
    if (why.length < 3 || why.length > MAX_REASON) throw APIError.invalidArgument(`Give a reason for the block (3 to ${MAX_REASON} characters)`);
    return this.setBlocked(companyId, userId, customerId, true, why);
  }

  /** Manager only: lets a blocked haulier be used again, with the reason. */
  async unblock(companyId: string, userId: string, role: string, customerId: string, reason: string): Promise<HaulierDetail> {
    if (!isManager(role)) throw APIError.permissionDenied("Only a manager can unblock a haulier");
    const why = typeof reason === "string" ? reason.trim() : "";
    if (!why) throw APIError.invalidArgument("Give a reason for lifting the block");
    if (why.length > MAX_REASON) throw APIError.invalidArgument(`The reason can be at most ${MAX_REASON} characters long`);
    return this.setBlocked(companyId, userId, customerId, false, why);
  }

  private async setBlocked(companyId: string, userId: string, customerId: string, blocked: boolean, reason: string): Promise<HaulierDetail> {
    await this.company(customerId);
    const stored = await haulierRepository.find(companyId, customerId);
    const cur = stored ? toProfile(stored) : defaultProfile(customerId);
    if (cur.blocked === blocked) {
      throw APIError.failedPrecondition(blocked ? "This haulier is already blocked" : "This haulier is not blocked");
    }
    const by = await userName(userId);
    const block = blocked
      ? { blocked: true, blockReason: reason, blockedAt: new Date(), blockedBy: by || null }
      : { blocked: false, blockReason: "", blockedAt: null, blockedBy: null };
    const kind: TruckingEventKind = blocked ? "haulier_blocked" : "haulier_unblocked";
    const saved = await haulierRepository.save(companyId, customerId, cur.version, { ...editable(cur), ...block }, null, {
      kind,
      byUserId: userId || null,
      byName: by,
      payload: {
        changes: {
          blocked: { before: cur.blocked, after: blocked },
          blockReason: { before: cur.blockReason, after: block.blockReason },
        },
        reason,
      },
    });
    if (!saved) throw APIError.aborted(HAULIER_CONFLICT);
    return this.get(companyId, customerId);
  }
}

export const haulierService = new HaulierService();
