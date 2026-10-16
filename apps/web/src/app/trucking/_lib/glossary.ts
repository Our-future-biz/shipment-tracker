// One set of words for the Trucking module: screens, transport orders, Read me and exports.
// English in the UI; the Czech words people use today are listed under "Instead of" so everyone
// finds the term they know.

export const TERMS = {
  consignment: "Consignment",
  trip: "Trip",
  lineHaul: "Line haul",
  pickupRun: "Pick-up run",
  deliveryRun: "Delivery run",
  ltl: "LTL",
  ftl: "FTL",
  haulier: "Haulier",
  transportOrder: "Transport order",
  serviceLevel: "Service level",
  zone: "Zone",
  palletPlaces: "Pallet places",
  ldm: "LDM",
  chargeableWeight: "Chargeable weight",
  buyTariff: "Buy tariff",
  sellTariff: "Sell tariff",
  internalTariff: "Internal tariff",
  internalCharge: "Internal charge",
  avizace: "Avizace",
  cmr: "CMR",
  pod: "POD",
  adr: "ADR",
  b2cDelivery: "B2C delivery",
  waitingTime: "Waiting time",
  tailLift: "Tail-lift",
  vehicleType: "Vehicle type",
  cutoff: "Cut-off",
  marginFloor: "Margin floor",
  preferredLane: "Preferred lane",
  liabilityInsurance: "Carrier liability insurance",
  transportLicence: "Transport licence",
  unreliableVatPayer: "Unreliable VAT payer",
  costSplit: "Cost split",
  tariffVersion: "Tariff version",
  standardList: "Standard list",
  fuelIndex: "Fuel index",
  minimumCharge: "Minimum charge",
  template: "Template",
  draftVersion: "Draft version",
  override: "Override",
  marginApproval: "Margin floor approval",
  stamp: "Stamp",
  pickupPin: "Pick-up PIN",
  recordedOnly: "Recorded only",
  haulierLink: "Haulier link",
  leg: "Leg",
  hub: "Hub",
  partnerNetwork: "Partner network",
  manifest: "Manifest",
  fill: "Fill",
  avizaceRecord: "Avizace record",
  exceptionDecision: "Exception decision",
  haulierInvoice: "Haulier invoice",
  exactMatch: "Exact match",
  vatBankAccountCheck: "VAT bank-account check",
  internalStatement: "Internal statement",
  monthClose: "Month close",
  onTime: "On time",
  firstAttempt: "First attempt",
  daysToPod: "Days to POD",
  coverageGap: "Coverage gap",
  departmentResult: "Department result",
  haulierPortal: "Haulier portal",
  portalUser: "Portal user",
  invitationLink: "Invitation link",
  partnerDelivery: "Partner delivery",
  gateIn: "Gate-in",
  readyToBill: "Ready to bill",
  exception: "Exception",
  scope: "Scope",
  domesticOrder: "Domestic order",
  planTrip: "Plan trip",
  newTrip: "New trip",
} as const;

