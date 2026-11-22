import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addedTypesRequest } from "./CustomerAddressDialog";

const tab = readFileSync(join(__dirname, "../_tabs/AddressesTab.tsx"), "utf8");

describe("types added to the Registered address (owner's answer 22 Nov)", () => {
  it("are sent as the types to add, each once, in the list's order", () => {
    expect(addedTypesRequest(["Warehouse", "Pickup", "Pickup"])).toEqual({ addTypes: ["Pickup", "Warehouse"] });
  });

  // Review of system-23: the whole list as the page last read it took off a Billing moved to the address meanwhile.
  it("never send the address's whole list of types as this page last read it", () => {
    expect(addedTypesRequest(["Pickup"])).not.toHaveProperty("types");
    expect(tab).toMatch(/updateAddress\(\{ id: registered\.id, params: addedTypesRequest\(types\) \}\)/);
    expect(tab).not.toMatch(/registered\.types/);
  });
});
