import { APIError } from "encore.dev/api";
import { customers } from "~encore/clients";
import { tariffRepository, type VersionSummaryRecord } from "../repositories/tariff.repository";
import type { TruckingTariffRecord, TruckingTariffVersionRecord } from "../schemas/truckingTariff.schema";
import type {
  TariffDetail,
  TariffListItem,
  TariffSide,
  TariffVersionDetail,
  TariffVersionInput,
  TariffVersionSummary,
} from "../interfaces/interfaces";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { formatDay } from "../lib/format";
import {
  cleanTariffCreate,
  cleanTariffUpdate,
  cleanVersionInput,
  versionLevels,
  versionStatus,
  type TariffCreateInput,
  type TariffUpdateInput,
} from "../lib/tariffRules";
import { validateVersion } from "../lib/tariffValidation";
import { fuelIndexService } from "./fuelIndex.service";

export const TARIFF_EXISTS = "This tariff already exists: there is one per side, scope and owner.";
export const VERSION_CONFLICT = "The tariff version was changed by someone else. Reload and try again.";

const today = () => businessDay(new Date());
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export function toSummary(r: VersionSummaryRecord, day: string): TariffVersionSummary {
  return {
    id: r.id,
    versionNo: r.versionNo,
    status: versionStatus(r, day),
    validFrom: r.validFrom,
    validTo: r.validTo,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    activatedAt: iso(r.activatedAt),
    activatedBy: r.activatedBy,
    serviceLevels: r.serviceLevels,
    zoneCount: r.zoneCount,
    warningCount: r.warningCount,
  };
}

const toDetail = (r: TruckingTariffVersionRecord, day: string): TariffVersionDetail => ({
  ...toSummary(r, day),
  tariffId: r.tariffId,
  input: r.input,
  findings: r.findings,
});

/** Names of Customer Database companies by id (any live customer, hauliers included). */
export async function customerNames(ids: (string | null)[]): Promise<Map<string, string>> {
  if (!ids.some(Boolean)) return new Map();
  const { data } = await customers._internalCustomerPipelineList();
  return new Map(data.map((c) => [c.id, c.companyName]));
}

function listItem(t: TruckingTariffRecord, versions: VersionSummaryRecord[], names: Map<string, string>, day: string): TariffListItem {
  const summaries = versions.filter((v) => v.tariffId === t.id).map((v) => toSummary(v, day));
  const scheduled = summaries.filter((s) => s.status === "SCHEDULED").sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  return {
    id: t.id,
    side: t.side,
    scope: t.scope,
    mode: t.mode,
    name: t.name,
    ownerCustomerId: t.ownerCustomerId,
    ownerName: t.ownerCustomerId ? (names.get(t.ownerCustomerId) ?? null) : null,
    currency: t.currency,
    zoneBy: t.zoneBy,
    discountPercent: t.discountPercent,
    activeVersion: summaries.find((s) => s.status === "ACTIVE") ?? null,
    nextVersion: scheduled[0] ?? null,
    draftCount: summaries.filter((s) => s.status === "DRAFT").length,
  };
}

const requireManager = (role: string, what: string) => {
  if (!isManager(role)) throw APIError.permissionDenied(`Only a manager can ${what}`);
};

class TariffService {
  async list(companyId: string, filter: { side?: TariffSide; ownerCustomerId?: string }): Promise<TariffListItem[]> {
    if (filter.ownerCustomerId && !isUuid(filter.ownerCustomerId)) return [];
    const tariffs = await tariffRepository.list(companyId, filter);
    const [versions, names] = await Promise.all([
      tariffRepository.versionSummaries(companyId, tariffs.map((t) => t.id)),
      customerNames(tariffs.map((t) => t.ownerCustomerId)),
    ]);
    const day = today();
    return tariffs.map((t) => listItem(t, versions, names, day));
  }

