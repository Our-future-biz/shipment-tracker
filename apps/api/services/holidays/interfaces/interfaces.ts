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
