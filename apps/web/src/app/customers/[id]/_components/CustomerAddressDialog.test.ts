import { describe, expect, it } from "vitest";
import { withAddedTypes } from "./CustomerAddressDialog";

describe("types added to the Registered address (owner's answer 22 Nov)", () => {
  it("keeps the address's own types and adds the chosen ones, each once, in the list's order", () => {
    expect(withAddedTypes(["Registered"], ["Warehouse", "Pickup"])).toEqual(["Registered", "Pickup", "Warehouse"]);
    expect(withAddedTypes(["Registered", "Billing"], ["Billing", "Delivery"])).toEqual(["Registered", "Billing", "Delivery"]);
  });
});
