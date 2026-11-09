import { describe, expect, it } from "vitest";
import type { CustomerItem } from "@/hooks/useCustomers";
import { NAME_COLUMN_KEY, customerCsvRows } from "./customerListColumns";

// Only the fields the columns below read.
const customer = (fields: Partial<CustomerItem>) =>
  ({ companyName: "", city: "", salesOwner: "", totalShipments: 0, ...fields }) as CustomerItem;

describe("customerCsvRows", () => {
  it("heads the columns shown, in their order, the name as the view calls it", () => {
    const [headings] = customerCsvRows([], [NAME_COLUMN_KEY, "city", "salesOwner"], "Supplier");
    expect(headings).toEqual(["Supplier", "City", "Sales Owner"]);
  });

  it("writes a line per customer with the text of each cell", () => {
    const rows = customerCsvRows(
      [
        customer({ companyName: "Charter Advisory s.r.o.", city: "Praha 6", salesOwner: "marek@ourfuture.biz", totalShipments: 3 }),
        customer({ companyName: "BENU s.r.o.", city: "Praha" }),
      ],
      [NAME_COLUMN_KEY, "totalShipments", "city", "salesOwner"],
      "Customer",
    );
    expect(rows).toEqual([
      ["Customer", "Shipments", "City", "Sales Owner"],
      ["Charter Advisory s.r.o.", "3", "Praha 6", "marek@ourfuture.biz"],
      ["BENU s.r.o.", "0", "Praha", ""],
    ]);
  });

  it("leaves out a column the list does not know", () => {
    const rows = customerCsvRows([customer({ companyName: "Acme", city: "Brno" })], [NAME_COLUMN_KEY, "registryStatus", "city"], "Company");
    expect(rows).toEqual([
      ["Company", "City"],
      ["Acme", "Brno"],
    ]);
  });
});