// What each term means, for the glossary in the Read me.
export const GLOSSARY: { term: string; meaning: string; replaces?: string }[] = [
  {
    term: TERMS.consignment,
    meaning: "One lot of goods we carry for a customer from one pick-up address to one delivery address, with its pieces, weight, pallet places and service level. It may belong to a shipment.",
    replaces: "zásilka",
  },
  {
    term: TERMS.trip,
    meaning: "One truck on one route on one day: a pick-up run, a line haul or a delivery run, with its driver or haulier and the consignments it carries.",
    replaces: "jízda",
  },
  { term: TERMS.lineHaul, meaning: "A trip between two depots or warehouses that moves many consignments at once, without stops at customers.", replaces: "linehaul, meziskladová přeprava" },
  { term: TERMS.pickupRun, meaning: "A trip that collects consignments from customers and brings them to our warehouse.", replaces: "svoz" },
  { term: TERMS.deliveryRun, meaning: "A trip that takes consignments from our warehouse to the consignees.", replaces: "rozvoz" },
  {
    term: TERMS.ltl,
    meaning: "Less than truckload: a consignment that shares the truck with others and goes through our warehouse (pick-up run, gate-in, delivery run).",
    replaces: "sběrná služba, kusová zásilka",
  },
  { term: TERMS.ftl, meaning: "Full truckload: one customer's consignment fills (or books) the whole truck and goes straight from pick-up to delivery.", replaces: "celovozová přeprava, kompletní vozová zásilka" },
  { term: TERMS.haulier, meaning: "A transport company we hire to run a trip for us, with its trucks, drivers, insurance and buy tariff.", replaces: "dopravce, subdodavatel" },
  {
    term: TERMS.transportOrder,
    meaning: "The order we send a haulier for a trip: route, dates, consignments, agreed price and conditions. The haulier confirms it.",
    replaces: "přepravní příkaz, objednávka přepravy",
  },
  {
    term: TERMS.serviceLevel,
    meaning:
      "When a consignment is due. +1 … +4: delivered that many working days after the start — for LTL the gate-in confirmed by the warehouse, for FTL the planned pick-up. Express: same day, by 10:00, by 12:00 or on a fixed date. Weekends and public holidays are not working days.",
    replaces: "doba přepravy, typ služby",
  },
  { term: TERMS.zone, meaning: "The price area of an address, read from its postcode (PSČ). Tariffs price a consignment by the zones of its pick-up and delivery.", replaces: "pásmo" },
  { term: TERMS.palletPlaces, meaning: "How many standard pallet footprints (EUR pallet, 120 × 80 cm) a consignment takes on the truck floor, stacked or not.", replaces: "paletová místa, PM" },
  { term: TERMS.ldm, meaning: "Loading metres: how much of the truck floor's length a consignment takes, across the full width (a full trailer is 13.6 LDM).", replaces: "ložné metry" },
  {
    term: TERMS.chargeableWeight,
    meaning: "The weight a consignment is priced at: the higher of its real weight and the weight its pallet places or loading metres count for under the tariff.",
    replaces: "fakturační hmotnost",
  },
  { term: TERMS.buyTariff, meaning: "What a haulier charges us, by zone, weight, pallet places or trip.", replaces: "nákupní ceník" },
  { term: TERMS.sellTariff, meaning: "What we charge a customer for carrying a consignment, by zone and chargeable weight, with surcharges.", replaces: "prodejní ceník" },
  { term: TERMS.internalTariff, meaning: "The prices Trucking charges another department for transport it runs for their jobs.", replaces: "interní ceník" },
  {
    term: TERMS.internalCharge,
    meaning:
      "What Trucking charges another department for one consignment it carried for their job, priced from the internal tariff and counted in the month of delivery (Prague). No customer selling line and no haulier cost go to such a job — only this one internal line. Unpriced (no valid internal tariff) it stays at 0 as \"Not priced\" until fixed.",
    replaces: "interní přefakturace",
  },
  { term: TERMS.avizace, meaning: "Agreeing the delivery time with the consignee before the delivery run (by phone, e-mail or their booking portal).", replaces: "avízo, avizování" },
  { term: TERMS.cmr, meaning: "The road consignment note that travels with the goods; the consignee signs it on delivery.", replaces: "nákladní list, CMR list" },
  { term: TERMS.pod, meaning: "Proof of delivery: the signed CMR or delivery note (or its photo) that shows who took the goods, when and in what state.", replaces: "doručenka, potvrzení o doručení" },
  { term: TERMS.adr, meaning: "Dangerous goods by road under the ADR agreement: the consignment needs a trained driver, equipped truck and the right papers.", replaces: "nebezpečné věci" },
  { term: TERMS.b2cDelivery, meaning: "Delivery to a private person rather than a company: avizace, a time window and often carrying in or a tail-lift.", replaces: "doručení soukromé osobě" },
  { term: TERMS.waitingTime, meaning: "Time a truck waits at loading or unloading beyond the agreed free time; the haulier may charge it and we may pass it on.", replaces: "zdržné, stojné" },
  { term: TERMS.tailLift, meaning: "A lifting platform at the back of the truck, for addresses without a loading ramp.", replaces: "hydraulické čelo" },
  {
    term: TERMS.vehicleType,
    meaning: "A kind of truck a haulier can send, with its loading metres, payload, pallet places and whether it has a tail-lift. Kept in Trucking settings.",
    replaces: "typ vozidla, druh nástavby",
  },
  { term: TERMS.cutoff, meaning: "The latest time (Prague) an order can come in and still count from that day for its service level.", replaces: "uzávěrka objednávek" },
  { term: TERMS.marginFloor, meaning: "The lowest margin we accept on a price, as a percentage and a minimum amount in CZK; a price below both is flagged.", replaces: "minimální marže" },
  {
    term: TERMS.preferredLane,
    meaning: "A route a haulier likes to run, as a range of pick-up postcodes to a range of delivery postcodes; planning offers that haulier first there.",
    replaces: "preferovaná relace",
  },
  {
    term: TERMS.liabilityInsurance,
    meaning:
      "The haulier's insurance for damage to or loss of the goods it carries, up to its limit (\"carrier liability insurance\" is the industry term; under CMR it covers the haulier's liability for the goods). Without a valid one the haulier is blocked.",
    replaces: "pojištění odpovědnosti dopravce",
  },
  {
    term: TERMS.transportLicence,
    meaning: "The haulier's licence to carry goods by road for others; in the Czech Republic usually issued without an end date.",
    replaces: "koncese, živnostenské oprávnění",
  },
  {
    term: TERMS.unreliableVatPayer,
    meaning: "A company the tax office lists as not paying its VAT; we would be liable for it, so such a haulier is blocked.",
    replaces: "nespolehlivý plátce DPH",
  },
  {
    term: TERMS.costSplit,
    meaning: "How a haulier's price for a whole trip is shared across the consignments on it: by chargeable weight, LDM or pallet places.",
    replaces: "rozpočítání nákladů",
  },
  {
    term: TERMS.tariffVersion,
    meaning:
      "One dated set of prices of a tariff: zones, bands, rates per service level, minimum charges and surcharges. A draft is checked and then activated from a date; the version it replaces ends the day before.",
    replaces: "verze ceníku, platnost ceníku",
  },
  {
    term: TERMS.standardList,
    meaning: "The sell tariff for every customer without one of their own. A customer's tariff can also be a percentage off (or on top of) the Standard list.",
    replaces: "standardní ceník, základní ceník",
  },
  {
    term: TERMS.fuelIndex,
    meaning: "The fuel surcharge percentage of each month, kept in Trucking settings; a tariff's fuel surcharge can follow it.",
    replaces: "palivový příplatek, palivová doložka",
  },
  {
    term: TERMS.minimumCharge,
    meaning: "The lowest freight price of a zone and service level, whatever the chargeable weight.",
    replaces: "minimální cena, minimum za zásilku",
  },
  {
    term: TERMS.template,
    meaning:
      "The Excel file a tariff version is typed in and uploaded from: Read me, Meta, Zones, one sheet per service level and Surcharges. Downloaded from the tariff page, empty or as the current version.",
    replaces: "šablona ceníku",
  },
  {
    term: TERMS.draftVersion,
    meaning:
      "A tariff version that is saved and checked but never activated, so nothing is priced with it. Every upload becomes one; it is activated from a date, kept for later or discarded.",
    replaces: "koncept ceníku, rozpracovaný ceník",
  },
  {
    term: TERMS.override,
    meaning:
      "A quote line priced from a tariff whose amount or currency was changed by hand afterwards. The line keeps its \"Tariff vN\" tag and gets an \"Override\" tag, so everyone sees the price is not the tariff's.",
    replaces: "ruční úprava ceny, přepsaná cena",
  },
  {
    term: TERMS.marginApproval,
    meaning:
      "A manager's approval, with a reason, of a road quote whose margin is below the margin floor. Without it the quote cannot be marked Ready to send or sent. It covers the approved margin or a better one; a worse margin needs a new approval.",
    replaces: "schválení marže, výjimka z minimální marže",
  },
  {
    term: TERMS.stamp,
    meaning:
      "A step of a consignment recorded with its time and who did it: Confirmed, Picked up, Delivered, POD received. Each is stamped once, in order, now or up to 7 days back; a manager may void one with a reason, and the history keeps both.",
    replaces: "potvrzení kroku, odpis",
  },
  {
    term: TERMS.pickupPin,
    meaning:
      "The code the driver gives at pick-up, made in Shipments (Warehouse → Pick-up) and shown there only once. To print it on a transport order it is typed into the Print / Record as sent dialog; it is printed and never stored or logged (the history says only \"PIN printed\").",
    replaces: "PIN pro vyzvednutí, výdejní kód",
  },
  {
    term: TERMS.recordedOnly,
    meaning: "E-mail sending is off in this app: \"Record as sent…\" records that the transport order went out and downloads its PDF; nothing is e-mailed — the user sends it to the haulier.",
    replaces: "jen zaznamenáno, odesláno ručně",
  },
  {
    term: TERMS.haulierLink,
    meaning:
      "The link printed on a transport order recorded as sent. Without signing in, the haulier opens the order (no customer prices, only the agreed price), confirms or rejects it once and uploads the POD. It is valid 30 days after the planned pick-up; recording the order as sent again renews it.",
    replaces: "odkaz pro dopravce",
  },
  {
    term: TERMS.leg,
    meaning:
      "One part of an LTL consignment's road: the pick-up (customer → our warehouse), the line haul (our warehouse → a partner's depot) and the delivery (→ consignee). Each leg rides on one trip, except a partner delivery, which the partner prices per consignment.",
    replaces: "úsek, etapa přepravy",
  },
  {
    term: TERMS.hub,
    meaning: "Our warehouse: every LTL consignment passes it and its Gate Log. The gate-in the warehouse confirms there starts the service-level clock. Its address is set in Trucking settings.",
    replaces: "náš sklad, překladiště, hub",
  },
  {
    term: TERMS.partnerNetwork,
    meaning:
      "Partner hauliers who deliver our LTL consignments in their region (the last mile). A partner is paid per consignment from its buy tariff (scope LTL) or at an agreed price; a line haul takes the goods to its depot unless it collects at our warehouse.",
    replaces: "partnerská síť, partnerský rozvoz",
  },
  {
    term: TERMS.manifest,
    meaning: "The loading list of a trip: every consignment on it in stop order with pieces, pallet places, LDM, weight and ADR, against the truck's capacity. Printed for the driver and the warehouse.",
    replaces: "nakládací list, manifest",
  },
  {
    term: TERMS.fill,
    meaning:
      "How full a trip's truck is: its loading metres (LDM) and weight against the capacity of its vehicle type. The fuller of the two sets the colour — amber from 90 %, red over 100 %. Over capacity is a warning, never a block. In Reports, the line-haul fill is the average of the fuller of the two over the LTL line hauls and delivery runs that left in the period.",
    replaces: "vytížení, naložení vozu",
  },
  {
    term: TERMS.avizaceRecord,
    meaning:
      "How the delivery was agreed with the consignee: channel (phone, e-mail, SMS, other), who was reached, the agreed window and a note, with who recorded it and when. The app prepares the text to copy (Czech and English, never the Pick-up PIN) and sends nothing. Needed for B2C and for stops that ask for it; until recorded, the delivery run or FTL trip shows a warning — never a block.",
    replaces: "záznam avizace, avízo",
  },
  {
    term: TERMS.exceptionDecision,
    meaning:
      "Who bears a delivery exception (failed delivery, damage, shortage, waiting time …): charge the customer (a selling line on the job, or the internal charge), claim from the haulier (taken off its expected cost) or absorb it. Charging, claiming or absorbing a cost above 0 is a manager's call; absorbing at no cost anyone may decide. An open exception keeps its consignment from Ready to bill until it is decided and closed.",
    replaces: "rozhodnutí o reklamaci, škodní událost",
  },
  {
    term: TERMS.haulierInvoice,
    meaning: "The invoice a haulier sends us, entered with its lines: which trips and partner deliveries it bills and at what amount, against what each should cost (its buy price minus our claims).",
    replaces: "přijatá faktura dopravce",
  },
  {
    term: TERMS.exactMatch,
    meaning: "The only tolerance for haulier invoices: every line and the net total equal the expected cost to the cent. Then it is approved by itself; any difference waits for a manager's approval with a reason, or is rejected.",
    replaces: "přesná shoda",
  },
  {
    term: TERMS.vatBankAccountCheck,
    meaning:
      "Before paying a haulier: it must not be an unreliable VAT payer, its bank account must be published in the VAT register, and the invoice's account must be one of its published accounts (kept by hand on the haulier page). Otherwise we are liable for its VAT (ručení za DPH), so the invoice is blocked for everyone — a manager cannot override it.",
    replaces: "kontrola zveřejněného účtu, ručení za DPH",
  },
  {
    term: TERMS.internalStatement,
    meaning: "The monthly statement of internal charges to one department, numbered ICZ + year + four digits, without VAT and never in customer aging. Made when the month is closed, as a PDF in Czech and English.",
    replaces: "interní vyúčtování",
  },
  {
    term: TERMS.monthClose,
    meaning:
      "A manager closes a finished month of internal charges once every charge is priced: one internal statement per department is made and the jobs' internal lines get its number. A closed month never changes; a later correction goes into the next open month as an adjustment.",
    replaces: "uzávěrka měsíce",
  },
  {
    term: TERMS.onTime,
    meaning:
      "A delivered consignment is on time when its delivered day (Prague) is on or before its promised date — for LTL the date counted from the gate-in, for FTL from the planned pick-up. A failed delivery caused by the customer is left out, and so is a consignment without a promised date (the report says how many).",
    replaces: "včasné doručení, dodržení termínu",
  },
  {
    term: TERMS.firstAttempt,
    meaning: "A delivered consignment delivered at the first try: it has no failed-delivery exception. Shown as the share of all delivered consignments, with the failed reasons counted.",
    replaces: "doručení na první pokus",
  },
  {
    term: TERMS.daysToPod,
    meaning:
      "Working days from delivery to the POD received, on average over the period's delivered consignments (with the P90). Weekends and public holidays do not count. POD missing counts, as of now, the consignments delivered more than 2 working days ago without a POD.",
    replaces: "doba dodání doručenky",
  },
  {
    term: TERMS.coverageGap,
    meaning:
      "A lane someone asked a price for — in the rate calculator, a quote or a consignment — that no tariff could price (no zone, no band, no service level …). Each is counted with the last time it was asked, so the missing tariffs can be added. Test lanes are not counted.",
    replaces: "chybějící ceník, nepokrytá trasa",
  },
  {
    term: TERMS.departmentResult,
    meaning:
      "What the Trucking department earned in the period: the sell of Road consignments delivered, plus the internal charges to other departments, minus all haulier cost of the consignments delivered (Road and internal). In CZK.",
    replaces: "hospodářský výsledek oddělení",
  },
  {
    term: TERMS.haulierPortal,
    meaning:
      "The haulier's own pages at /haulier/portal, outside the app: its staff sign in with their e-mail and password and see only the trips and partner deliveries given to their haulier (no customer prices, no other hauliers). They confirm or reject orders, stamp Picked up, Departed and Arrived, mark each stop delivered with its POD and download the transport order (without the PIN). Every action is in the history as the haulier's.",
    replaces: "portál dopravce, dopravní portál",
  },
  {
    term: TERMS.portalUser,
    meaning:
      "A person at a haulier who signs in to the haulier portal. Not an app user: a manager adds one on the haulier page and can reset its password or disable it (with a reason). Five wrong passwords lock it for 15 minutes; a blocked haulier's users cannot get in.",
    replaces: "uživatel dopravce, přístup dopravce",
  },
  {
    term: TERMS.invitationLink,
    meaning:
      "The one-time link a manager gets when adding a portal user or resetting its password, to send on by hand (e-mail sending is off). It is shown once and never again, works once and is valid 72 hours; the user sets a password of at least 12 characters with it.",
    replaces: "pozvánka, odkaz pro nastavení hesla",
  },
  {
    term: TERMS.partnerDelivery,
    meaning:
      "The last leg of an LTL consignment run by a partner of our partner network instead of our own delivery run: the partner collects it at our warehouse or its depot and delivers it, paid per consignment from its buy tariff or at an agreed price. A haulier invoice bills it like a trip.",
    replaces: "partnerský rozvoz, doručení partnerem",
  },
  {
    term: TERMS.gateIn,
    meaning:
      "The stamp in the warehouse's Gate Log when an LTL consignment arrives at our warehouse. Only the warehouse stamps it; it moves the consignment to At our warehouse and starts its service-level clock.",
    replaces: "příjezd do skladu, gate-in",
  },
  {
    term: TERMS.readyToBill,
    meaning: "Every consignment of the job has its POD and no open exception: Trucking moves the job to Billing in Shipments, and the consignment is no longer edited.",
    replaces: "k fakturaci",
  },
  {
    term: TERMS.exception,
    meaning:
      "Something that went wrong on a delivery — failed delivery, damage, shortage, waiting time … — raised on the consignment with its cost. It stays open until someone decides who bears it (see Exception decision) and closes it.",
    replaces: "reklamace, škodní událost, mimořádnost",
  },
  {
    term: TERMS.scope,
    meaning: "What a tariff or haulier price covers: LTL (groupage through our warehouse), FTL (a whole truck, direct) or line haul (between our warehouse and a depot).",
    replaces: "rozsah, druh přepravy",
  },
  {
    term: TERMS.domesticOrder,
    meaning:
      "A consignment booked without an existing job — for a customer who buys only domestic road transport. Trucking creates its Road job in Shipments when it is booked.",
    replaces: "tuzemská objednávka, vnitrostátní přeprava",
  },
  {
    term: TERMS.planTrip,
    meaning: "The step on an FTL consignment that orders its one truck: a haulier from the buy tariffs (or at an agreed price) and the trip that carries it.",
    replaces: "naplánovat jízdu, objednat auto",
  },
  {
    term: TERMS.newTrip,
    meaning: "On the Planning tab: an LTL pick-up run, line haul or delivery run made from the ticked legs of the day, with its haulier and vehicle. More legs go on it later.",
    replaces: "nová jízda, nový svoz / rozvoz",
  },
];