  private async tariff(companyId: string, id: string): Promise<TruckingTariffRecord> {
    const t = isUuid(id) ? await tariffRepository.find(companyId, id) : null;
    if (!t) throw APIError.notFound("Tariff not found");
    return t;
  }

  async get(companyId: string, id: string): Promise<TariffDetail> {
    const t = await this.tariff(companyId, id);
    const [versions, names] = await Promise.all([tariffRepository.versionSummaries(companyId, [t.id]), customerNames([t.ownerCustomerId])]);
    const day = today();
    return { ...listItem(t, versions, names, day), versions: versions.map((v) => toSummary(v, day)) };
  }

  /** Manager only. BUY belongs to a haulier, a customer's SELL to any customer. */
  async create(companyId: string, userId: string, role: string, input: TariffCreateInput): Promise<TariffDetail> {
    requireManager(role, "create a tariff");
    const values = cleanTariffCreate(input);
    if (values.side === "BUY") {
      const { hauliers } = await customers._internalHaulierList({ ids: [values.ownerCustomerId!] });
      if (!hauliers.length) throw APIError.invalidArgument("A buy tariff belongs to a haulier: this company is not one");
    } else if (values.ownerCustomerId && !(await customerNames([values.ownerCustomerId])).has(values.ownerCustomerId)) {
      throw APIError.invalidArgument("Unknown customer");
    }
    const by = await userName(userId);
    const row = await tariffRepository.createTariff(companyId, values, {
      kind: "tariff_created",
      customerId: values.ownerCustomerId,
      byUserId: userId || null,
      byName: by,
      payload: { changes: Object.fromEntries(Object.entries(values).map(([k, after]) => [k, { before: null, after }])) },
    });
    if (!row) throw APIError.aborted(TARIFF_EXISTS);
    return this.get(companyId, row.id);
  }

