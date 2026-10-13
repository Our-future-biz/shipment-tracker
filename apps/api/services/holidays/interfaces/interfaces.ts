// One row of the World Holidays list, as read from a file. Dates are yyyy-mm-dd or "".
export interface HolidayRowInput {
  country: string;
  countryCode: string;
  nationalHoliday: string;
  nationalStart: string;
  nationalEnd: string;
  regionalHoliday: string;
  regionalStart: string;
  regionalEnd: string;
  regions: string;
}

export interface HolidayItem extends HolidayRowInput {
  id: string;
  source: string;
  createdAt: string;
}

export interface HolidayImportResult {
  added: number;
  skipped: number;
}

// "spreadsheet" when the file's columns matched and were read directly, "ai" otherwise.
export type HolidayReadMethod = "spreadsheet" | "ai";

export interface HolidayReadResult {
  rows: HolidayRowInput[];
  method: HolidayReadMethod;
  warning?: string;
}
