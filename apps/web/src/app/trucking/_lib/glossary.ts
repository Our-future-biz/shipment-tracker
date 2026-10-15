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
  { term: TERMS.internalTariff, meaning: "The prices Trucking charges Operations for transport it runs for their shipments.", replaces: "interní ceník" },
  {
    term: TERMS.internalCharge,
    meaning: "What Trucking bills Operations for the month: every consignment it carried for their shipments, priced from the internal tariff.",
    replaces: "interní přefakturace",
  },
  { term: TERMS.avizace, meaning: "Agreeing the delivery time with the consignee before the delivery run (by phone, e-mail or their booking portal).", replaces: "avízo, avizování" },
  { term: TERMS.cmr, meaning: "The road consignment note that travels with the goods; the consignee signs it on delivery.", replaces: "nákladní list, CMR list" },
  { term: TERMS.pod, meaning: "Proof of delivery: the signed CMR or delivery note (or its photo) that shows who took the goods, when and in what state.", replaces: "doručenka, potvrzení o doručení" },
  { term: TERMS.adr, meaning: "Dangerous goods by road under the ADR agreement: the consignment needs a trained driver, equipped truck and the right papers.", replaces: "nebezpečné věci" },
  { term: TERMS.b2cDelivery, meaning: "Delivery to a private person rather than a company: avizace, a time window and often carrying in or a tail-lift.", replaces: "doručení soukromé osobě" },
  { term: TERMS.waitingTime, meaning: "Time a truck waits at loading or unloading beyond the agreed free time; the haulier may charge it and we may pass it on.", replaces: "zdržné, stojné" },
  { term: TERMS.tailLift, meaning: "A lifting platform at the back of the truck, for addresses without a loading ramp.", replaces: "hydraulické čelo" },
];
