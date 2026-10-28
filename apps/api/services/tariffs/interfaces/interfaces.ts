// Tariffs: suppliers' price lists, uploaded as their own Excel files and turned into data the app can
// price with. Rail: a rail operator's container prices from sea ports to inland places. Collection:
// a first / last mile haulier's prices for collecting and delivering LCL and air consignments.
// Ocean: a shipping line's freight per container from port to port, with its surcharges.

/** What a tariff prices: rail container transport, first / last mile collection and delivery, or ocean freight. */
export type SupplierTariffMode = "rail" | "collection" | "ocean";

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

// ── Collections: first / last mile hauliers' tariffs (Tariffs → Last / First Mile Collections) ──

/** The freight a collections tariff collects and delivers. */
export type CollectionFreightMode = "sea_lcl" | "air";

/** How a collections tariff finds a consignment's price column: the distance between our hub and the customer, or the customer's postcode area. */
export type CollectionZoneBy = "distance" | "postcode";

/** A price column of a collections price table. */
export interface CollectionZone {
  column: ColumnLetter;
  /** As the tariff names it, e.g. "100 km", "Zone 3" */
  label: string;
  /** By distance: the longest distance in km the column is for */
  kmTo: number | null;
  /** By postcode area: the zone the areas name, e.g. "3" */
  zone: string | null;
}

/** A price table: weight rows × zone columns, for consignments whose customer is in one country. */
export interface CollectionMatrix {
  /** e.g. "CZ → SK" */
  label: string;
  /** ISO 3166-1 alpha-2 of the customer's end */
  country: string;
  sheet: string;
  /** 1-based row of the zone headings */
  headerRow: number;
  firstDataRow: number;
  /** null reads to the end; empty rows are skipped */
  lastDataRow: number | null;
  /** The column with the heaviest weight (kg) a row is for */
  weightTo: ColumnLetter;
  /** The column with the largest volume (m³) a row is for, when the tariff counts a volume as that row's weight */
  volumeTo: ColumnLetter | null;
  zones: CollectionZone[];
}

/** Where the tariff's own postcode → region list is (zones by distance). */
export interface CollectionRegionTable {
  sheet: string;
  firstDataRow: number;
  lastDataRow: number | null;
  postcode: ColumnLetter;
  region: ColumnLetter;
  country: ColumnLetter | null;
  place: ColumnLetter | null;
  /** What the country column holds, as ISO codes, e.g. {"1": "CZ", "2": "SK"}; empty when it holds ISO codes */
  countryCodes: Record<string, string>;
  /** The country of the rows without one */
  defaultCountry: string;
}

/** Where the tariff's own region → region distances are (zones by distance). */
export interface CollectionDistanceTable {
  sheet: string;
  firstDataRow: number;
  lastDataRow: number | null;
  fromRegion: ColumnLetter;
  toRegion: ColumnLetter;
  km: ColumnLetter;
}

/** Where the tariff's postcode areas are (zones by postcode). */
export interface CollectionAreaTable {
  sheet: string;
  firstDataRow: number;
  lastDataRow: number | null;
  postcodeFrom: ColumnLetter;
  /** null: each row is one postcode, or a prefix such as "1xxxx" */
  postcodeTo: ColumnLetter | null;
  zone: ColumnLetter;
  country: ColumnLetter | null;
  defaultCountry: string;
}

/** oversize: for a piece longer than overLengthCm; percent: a % of the price; flat: an amount per consignment. */
export type CollectionSurchargeKind = "oversize" | "percent" | "flat";

export interface CollectionSurcharge {
  kind: CollectionSurchargeKind;
  label: string;
  /** oversize: added when the longest piece is longer than this, in cm */
  overLengthCm: number | null;
  /** oversize and percent: % of the table price */
  percent: number | null;
  /** flat: per consignment, in the tariff's currency */
  amount: number | null;
}

