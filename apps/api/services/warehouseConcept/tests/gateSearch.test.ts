import { beforeEach, describe, expect, it, vi } from "vitest";

// The main search in the Warehouse Concept, against a stand-in for its query: what text is looked
// for, and how a found record is answered.
const search = vi.hoisted(() => vi.fn());
vi.mock("../repositories/gateMovement.repository", () => ({ searchGateRecordsMain: search }));

import { gateRefDigits, searchGateRecords } from "../services/gateSearch.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

beforeEach(() => {
  search.mockReset();
  search.mockResolvedValue({ rows: [], total: 0 });
});

describe("the main search in the Warehouse Concept", () => {
  it("finds a reference by its number whatever letters it is typed with", () => {
    expect(gateRefDigits("WCZ2026000003")).toBe("2026000003");
    expect(gateRefDigits("WHCZ2026000003")).toBe("2026000003");
    expect(gateRefDigits("2026000003")).toBe("2026000003");
    expect(gateRefDigits("MSCU1234")).toBeNull();
  });

  it("asks for the text in capitals without spaces, and answers each record by its warehouse reference", async () => {
    search.mockResolvedValue({
      rows: [
        { id: "m1", positionRef: "WCZ2026000003", gateRef: "WCZ2026000003", jobNumber: "CZ00000129", customer: "Odra s.r.o." },
        { id: "m2", positionRef: null, gateRef: "G-17", jobNumber: "", customer: "" },
      ],
      total: 7,
    });
    const found = await searchGateRecords(COMPANY, "wcz 2026 000003", 5);
    expect(search).toHaveBeenCalledWith(COMPANY, "WCZ2026000003", "2026000003", 5);
    expect(found).toEqual({
      items: [
        { id: "m1", reference: "WCZ2026000003", jobNumber: "CZ00000129", customer: "Odra s.r.o." },
        { id: "m2", reference: "G-17", jobNumber: "", customer: "" },
      ],
      total: 7,
    });
  });

  it("asks nothing for text that can't be part of a reference", async () => {
    expect(await searchGateRecords(COMPANY, "gmbh hamburg", 5)).toEqual({ items: [], total: 0 });
    expect(await searchGateRecords(COMPANY, "wcz", 5)).toEqual({ items: [], total: 0 });
    expect(search).not.toHaveBeenCalled();
  });
});
