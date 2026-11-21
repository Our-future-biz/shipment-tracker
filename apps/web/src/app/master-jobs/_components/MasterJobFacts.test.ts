import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {} }));

import type { MasterJobItem } from "@/hooks/useMasterJobs";
import { MasterJobFacts } from "./MasterJobFacts";

// Mock test S21-044: an air master job's header said Master BoL, Shipping line and Ports.
describe("the master job header", () => {
  const facts = (mj: Partial<MasterJobItem>) =>
    renderToStaticMarkup(createElement(MasterJobFacts, { masterJob: { mczNumber: "MCZ00000001", ...mj } as MasterJobItem, shipments: [] }));

  it("names an air master job's MAWB, airline and airports - by its houses' mode when it has none of its own", () => {
    for (const mj of [{ freightMode: "Air Freight" }, { freightMode: "", houseFreightMode: "Air Freight" }]) {
      const html = facts(mj);
      for (const word of ["MAWB Number", "Airline / Coloader", "Airport of Departure", "Airport of Destination"]) expect(html).toContain(word);
      expect(html).not.toContain("Port of Loading");
      expect(html).not.toContain("Master BoL Number");
    }
  });

  it("keeps the sea words on a sea master job", () => {
    const html = facts({ freightMode: "Sea Freight" });
    for (const word of ["Master BoL Number", "Shipping line / Coloader", "Port of Loading", "Port of Discharge"]) expect(html).toContain(word);
  });
});
