import { describe, expect, it } from "vitest";
import type { CostLine } from "@/app/sales/_lib/types";
import { sellingFromBuying } from "./AddToSellingDialog";

const buying: CostLine = {
  type: "Ocean freight",
  chargeCode: "ocean_freight",
  description: "SHA–HAM 40HC",
  supplier: "COSCO",
  supplierCustomerId: "c1",
  currency: "USD",
  amount: 750,
  tariffRef: "T-1",
};

describe("sellingFromBuying", () => {
  it("takes the charge, description and currency, and marks the amount up", () => {
    expect(sellingFromBuying(buying, 20)).toEqual({ type: "Ocean freight", chargeCode: "ocean_freight", description: "SHA–HAM 40HC", currency: "USD", amount: 900, value: 1 });
  });

  it("leaves the supplier and the tariff on the buying side", () => {
    const selling = sellingFromBuying(buying, 0);
    expect(selling).not.toHaveProperty("supplier");
    expect(selling).not.toHaveProperty("tariffRef");
    expect(selling.amount).toBe(750);
  });

  it("keeps the buying line's quantity and basis (a W/M line stays W/M)", () => {
    const selling = sellingFromBuying({ ...buying, value: 7.551, basis: "wm" }, 10);
    expect(selling).toMatchObject({ value: 7.551, basis: "wm" });
  });

  it("rounds to cents", () => {
    expect(sellingFromBuying({ ...buying, amount: 33.33 }, 15).amount).toBe(38.33);
  });
});
