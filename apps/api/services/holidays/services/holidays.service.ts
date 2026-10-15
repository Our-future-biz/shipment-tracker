import { APIError } from "encore.dev/api";
import { publicHolidayRepository } from "../repositories/publicHoliday.repository";
import type { PublicHolidayRecord } from "../schemas/publicHoliday.schema";
import { cleanRow, isUsableRow, rowKey } from "../lib/rows";
import { addDays, isRealYmd } from "../../../lib/businessDate";
import type { HolidayImportResult, HolidayItem, HolidayRowInput } from "../interfaces/interfaces";

const toRow = (r: PublicHolidayRecord): HolidayRowInput => ({
  country: r.country,
  countryCode: r.countryCode,
  nationalHoliday: r.nationalHoliday,
  nationalStart: r.nationalStart ?? "",
  nationalEnd: r.nationalEnd ?? "",
  regionalHoliday: r.regionalHoliday,
  regionalStart: r.regionalStart ?? "",
  regionalEnd: r.regionalEnd ?? "",
  regions: r.regions,
});

class HolidaysService {
  async list(companyId: string): Promise<HolidayItem[]> {
    const rows = await publicHolidayRepository.listAllForCompany(companyId);
    return rows.map((r) => ({ ...toRow(r), id: r.id, source: r.source, createdAt: r.createdAt.toISOString() }));
  }

  // Saves reviewed rows. Rows already in the list (same values in every column) and rows
  // without a country and a dated holiday are skipped, so the same file can be uploaded twice.
  async import(companyId: string, input: HolidayRowInput[] | undefined, source: string | undefined): Promise<HolidayImportResult> {
    const existing = new Set((await publicHolidayRepository.listAllForCompany(companyId)).map((r) => rowKey(toRow(r))));
    const fresh: HolidayRowInput[] = [];
    let skipped = 0;
    for (const raw of input ?? []) {
      const row = cleanRow(raw);
      const key = rowKey(row);
      if (!isUsableRow(row) || existing.has(key)) {
        skipped++;
        continue;
      }
      existing.add(key);
      fresh.push(row);
    }
    await publicHolidayRepository.insertMany(
      fresh.map((r) => ({
        ...r,
        companyId,
        source: (source ?? "").trim(),
        nationalStart: r.nationalStart || null,
        nationalEnd: r.nationalEnd || null,
        regionalStart: r.regionalStart || null,
        regionalEnd: r.regionalEnd || null,
      })),
    );
    return { added: fresh.length, skipped };
  }

  // The company's uploaded national Czech holidays (country code CZ, no regions) as single
  // yyyy-mm-dd days within from..to, sorted and without repeats. Callers add them to the
  // statutory calendar in lib/workingDays.ts, which already knows the days set by law.
  async czNationalDates(companyId: string, from: string, to: string): Promise<string[]> {
    if (!isRealYmd(from) || !isRealYmd(to)) throw APIError.invalidArgument("From and to must be real dates (YYYY-MM-DD)");
    if (from > to) throw APIError.invalidArgument("From must not be after to");
    const rows = await publicHolidayRepository.listCzNationalOverlapping(companyId, from, to);
    const dates = new Set<string>();
    for (const r of rows) {
      if (!r.nationalStart) continue;
      const last = r.nationalEnd ?? r.nationalStart;
      for (let d = r.nationalStart; d <= last && d <= to; d = addDays(d, 1)) if (d >= from) dates.add(d);
    }
    return [...dates].sort();
  }

  async remove(id: string, companyId: string): Promise<void> {
    const row = await publicHolidayRepository.softDeleteForCompany(id, companyId);
    if (!row) throw APIError.notFound("Holiday not found");
  }
}

export const holidaysService = new HolidaysService();
