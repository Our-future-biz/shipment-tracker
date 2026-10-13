// A UN/LOCODE place as shipments, quotes and the extraction use it, written "Name (CODE)".
export interface Place {
  code: string;
  countryCode: string;
  name: string;
  subdivisionName: string | null;
}
