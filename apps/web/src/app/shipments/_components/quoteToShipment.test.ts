import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { quoteToCreateRequest, shipmentToQuoteData } from "./quoteToShipment";

const NO_RATES = {} as ExchangeRates;

describe("quote → shipment ports", () => {
  it("takes the quote's POL and POD", () => {
    const req = quoteToCreateRequest("QCZ1", { origin: "Praha (CZPRG)", destination: "Tokyo (JPTYO)", pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" }, NO_RATES);
    expect(req).toMatchObject({ pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" });
  });

  it("falls back to origin and destination for a quote without ports", () => {
    const req = quoteToCreateRequest("QCZ1", { origin: "Praha (CZPRG)", destination: "Hamburg (DEHAM)" }, NO_RATES);
    expect(req).toMatchObject({ pol: "Praha (CZPRG)", pod: "Hamburg (DEHAM)" });
  });

  it("copies a shipment's POL and POD back into a quote", () => {
    const data = shipmentToQuoteData({ pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" } as interfaces.ShipmentItem);
    expect(data).toMatchObject({ pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" });
  });
});