/** How a collections tariff's file is read: proposed by the AI (or remembered), corrected by the user. */
export interface CollectionLayout {
  /** A name for the tariff, e.g. "TOPTRANS – CZ / SK" */
  name: string;
  /** ISO 4217, e.g. "CZK" */
  currency: string;
  validFrom: string | null;
  validTo: string | null;
  zoneBy: CollectionZoneBy;
  matrices: CollectionMatrix[];
  /** kg one m³ counts as, when the tariff converts volume by a factor rather than by a volume column; null when it does neither */
  kgPerCbm: number | null;
  regions: CollectionRegionTable | null;
  distances: CollectionDistanceTable | null;
  /** By distance: km between two places of one region when the distance list has no such row */
  sameRegionKm: number | null;
  areas: CollectionAreaTable | null;
  surcharges: CollectionSurcharge[];
  /** What the prices include and the tariff's terms, one line each */
  conditions: string[];
  links: TariffLink[];
}

/** One weight row of a price table, as read from the sheet. */
export interface CollectionRateRow {
  /** Index of the table in layout.matrices */
  matrix: number;
  rowNo: number;
  weightToKg: number;
  volumeToCbm: number | null;
  /** By zone, in layout order; null where the row has no price */
  prices: (number | null)[];
}

/** A postcode of the tariff's region list. */
export interface CollectionRegionRow {
  rowNo: number;
  /** 5 digits */
  postcode: string;
  region: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  place: string;
}

export interface CollectionDistanceRow {
  fromRegion: string;
  toRegion: string;
  km: number;
}

/** A postcode area of the tariff and its zone. */
export interface CollectionAreaRow {
  rowNo: number;
  postcodeFrom: string;
  postcodeTo: string;
  zone: string;
  country: string;
}

/** Everything a collections tariff file holds, read by the layout. */
export interface CollectionData {
  rates: CollectionRateRow[];
  regions: CollectionRegionRow[];
  distances: CollectionDistanceRow[];
  areas: CollectionAreaRow[];
}

/** Our end of a collection or delivery for one freight mode: the hub the haulier collects to or delivers from. */
export interface CollectionHub {
  freightMode: CollectionFreightMode;
  /** 5 digits */
  postcode: string;
  country: string;
  /** e.g. "CFS Jeneč" */
  label: string;
}

/** A consignment as a collections tariff prices it. */
export interface CollectionConsignment {
  /** Real weight in kg; null when not known */
  weightKg: number | null;
  /** m³; null when not known */
  cbm: number | null;
  /** The longest side of the longest piece, in cm; null when not known */
  longestCm: number | null;
}

/** An amount added to a table price. */
export interface CollectionSurchargeLine {
  label: string;
  amount: number;
}

/** What one collections tariff asks for a consignment between two postcodes, and how it got there. */
export interface CollectionPrice {
  /** The table used, e.g. "CZ → SK" */
  matrixLabel: string;
  /** By distance: km between the two regions; null by postcode area */
  distanceKm: number | null;
  /** The zone column, e.g. "300 km", "Zone 2" */
  zoneLabel: string;
  /** What the weight band is for: the real weight, or the volume counted as weight */
  chargeableKg: number;
  chargeableBy: "weight" | "volume";
  /** e.g. "up to 150 kg" */
  bandLabel: string;
  price: number;
  surcharges: CollectionSurchargeLine[];
  total: number;
  currency: string;
}

/** A first / last mile haulier (a Customer Database company with the role) with its tariffs at a glance. */
export interface CollectionHaulierItem {
  customerId: string;
  companyName: string;
  ico: string;
  city: string;
  country: string;
  tariffCount: number;
  /** What its tariffs collect and deliver, all together */
  freightModes: CollectionFreightMode[];
  /** Versions that price today */
  activeCount: number;
  draftCount: number;
  /** The soonest end of an active version, YYYY-MM-DD; null when none ends */
  activeUntil: string | null;
}

export interface CollectionTariffItem {
  id: string;
  name: string;
  supplierCustomerId: string;
  freightModes: CollectionFreightMode[];
  /** Newest first */
  versions: SupplierTariffVersion[];
}

export interface CollectionTariffRef {
  id: string;
  name: string;
  supplierCustomerId: string;
  supplierName: string;
  freightModes: CollectionFreightMode[];
}

