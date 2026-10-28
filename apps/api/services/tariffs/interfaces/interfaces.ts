// Tariffs: suppliers' price lists, uploaded as their own Excel files and turned into data the app can
// price with. Rail first: a rail operator's container prices from sea ports to inland places.

/** What a tariff prices; rail first, more modes later. */
export type SupplierTariffMode = "rail";

/** draft: uploaded, being checked; active: prices with; superseded: replaced by a later version. */
export type SupplierTariffStatus = "draft" | "active" | "superseded";

/** Import: port to inland; export: inland to port. A tariff is for one or both. */
export type RailDirection = "import" | "export";

/** How a version's layout was found: read by the AI, the one the tariff's last approved version used, or corrected by a user. */
export type LayoutSource = "ai" | "remembered" | "edited";

/** A column of the sheet, by its letter ("A", "AB"). */
export type ColumnLetter = string;

/** A price column: the container lengths and gross weight its prices are for. */
export interface RailBand {
  column: ColumnLetter;
  /** As the tariff names it, e.g. "20' 0<14 t" */
  label: string;
  minLengthFt: number;
  maxLengthFt: number;
  /** The heaviest gross weight (cargo + container tare), in tonnes; null when the price has no weight limit */
  maxGrossTonnes: number | null;
}

/** A sea port a tariff runs from or to, by UN/LOCODE: Antwerp, Rotterdam, Hamburg, Bremerhaven, Wilhelmshaven, Koper. */
export type TariffPortCode = "BEANR" | "NLRTM" | "DEHAM" | "DEBRV" | "DEWVN" | "SIKOP";

export interface TariffLink {
  label: string;
  url: string;
}

/** Which columns hold what; null when the sheet has no such column. */
export interface RailLayoutColumns {
  country: ColumnLetter | null;
  postcode: ColumnLetter | null;
  place: ColumnLetter;
  region: ColumnLetter | null;
  /** The terminal the train runs via */
  via: ColumnLetter | null;
  /** Where the empty container is returned or picked up; the same column as `via` when one cell holds both ("Praha/Praha") */
  emptyDepot: ColumnLetter | null;
  note: ColumnLetter | null;
  validFrom: ColumnLetter | null;
  validTo: ColumnLetter | null;
}

/** How a rail tariff's sheet is read: proposed by the AI (or remembered), corrected by the user. */
export interface RailLayout {
  sheet: string;
  /** 1-based row of the column headings */
  headerRow: number;
  /** 1-based first price row */
  firstDataRow: number;
  /** 1-based last price row, when notes or totals follow the table; null reads to the end. Empty rows are skipped. */
  lastDataRow: number | null;
  columns: RailLayoutColumns;
  bands: RailBand[];
  /** ISO 4217, e.g. "EUR" */
  currency: string;
  /** The tariff's validity, YYYY-MM-DD */
  validFrom: string | null;
  validTo: string | null;
  /** ISO 3166-1 alpha-2 of the inland places when the sheet has no country column */
  defaultCountry: string;
  /** What the prices include and the tariff's terms, one line each */
  conditions: string[];
  links: TariffLink[];
  /** A name for the tariff, e.g. "Hamburg / Bremerhaven / Wilhelmshaven – Czechia" */
  name: string;
}

/** One inland place of a rail tariff with its prices, as read from one sheet row. */
export interface RailRateRow {
  /** The sheet row it was read from */
  rowNo: number;
  /** ISO 3166-1 alpha-2 */
  country: string;
  /** As the tariff writes it, e.g. "36235" or "1xxxx" */
  postcode: string;
  /** The postcodes the row covers, 5 digits each ("1xxxx" → 10000–19999; a note "ZIP 10000-19900" → that range) */
  postcodeFrom: string | null;
  postcodeTo: string | null;
  place: string;
  region: string;
  via: string;
  emptyDepot: string;
  note: string;
  validFrom: string | null;
  validTo: string | null;
  /** Amount by band code (see bandCode); a band without a price is left out */
  prices: Record<string, number>;
}

export interface RailRate extends RailRateRow {
  id: string;
}

export type FindingLevel = "error" | "warning";

