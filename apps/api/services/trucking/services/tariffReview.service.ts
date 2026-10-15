import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { quotes } from "~encore/clients";
import { tariffRepository } from "../repositories/tariff.repository";
import { reportsRepository } from "../repositories/reports.repository";
import type { TariffVersionDiff, TestLaneLevel, TestLaneRequest } from "../interfaces/interfaces";
import { businessDay } from "../../../lib/businessDate";
import { cleanRateRequest, versionLevels } from "../lib/tariffRules";
import { diffVersions } from "../lib/tariffDiff";
import { rateOnVersion, type Shipment } from "../lib/rateEngine";
import { eurRate, ratingTariff } from "./rate.service";
import { settingsService } from "./settings.service";
import { fuelIndexService } from "./fuelIndex.service";
import { customerNames, tariffService, toSummary } from "./tariff.service";

// Reviewing a version before it is activated: what it changes against another version (the
// active one by default) and what it charges on a test lane.

class TariffReviewService {
  /** The diff of a version against `againstVersionId` (same tariff), else against the version active today. */
  async diff(companyId: string, versionId: string, againstVersionId?: string): Promise<TariffVersionDiff> {
    const version = await tariffService.versionRow(companyId, versionId);
    const day = businessDay(new Date());
    let against;
    if (againstVersionId) {
      against = await tariffService.versionRow(companyId, againstVersionId);
      if (against.tariffId !== version.tariffId) throw APIError.invalidArgument("Compare with a version of the same tariff");
    } else {
      against = (await tariffRepository.bindingOn(companyId, [version.tariffId], day))[0] ?? null;
    }
    const diff = diffVersions(version.input, against?.input ?? null, against ? toSummary(against, day) : null);
    return { ...diff, ...(await this.affected(companyId, version.tariffId)) };
  }

  /**
   * What a change of the tariff touches: open quotes (not won or lost) and open consignments (not
   * ready to bill or cancelled) priced with any of its versions. A count that cannot be read is
   * null (logged), as before Phase 7.
   */
  private async affected(companyId: string, tariffId: string): Promise<{ affectedOpenQuotes: number | null; affectedOpenConsignments: number | null }> {
    const versionIds = (await tariffRepository.versionSummaries(companyId, [tariffId])).map((v) => v.id);
    const settle = async (what: string, read: () => Promise<number>) => {
      try {
        return await read();
      } catch (err) {
        log.warn(`affected open ${what} could not be counted`, { companyId, tariffId, err: String(err) });
        return null;
      }
    };
    const [affectedOpenQuotes, affectedOpenConsignments] = await Promise.all([
      settle("quotes", async () => (versionIds.length ? (await quotes._internalQuotesByTariffVersions({ versionIds })).count : 0)),
      settle("consignments", () => reportsRepository.openConsignmentsPricedWith(companyId, versionIds)),
    ]);
    return { affectedOpenQuotes, affectedOpenConsignments };
  }

  /**
   * Prices a test shipment on this version (any status) for every level it prices, as one sell-style
   * side: no hauliers, no customer discount. Fuel index and ČNB rate of the pickup date.
   */
  async testLane(companyId: string, versionId: string, raw: TestLaneRequest): Promise<TestLaneLevel[]> {
    const version = await tariffService.versionRow(companyId, versionId);
    const tariff = await tariffService.tariff(companyId, version.tariffId);
    const req = cleanRateRequest({
      ...raw,
      pickupTime: null,
      scope: tariff.scope,
      customerId: null,
      serviceLevels: null,
      includeBuy: false,
      includeInternal: false,
    });
    const [settings, fuel, names, fx] = await Promise.all([
      settingsService.get(companyId),
      fuelIndexService.list(companyId),
      customerNames([tariff.ownerCustomerId]),
      tariff.currency === "EUR" ? eurRate(req.pickupDate) : Promise.resolve(null),
    ]);
    const shipment: Shipment = {
      fromPostcode: req.fromPostcode,
      toPostcode: req.toPostcode,
      pickupDate: req.pickupDate,
      palletPlaces: req.palletPlaces,
      ldm: req.ldm,
      weightKg: req.weightKg,
      cbm: req.cbm,
      extras: req.extras,
    };
    const rating = ratingTariff(tariff, names);
    const labels = new Map(settings.serviceLevels.map((l) => [l.code, l.label]));
    return versionLevels(version.input).map((level) => ({
      serviceLevel: level,
      label: labels.get(level) ?? level,
      result: rateOnVersion(rating, { id: version.id, versionNo: version.versionNo, input: version.input }, level, shipment, fuel, fx),
    }));
  }
}

export const tariffReviewService = new TariffReviewService();