/** A price table as read, for showing it: its zones and weight rows. */
export interface CollectionTableView {
  label: string;
  country: string;
  zones: string[];
  rows: { rowNo: number; weightToKg: number; volumeToCbm: number | null; prices: (number | null)[] }[];
}

/** How many rows of each kind a collections version holds. */
export interface CollectionRowCounts {
  rates: number;
  regions: number;
  distances: number;
  areas: number;
}

export interface CollectionTariffVersionDetail extends SupplierTariffVersion {
  tariff: CollectionTariffRef;
  layout: CollectionLayout;
  findings: TariffFinding[];
  preview: SheetPreview[];
  counts: CollectionRowCounts;
  tables: CollectionTableView[];
}

/** One haulier's price for a consignment between our hub and the customer. */
export interface CollectionOffer extends CollectionPrice {
  versionId: string;
  versionNo: number;
  tariffId: string;
  tariffName: string;
  supplierCustomerId: string;
  supplierName: string;
  /** The version's last day; null when open */
  validTo: string | null;
  /** The places the tariff's own list names for our hub and the customer's postcode; empty by postcode area */
  hubPlace: string;
  customerPlace: string;
}

/** What one version asks between two postcodes, or why it cannot price the consignment. */
export interface CollectionTry {
  price: CollectionPrice | null;
  /** Why there is no price, in words; null when there is one */
  problem: string | null;
  hubPlace: string;
  customerPlace: string;
}

// ── Ocean: shipping lines' tariffs (Tariffs → Shipping Lines) ──

/** The containers an ocean tariff prices: dry 20', 40' and 40' high cube; reefer 20' and 40' high cube. */
export type OceanEquipment = "20DC" | "40DC" | "40HC" | "20RF" | "40RF";

/** A price column of a rate table and the container it is for. */
export interface OceanPriceColumn {
  column: ColumnLetter;
  equipment: OceanEquipment;
  /** As the tariff heads it, e.g. "20' Box", "40' HQ", "Rate 40RQ" */
  label: string;
}

/** A table of rates: rows of port of loading → port of discharge (via a transshipment port) with a price per container. */
export interface OceanTable {
  /** e.g. "Far East direct calls", "Far East wing ports", "Reefer Far East" */
  label: string;
  sheet: string;
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number | null;
  /** The column with the port(s) of loading; null when every row has the same ones (polFixed) */
  pol: ColumnLetter | null;
  /** The ports of loading of every row when there is no column, as written, e.g. "Koper; Trieste" */
  polFixed: string | null;
  pod: ColumnLetter;
  /** The column with the transshipment port(s) */
  via: ColumnLetter | null;
  /** The column with each row's currency; null when every row has the same (currencyFixed) */
  currency: ColumnLetter | null;
  currencyFixed: string | null;
  prices: OceanPriceColumn[];
  /** A column with remarks, e.g. "No DG acceptance" */
  note: ColumnLetter | null;
  /** ISO codes of the countries the table's ports of discharge are in, to tell ports of one name apart; empty when any */
  podCountries: string[];
}

/** per TEU (a 40' counts 2), per container, per bill of lading, per booking. */
export type OceanSurchargeBasis = "teu" | "container" | "bl" | "booking";

/** always; only for dangerous goods; only for a booking or B/L made by hand (not electronically). */
export type OceanSurchargeCondition = "always" | "dangerous" | "manual_booking";

/** The quote charge a surcharge goes on: BAF, AMS, B/L fee, or another named after it. */
export type OceanSurchargeCharge = "fcl_baf" | "ams_ens" | "fcl_documentation" | "other";

