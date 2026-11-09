import { describe, expect, it } from "vitest";
import { fclProfitGateMessage } from "../../utils/fclProfit.utils";

const line = (containerType: string, unitPrice: number, more: Record<string, unknown> = {}) => ({ basis: "container", containerType, unitPrice, amount: unitPrice, currency: "EUR", ...more });
const quote = (buyingLines: unknown[], sellingLines: unknown[], more: Record<string, unknown> = {}) => ({
  serviceType: "Sea FCL",
  containers: [{ type: "20' DC", qty: 2 }, { type: "40' DC", qty: 1 }],
  buyingLines,
  sellingLines,
  ...more,
});
const buying = [line("20' DC", 1000), line("40' DC", 1500)];
const rates = { today: "2026-11-09", rates: { USD: 20, EUR: 25 }, roePct: 100 };

describe("fclProfitGateMessage", () => {
  it("lets a quote with a profit on every container type go", () => {
    expect(fclProfitGateMessage(quote(buying, [line("20' DC", 1100), line("40' DC", 1501)]))).toBeNull();
  });

  it("names the type without a profit", () => {
    expect(fclProfitGateMessage(quote(buying, [line("20' DC", 1100), line("40' DC", 1500)]))).toMatch(/^No profit on 40' DC yet/);
  });

  it("names every type without one: at a loss, or with no charge at all", () => {
    expect(fclProfitGateMessage(quote([line("20' DC", 1000)], [line("20' DC", 900)]))).toMatch(/^No profit on 20' DC, 40' DC yet/);
  });

  it("does not take the charges per shipment or the trucking lines for a profit on a container", () => {
    const perShipment = [{ basis: "lumpsum", amount: 500, currency: "EUR" }];
    expect(fclProfitGateMessage(quote(buying, [...buying, ...perShipment]))).toMatch(/20' DC, 40' DC/);
    const trucking = line("20' DC", 300, { tariffRef: "trucking:v1:std" });
    expect(fclProfitGateMessage(quote(buying, [...buying, trucking]))).toMatch(/20' DC, 40' DC/);
  });

  it("counts a charge per container of every type for each of them", () => {
    const all = { basis: "container", unitPrice: 50, amount: 150, currency: "EUR" };
    expect(fclProfitGateMessage(quote(buying, [...buying, all]))).toBeNull();
  });

  it("reads a line without a type as the only type's, and the old GP name as DC", () => {
    const data = { serviceType: "Sea FCL", containers: [{ type: "20' GP", qty: 1 }] };
    expect(fclProfitGateMessage({ ...data, buyingLines: [line("", 100)], sellingLines: [line("20' DC", 120)] })).toBeNull();
  });

  it("does not hold a type no container is chosen of", () => {
    const data = quote([line("20' DC", 100)], [line("20' DC", 120)], { containers: [{ type: "20' DC", qty: 1 }, { type: "40' DC", qty: 0 }] });
    expect(fclProfitGateMessage(data)).toBeNull();
  });

  it("does not take the cent a rounded selling rate leaves for a profit", () => {
    expect(fclProfitGateMessage(quote([line("20' DC", 100.555), line("40' DC", 100)], [line("20' DC", 100.56), line("40' DC", 110)]))).toMatch(/^No profit on 20' DC yet/);
  });

  it("works out a profit in one currency against a loss in another at the rates", () => {
    const usd = (type: string, rate: number) => line(type, rate, { currency: "USD" });
    const bought = [usd("20' DC", 100), line("20' DC", 100), usd("40' DC", 100)];
    const covers = quote(bought, [usd("20' DC", 200), line("20' DC", 90), usd("40' DC", 110)]);
    expect(fclProfitGateMessage(covers, rates)).toBeNull();
    const short = quote(bought, [usd("20' DC", 101), line("20' DC", 90), usd("40' DC", 110)]);
    expect(fclProfitGateMessage(short, rates)).toMatch(/^No profit on 20' DC yet/);
  });

  it("holds no other freight mode, and no non-document", () => {
    expect(fclProfitGateMessage({ ...quote(buying, buying), serviceType: "Sea LCL" })).toBeNull();
    expect(fclProfitGateMessage(null)).toBeNull();
  });
});
