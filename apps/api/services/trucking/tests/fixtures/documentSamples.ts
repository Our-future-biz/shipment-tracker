import type { CmrDoc, DocParty, DocStop, TransportOrderDoc } from "../../lib/documentTypes";

// Rich sample documents for the PDF tests: Czech characters, ADR, long notes and terms.

const longNote =
  "Vjezd přes bránu č. 3, ohlásit se na vrátnici. Řidič musí mít reflexní vestu, helmu a bezpečnostní obuv. " +
  "Nakládka pouze boční, rampa není k dispozici. Příliš žluťoučký kůň úpěl ďábelské ódy. ".repeat(4);

const ours: DocParty = {
  name: "Příliš žluťoučký kůň Logistics s.r.o.",
  street: "Řeznická 12",
  postcode: "110 00",
  city: "Praha 1",
  country: "CZ",
  ico: "12345679",
  dic: "CZ12345679",
  contact: "Dispečink: Eva Dvořáková, +420 222 333 444, doprava@example.cz",
};

const haulier: DocParty = {
  name: "Šťastný Transport a.s.",
  street: "Údolní 1522/53",
  postcode: "602 00",
  city: "Brno",
  country: "CZ",
  ico: "27082440",
  dic: "CZ27082440",
  contact: "Petr Šťastný, +420 777 123 456",
};

const pickup: DocStop = {
  name: "Sklad Kladno – Žižkova",
  street: "Žižkova 845",
  postcode: "272 01",
  city: "Kladno",
  country: "CZ",
  windowText: "16. 10. 2026, 08:00–12:00",
  contact: "Josef Čermák, +420 603 111 222",
  reference: "NAK-77812",
  notes: longNote,
  avizaceRequired: true,
};

const delivery: DocStop = {
  name: "Odběratel Ostrava, s.r.o.",
  street: "Mostní 1",
  postcode: "702 00",
  city: "Ostrava",
  country: "CZ",
  windowText: "17. 10. 2026, 06:00–14:00",
  contact: "Příjem zboží, +420 596 000 111",
  reference: "PO-45/2026",
  notes: "Vykládka zadem, paletový vozík k dispozici.",
  avizaceRequired: false,
};

export const sampleTransportOrder: TransportOrderDoc = {
  language: "both",
  orderNumber: "LCZ2026000001",
  issuedAt: "2026-10-15T08:30:00.000Z",
  ourCompany: ours,
  haulier,
  consignmentRef: "TCZ2026000001",
  jobNumber: "CZ00000042",
  plannedPickupDate: "2026-10-16",
  pickup,
  delivery,
  load: {
    pieces: 33,
    palletPlaces: 33,
    ldm: 13.6,
    weightKg: 1250.5,
    cbm: 42.125,
    description: "Barvy a laky v plechovkách na EUR paletách, fóliováno",
    nonStackable: true,
    tailLift: true,
    adr: { un: "1263", className: "3", packingGroup: "II" },
  },
  vehicleText: "Plachta 13,6 m, hydraulické čelo",
  plates: "1AB2345 / 2CD6789",
  driver: "Jan Novák, +420 608 765 432",
  agreedPrice: { total: 12500, currency: "CZK", note: "Včetně mýta a palivového příplatku." },
  paymentTerms: "30 dní od doručení faktury s originálem POD",
  pickupPin: "482913",
  podLink: "https://tracker.example.cz/trucking/pod/LCZ2026000001?token=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  terms: Array.from(
    { length: 9 },
    (_, i) =>
      `Podmínka ${i + 1}: Přeprava se řídí Všeobecnými podmínkami SSL ve znění platném ke dni vystavení příkazu. ` +
      "Dopravce odpovídá za škodu na zásilce od převzetí do vydání příjemci; náklad nesmí být překládán bez souhlasu zasílatele.",
  ),
};

export const sampleCmr: CmrDoc = {
  language: "both",
  consignmentRef: "TCZ2026000001",
  jobNumber: "CZ00000042",
  issuedAt: "2026-10-15T08:30:00.000Z",
  sender: { ...ours, name: "Odesílatel Kladno, s.r.o.", city: "Kladno" },
  consignee: { ...haulier, name: "Odběratel Ostrava, s.r.o.", city: "Ostrava", postcode: "702 00", street: "Mostní 1" },
  carrier: haulier,
  placeOfTakingOver: pickup,
  placeOfDelivery: delivery,
  load: sampleTransportOrder.load,
  documentsAttached: "Dodací list č. 2026/1187, bezpečnostní list (ADR)",
  instructions: "Neklopit. Chránit před mrazem a přímým sluncem. Při vykládce volat příjem zboží 30 minut předem.",
  plates: "1AB2345 / 2CD6789",
};