/** A problem the checks found; errors stop a version from being approved. */
export interface TariffFinding {
  level: FindingLevel;
  /** What kind of problem, e.g. "price_not_number" */
  code: string;
  message: string;
  /** How many rows have it */
  count: number;
  /** The first few sheet rows that have it */
  rows: number[];
  column?: ColumnLetter;
}

/** The first rows of a sheet, as text by column letter, for setting up the layout by hand. */
export interface SheetPreview {
  name: string;
  rowCount: number;
  rows: { rowNo: number; cells: Record<ColumnLetter, string> }[];
}

export interface SupplierTariffVersion {
  id: string;
  tariffId: string;
  versionNo: number;
  status: SupplierTariffStatus;
  validFrom: string | null;
  validTo: string | null;
  currency: string;
  rowCount: number;
  warningCount: number;
  errorCount: number;
  layoutSource: LayoutSource;
  sourceFileName: string | null;
  createdAt: string;
  createdBy: string | null;
  activatedAt: string | null;
  activatedBy: string | null;
}

export interface TariffRef {
  id: string;
  name: string;
  mode: SupplierTariffMode;
  supplierCustomerId: string;
  supplierName: string;
  ports: TariffPortCode[];
  directions: RailDirection[];
}

export interface SupplierTariffVersionDetail extends SupplierTariffVersion {
  tariff: TariffRef;
  layout: RailLayout;
  /** The band codes of layout.bands, in the same order */
  bandCodes: string[];
  findings: TariffFinding[];
  preview: SheetPreview[];
}

export interface RailTariffItem {
  id: string;
  name: string;
  mode: SupplierTariffMode;
  supplierCustomerId: string;
  /** The sea ports it runs from or to, as the user chose them, in list order */
  ports: TariffPortCode[];
  /** Import, export or both, as the user chose */
  directions: RailDirection[];
  /** Newest first */
  versions: SupplierTariffVersion[];
}

/** A rail operator (a Customer Database company with the role) with its tariffs at a glance. */
export interface RailOperatorItem {
  customerId: string;
  companyName: string;
  ico: string;
  city: string;
  country: string;
  tariffCount: number;
  /** The ports and directions of all its tariffs together, in list order */
  ports: TariffPortCode[];
  directions: RailDirection[];
  /** Versions that price today */
  activeCount: number;
  draftCount: number;
  /** The soonest end of an active version, YYYY-MM-DD; null when none ends */
  activeUntil: string | null;
}

export interface TariffFile {
  fileName: string;
  fileBase64: string;
  contentType: string;
}

// ── Rail offers: what the tariffs ask for a quote's containers on its route ──

/** A quote's containers of one type, as rail offers are asked for. */
export interface RailOfferContainer {
  /** As quotes name it, e.g. "40' HC" */
  type: string;
  qty: number;
  /** Cargo weight per container in kg, without the box; null when not entered */
  cargoKg: number | null;
}

/** A container line as the tariffs count it. */
export interface RailPricedContainer extends RailOfferContainer {
  /** From the container tare list; null for a type it does not have */
  tareKg: number | null;
  /** Cargo + tare, what the weight bands are by; null when either is unknown */
  grossKg: number | null;
  /** The length the tariffs price it by: a 45' as a 40' */
  lengthFt: number | null;
}

/** One container line of an offer: the band its gross weight falls in and that band's price. */
export interface RailOfferLine {
  type: string;
  qty: number;
  bandCode: string;
  /** As the tariff names it, e.g. "20'<25 t" */
  bandLabel: string;
  /** Per container */
  price: number;
  /** price × qty */
  amount: number;
}

/** One tariff row that prices every container of the route: its operator, terminal and total. */
export interface RailOffer {
  rateId: string;
  versionId: string;
  versionNo: number;
  tariffId: string;
  tariffName: string;
  supplierCustomerId: string;
  supplierName: string;
  currency: string;
  place: string;
  postcode: string;
  region: string;
  /** The terminal the train runs via */
  via: string;
  emptyDepot: string;
  note: string;
  /** The version's last day; null when open */
  validTo: string | null;
  lines: RailOfferLine[];
  total: number;
}

/** How the place was looked for: by a postcode in it, or by its name. */
export type RailOfferMatch = "postcode" | "place";