/** A surcharge rule of the tariff, as the AI reads it from the text under a rate sheet. */
export interface OceanSurcharge {
  /** As the tariff names it, e.g. "EBS Emergency Bunker Surcharge" */
  name: string;
  /** Its short code, e.g. "EBS" */
  code: string;
  amount: number;
  currency: string;
  basis: OceanSurchargeBasis;
  /** Only for dry or reefer containers; empty for both */
  equipment: ("dry" | "reefer")[];
  /** The tables (by index) it is added to; empty for all */
  tables: number[];
  /** Only to / from ports of discharge in these countries (ISO); empty for any */
  countries: string[];
  exceptCountries: string[];
  /** Only for these ports of discharge (UN/LOCODE); empty for any */
  ports: string[];
  exceptPorts: string[];
  condition: OceanSurchargeCondition;
  charge: OceanSurchargeCharge;
}

/** How a shipping line's tariff file is read: proposed by the AI (or remembered), corrected by the user. */
export interface OceanLayout {
  /** A name for the tariff, e.g. "OOCL Export FAK – Far East, India, Australia, Intra Europe, Africa" */
  name: string;
  validFrom: string | null;
  validTo: string | null;
  tables: OceanTable[];
  /** What short codes and names of ports in the file stand for, as UN/LOCODEs, e.g. {"HAM": "DEHAM", "Koper": "SIKOP"} */
  portCodes: Record<string, string>;
  surcharges: OceanSurcharge[];
  /** What the rates include and the tariff's terms, one line each */
  conditions: string[];
  links: TariffLink[];
}

/** One port of loading → port of discharge of a rate row, its ports as the tariff writes them. */
export interface OceanRateRow {
  /** Index of its table in layout.tables */
  table: number;
  rowNo: number;
  polName: string;
  podName: string;
  /** Transshipment port(s), as written */
  via: string;
  currency: string;
  /** Per container, by equipment; a container without a price is left out */
  prices: Partial<Record<OceanEquipment, number>>;
  note: string;
}

/** matched by code: by the tariff's port codes or the place list; manual: picked by a user; skipped: left out by a user; pending: not matched yet. */
export type OceanPortStatus = "matched" | "manual" | "skipped" | "pending";

export interface OceanPlace {
  code: string;
  name: string;
  countryCode: string;
  subdivisionName: string | null;
}

/** A port name of the tariff and the UN/LOCODE it means. */
export interface OceanPort {
  side: "pol" | "pod";
  /** As the tariff writes it, cleaned of remarks */
  name: string;
  /** The country the tariff names with it, ISO; null when none */
  countryHint: string | null;
  code: string | null;
  status: OceanPortStatus;
  /** The places it could be, when it is not matched */
  candidates: OceanPlace[];
}

/** Everything a shipping line's tariff file holds, read by the layout. */
export interface OceanData {
  rates: OceanRateRow[];
  ports: OceanPort[];
}

/** A quote's containers of one type, as ocean offers are asked for. */
export interface OceanOfferContainer {
  /** As quotes name it, e.g. "40' HC" */
  type: string;
  qty: number;
}

/** One container line of an offer. */
export interface OceanOfferLine {
  /** As the quote names it, e.g. "40' HC" */
  type: string;
  qty: number;
  equipment: OceanEquipment;
  /** Per container */
  price: number;
  amount: number;
}

/** A surcharge of an offer, worked out for the quote's containers. */
export interface OceanOfferSurcharge {
  name: string;
  code: string;
  charge: OceanSurchargeCharge;
  basis: OceanSurchargeBasis;
  /** How many of the basis: TEU, containers, or 1 per B/L or booking */
  units: number;
  /** Per unit */
  rate: number;
  total: number;
  currency: string;
}

/** One way a shipping line takes the quote's containers from port to port, with its freight and surcharges. */
export interface OceanOffer {
  rateId: string;
  versionId: string;
  versionNo: number;
  tariffId: string;
  tariffName: string;
  supplierCustomerId: string;
  supplierName: string;
  /** The version's last day; null when open */
  validTo: string | null;
  tableLabel: string;
  polCode: string;
  polName: string;
  podCode: string;
  podName: string;
  /** Transshipment port(s); empty for a direct call */
  via: string;
  note: string;
  /** The freight's currency */
  currency: string;
  lines: OceanOfferLine[];
  freight: number;
  surcharges: OceanOfferSurcharge[];
  /** Freight and surcharges added up per currency */
  totals: { currency: string; amount: number }[];
}
