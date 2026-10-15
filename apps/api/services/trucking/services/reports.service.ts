import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { czHolidays } from "../lib/czHolidays";
import { reportsRepository, type ReportScope } from "../repositories/reports.repository";
import { rateGapRepository } from "../repositories/rateGap.repository";
import { tariffRepository } from "../repositories/tariff.repository";
import { haulierRepository } from "../repositories/haulier.repository";
import type { FileDownload, HaulierStatus, TruckingSettings } from "../interfaces/interfaces";
import type { CoverageGap, TruckingReport } from "../interfaces/reports.interfaces";
import { buildKpis, departmentResult, haulierScores, marginTables, resolvePeriod, type FillTrip, type HaulierAmount, type ReportPeriod } from "../lib/reportCalc";
import { buildReportWorkbook } from "../lib/reportWorkbook";
import { coverageGapItem } from "../lib/rateGaps";
import { findZone } from "../lib/rateEngine";
import { assess, toProfile } from "./haulier.service";
import { eurRate } from "./rate.service";
import { settingsService } from "./settings.service";

// The Reports tab of Trucking (Phase 7): the grouped queries of the period (reports repository),
// the company's holidays, hauliers and ČNB rates they need, and the KPIs, margin tables, haulier
// scorecard, coverage gaps and department result worked out of them (lib/reportCalc.ts). Read
// only; any user of the company.

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_GAPS = 50;

type Query = { from?: string; to?: string };

class ReportsService {
  async report(companyId: string, q: Query, now = new Date()): Promise<TruckingReport> {
    const period = resolvePeriod(q.from, q.to, now);
    if ("error" in period) throw APIError.invalidArgument(period.error);
    const today = businessDay(now);
    const settings = await settingsService.get(companyId);
    const scope: ReportScope = { companyId, period, factors: settings.factors, floor: settings.marginFloor };
    const r = reportsRepository;
    const [delivered, margins, podPairs, perf, costs, failedReasons, podOpen, fillRows, exceptions, claims, invoicesBlocked, invoiceDifferences, internal, gaps, zoneOf] =
      await Promise.all([
        r.deliveredGroups(scope),
        r.marginGroups(scope),
        r.podPairs(scope),
        r.haulierPerf(scope),
        r.haulierCosts(scope),
        r.failedReasons(scope),
        r.podOpen(companyId),
        r.fillTrips(companyId, period),
        r.exceptionGroups(companyId, period),
        r.claims(companyId, period),
        r.invoicesBlocked(companyId),
        r.invoiceDifferences(companyId, period),
        r.internalGroups(companyId, period),
        this.gaps(companyId, period),
        this.zones(companyId, today),
      ]);

    const haulierIds = [...new Set([...perf, ...costs, ...podOpen, ...claims, ...invoicesBlocked, ...invoiceDifferences].map((x) => x.haulierId).filter((x): x is string => !!x))];
    const firstDay = [period.from, ...podPairs.map((p) => p.deliveredDay), ...podOpen.map((p) => p.deliveredDay)].sort()[0]!;
    const [holidays, hauliers, eur] = await Promise.all([czHolidays(companyId, firstDay, today), this.hauliers(companyId, haulierIds, today), this.eurRates([...claims, ...invoiceDifferences])]);

    const levelLabels = new Map(settings.serviceLevels.map((l) => [l.code as string, l.label]));
    const fillTrips: FillTrip[] = fillRows.map((t) => ({ kind: t.kind, ldm: t.ldm, kg: t.kg, capacity: capacityOf(settings, t.vehicleTypeCode) }));
    return {
      from: period.from,
      to: period.to,
      kpis: buildKpis({ delivered, podPairs, podOpen, fillTrips, exceptions, failedReasons, holidays, levelLabels, haulierNames: hauliers.names }, today),
      ...marginTables(margins, levelLabels, zoneOf),
      hauliers: haulierScores({ perf, costs, podPairs, claims, invoicesBlocked, invoiceDifferences, holidays, eur, names: hauliers.names, statuses: hauliers.statuses }),
      coverageGaps: gaps,
      department: departmentResult(delivered, internal),
    };
  }

  async exportReport(companyId: string, q: Query): Promise<FileDownload> {
    const report = await this.report(companyId, q);
    const bytes = await buildReportWorkbook(report);
    return { fileName: `trucking-report-${report.from}-${report.to}.xlsx`, fileBase64: bytes.toString("base64"), contentType: XLSX };
  }

  /** The period's coverage gaps; none (logged) when they cannot be read. */
  private async gaps(companyId: string, period: ReportPeriod): Promise<CoverageGap[]> {
    try {
      return (await rateGapRepository.lastIn(companyId, period.from, period.to, MAX_GAPS)).map(coverageGapItem);
    } catch (err) {
      log.warn("coverage gaps could not be read", { companyId, err: String(err) });
      return [];
    }
  }

  /** The zone of a postcode in the Standard sell list binding today (LTL, else FTL); null when none. */
  private async zones(companyId: string, today: string): Promise<(postcode: string) => string | null> {
    const sell = await tariffRepository.list(companyId, { side: "SELL" });
    const standard = ["LTL", "FTL"].map((s) => sell.find((t) => t.scope === s && !t.ownerCustomerId)).filter((t) => !!t);
    const versions = standard.length ? await tariffRepository.bindingOn(companyId, standard.map((t) => t.id), today) : [];
    const version = standard.map((t) => versions.find((v) => v.tariffId === t.id)).find((v) => !!v);
    return (postcode) => (version ? (findZone(version.input.zones, postcode)?.code ?? null) : null);
  }

  /** Names (Customer Database) and current status (profile) of the hauliers. */
  private async hauliers(companyId: string, ids: string[], today: string): Promise<{ names: Map<string, string>; statuses: Map<string, HaulierStatus> }> {
    if (!ids.length) return { names: new Map(), statuses: new Map() };
    const [{ hauliers }, profiles] = await Promise.all([customers._internalHaulierList({ ids }), haulierRepository.findMany(companyId, ids)]);
    const profileOf = new Map(profiles.map((p) => [p.profile.customerId, toProfile(p)]));
    return {
      names: new Map(hauliers.map((h) => [h.id, h.companyName])),
      statuses: new Map(ids.map((id) => [id, assess(profileOf.get(id) ?? null, today).status])),
    };
  }

  /** The ČNB EUR rate of each day an EUR amount is from. */
  private async eurRates(amounts: HaulierAmount[]): Promise<Map<string, number | null>> {
    const days = [...new Set(amounts.filter((a) => a.currency === "EUR").map((a) => a.day))];
    const rates = await Promise.all(days.map(async (day) => [day, (await eurRate(day))?.rate ?? null] as const));
    return new Map(rates);
  }
}

/** A vehicle type's capacity from the settings; null without one. */
const capacityOf = (settings: TruckingSettings, code: string | null) => {
  const v = code ? settings.vehicleTypes.find((x) => x.code === code) : undefined;
  return v ? { ldm: v.capacityLdm, kg: v.capacityKg } : null;
};

export const reportsService = new ReportsService();
