import { publicHolidayRepository } from "../repositories/publicHoliday.repository";
import type { PublicHolidayRecord } from "../schemas/publicHoliday.schema";
import { cleanRow, isUsableRow, rowKey, type HolidayRow } from "../lib/rows";
import type { HolidayItem, HolidayRowInput } from "../interfaces/interfaces";

const toRow = (r: PublicHolidayRecord): HolidayRow => ({
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
    const rows = await publicHolidayRepository.listForCompany(companyId);
    return rows.map((r) => ({ ...toRow(r), id: r.id, source: r.source, createdAt: r.createdAt.toISOString() }));
  }

  // Saves reviewed rows. Rows already in the list (same values in every column) and rows
  // without a country and a dated holiday are skipped, so the same file can be uploaded twice.
  async import(companyId: string, input: HolidayRowInput[], source: string) {
    const existing = new Set((await publicHolidayRepository.listForCompany(companyId)).map((r) => rowKey(toRow(r))));
    const fresh: HolidayRow[] = [];
    let skipped = 0;
    for (const raw of input) {
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
        source,
        nationalStart: r.nationalStart || null,
        nationalEnd: r.nationalEnd || null,
        regionalStart: r.regionalStart || null,
        regionalEnd: r.regionalEnd || null,
      })),
    );
    return { added: fresh.length, skipped };
  }

  async remove(id: string, companyId: string) {
    return publicHolidayRepository.softDelete(id, companyId);
  }
}

export const holidaysService = new HolidaysService();