  /** Manager only: the name, the zone postcode and (DISCOUNT) the discount. */
  async update(companyId: string, userId: string, role: string, id: string, input: TariffUpdateInput): Promise<TariffDetail> {
    requireManager(role, "change a tariff");
    const t = await this.tariff(companyId, id);
    const next = cleanTariffUpdate(input, t.mode);
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const [key, after] of Object.entries(next) as [keyof TariffUpdateInput, unknown][]) {
      if (t[key] !== after) changes[key] = { before: t[key], after };
    }
    if (!Object.keys(changes).length) return this.get(companyId, id);
    const by = await userName(userId);
    const row = await tariffRepository.updateTariff(companyId, id, next, {
      kind: "tariff_updated",
      customerId: t.ownerCustomerId,
      byUserId: userId || null,
      byName: by,
      payload: { changes, tariffId: id },
    });
    if (!row) throw APIError.notFound("Tariff not found");
    return this.get(companyId, id);
  }

  /** The findings of an input, against the version binding today and the company's fuel index. */
  private async findings(companyId: string, tariffId: string, input: TariffVersionInput, exceptVersionId?: string) {
    const [active, months] = await Promise.all([
      tariffRepository.bindingOn(companyId, [tariffId], today()),
      fuelIndexService.list(companyId),
    ]);
    const activeInput = active.find((v) => v.id !== exceptVersionId)?.input ?? null;
    const findings = validateVersion(input, { fuelMonthCount: months.length, activeInput });
    return {
      findings,
      errorCount: findings.filter((f) => f.severity === "error").length,
      warningCount: findings.filter((f) => f.severity === "warning").length,
    };
  }

  /** Manager only: a new DRAFT of a MATRIX tariff, saved with its findings (errors do not stop a draft). */
  async createVersion(companyId: string, userId: string, role: string, tariffId: string, raw: TariffVersionInput): Promise<TariffVersionDetail> {
    requireManager(role, "add a tariff version");
    const t = await this.tariff(companyId, tariffId);
    if (t.mode === "DISCOUNT") throw APIError.invalidArgument("A discount tariff has no prices of its own: it follows the Standard sell list");
    const input = cleanVersionInput(raw);
    const checked = await this.findings(companyId, t.id, input);
    const by = await userName(userId);
    const row = await tariffRepository.createVersion(
      companyId,
      t.id,
      {
        validFrom: input.validFrom,
        validTo: input.validTo,
        input,
        ...checked,
        serviceLevels: versionLevels(input),
        zoneCount: input.zones.length,
        createdByUserId: userId || null,
        createdBy: by || null,
      },
      {
        kind: "tariff_version_created",
        customerId: t.ownerCustomerId,
        byUserId: userId || null,
        byName: by,
        payload: { changes: { validFrom: { before: null, after: input.validFrom }, validTo: { before: null, after: input.validTo } } },
      },
    );
    if (!row) throw APIError.notFound("Tariff not found");
    return toDetail(row, today());
  }

  async getVersion(companyId: string, id: string): Promise<TariffVersionDetail> {
    const row = isUuid(id) ? await tariffRepository.findVersion(companyId, id) : null;
    if (!row) throw APIError.notFound("Tariff version not found");
    return toDetail(row, today());
  }

  // Manager only. A draft without errors becomes binding from `validFrom` (today or later) to its
  // own valid-to; the version binding into that day ends the day before, later ones are superseded.
  async activate(companyId: string, userId: string, role: string, id: string, validFrom: string): Promise<TariffVersionDetail> {
    requireManager(role, "activate a tariff version");
    if (typeof validFrom !== "string" || !isRealYmd(validFrom)) throw APIError.invalidArgument("Valid from must be a date like 2026-12-31");
    const day = today();
    if (validFrom < day) throw APIError.invalidArgument(`A version cannot start in the past: valid from must be ${formatDay(day)} or later`);
    const draft = await this.getVersion(companyId, id);
    if (draft.status !== "DRAFT") throw APIError.aborted("Only a draft can be activated; this version already was");
    const validTo = draft.input.validTo;
    if (validTo !== null && validTo < validFrom) throw APIError.invalidArgument(`Valid from is after the version's valid to (${formatDay(validTo)})`);
    const input = { ...draft.input, validFrom };
    const checked = await this.findings(companyId, draft.tariffId, input, id);
    if (checked.errorCount) {
      throw APIError.failedPrecondition(`Fix the ${checked.errorCount} error${checked.errorCount === 1 ? "" : "s"} in this version before activating it`);
    }
    const tariff = await this.tariff(companyId, draft.tariffId);
    const by = await userName(userId);
    const result = await tariffRepository.activate(
      companyId,
      id,
      { validFrom, validTo, ...checked, activatedBy: by },
      {
        kind: "tariff_version_activated",
        customerId: tariff.ownerCustomerId,
        byUserId: userId || null,
        byName: by,
        payload: { changes: { validFrom: { before: draft.validFrom, after: validFrom }, validTo: { before: draft.validTo, after: validTo } } },
      },
    );
    if (!result.ok) {
      if (result.reason === "not_found") throw APIError.notFound("Tariff version not found");
      throw APIError.aborted(result.reason === "not_draft" ? "Only a draft can be activated; this version already was" : VERSION_CONFLICT);
    }
    return toDetail(result.version, today());
  }

  /** Manager only: a draft is thrown away (soft delete). */
  async discard(companyId: string, userId: string, role: string, id: string): Promise<void> {
    requireManager(role, "discard a tariff version");
    const draft = await this.getVersion(companyId, id);
    if (draft.status !== "DRAFT") throw APIError.failedPrecondition("Only a draft can be discarded");
    const tariff = await this.tariff(companyId, draft.tariffId);
    const by = await userName(userId);
    const row = await tariffRepository.discard(companyId, id, {
      kind: "tariff_version_discarded",
      customerId: tariff.ownerCustomerId,
      byUserId: userId || null,
      byName: by,
      payload: { changes: { versionNo: { before: draft.versionNo, after: null } } },
    });
    if (!row) throw APIError.aborted(VERSION_CONFLICT);
  }
}

export const tariffService = new TariffService();
