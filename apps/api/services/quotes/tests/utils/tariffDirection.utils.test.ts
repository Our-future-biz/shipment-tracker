import { describe, expect, it } from "vitest";
import { tariffDirectionGateMessage } from "../../utils/tariffDirection.utils";

const rail = (pricedDirection?: string) => ({ tariffRef: "rail:v1", chargeCode: "inland_haulage", ...(pricedDirection ? { pricedDirection } : {}) });
const ocean = (pricedDirection?: string) => ({ tariffRef: "ocean:v2", chargeCode: "ocean_freight", ...(pricedDirection ? { pricedDirection } : {}) });

describe("tariffDirectionGateMessage", () => {
  it("holds a quote with a line priced in the other Trade Direction", () => {
    const message = tariffDirectionGateMessage({ direction: "Import", buyingLines: [ocean("export"), rail("import")] });
    expect(message).toMatch(/^A buying line was priced from an export tariff, and the quote is now an import/);
  });

  it("counts the lines and says when the quote has no Trade Direction", () => {
    const message = tariffDirectionGateMessage({ buyingLines: [ocean("export"), rail("import")] });
    expect(message).toMatch(/^2 buying lines were priced from an export tariff, and the quote is without a Trade Direction .* remove the lines$/);
  });

  it("lets lines priced in the quote's direction, lines from before it was remembered, and other tariffs go", () => {
    expect(tariffDirectionGateMessage({ direction: "Export", buyingLines: [ocean("export"), rail()] })).toBeNull();
    expect(tariffDirectionGateMessage({ direction: "Export", buyingLines: [{ tariffRef: "collection:v3", pricedDirection: "import" }] })).toBeNull();
    expect(tariffDirectionGateMessage({ direction: "Export", buyingLines: [{ supplier: "typed", pricedDirection: "import" }] })).toBeNull();
  });

  it("reads anything that is no quote document as nothing to hold", () => {
    expect(tariffDirectionGateMessage(null)).toBeNull();
    expect(tariffDirectionGateMessage({ buyingLines: "x" })).toBeNull();
    expect(tariffDirectionGateMessage({ direction: "Import", buyingLines: [null, 3, rail("sideways")] })).toBeNull();
  });
});
