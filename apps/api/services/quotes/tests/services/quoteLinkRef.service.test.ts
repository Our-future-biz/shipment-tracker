import { beforeEach, describe, expect, it, vi } from "vitest";

// What the Loading Planner is told about a quote it links a plan to. The quote is found by its
// reference in the company's live quotes (a stand-in for the repository here); it must be the
// quote with the id the plan names.
const repository = vi.hoisted(() => ({ loadLive: vi.fn() }));
vi.mock("../../repositories/salesQuote.repository", () => ({ salesQuoteRepository: repository }));

import { quoteLinkRef } from "../../services/quoteLinkRef.service";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const QUOTE = "66666666-6666-4666-8666-666666666666";
const OTHER_QUOTE = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  vi.clearAllMocks();
  repository.loadLive.mockResolvedValue({ id: QUOTE, quoteNumber: "QCZLCL20261109001", data: { packages: [{ qty: 4, type: "Pallets", length: 120, width: 80, height: 150, weight: 450, stackable: true }] } });
});

describe("quoteLinkRef", () => {
  it("answers the quote's reference as it is now, looked up in the caller's company by the reference given, without its cargo unless asked", async () => {
    await expect(quoteLinkRef(COMPANY, QUOTE, " QCZ20261109001 ")).resolves.toEqual({ quoteNumber: "QCZLCL20261109001" });
    expect(repository.loadLive).toHaveBeenCalledWith(COMPANY, "QCZ20261109001");
  });

  it("answers null when the reference names another quote than the id: a link is to one quote", async () => {
    await expect(quoteLinkRef(COMPANY, OTHER_QUOTE, "QCZ20261109001", true)).resolves.toEqual({ quoteNumber: null });
  });

  it("answers null when the company has no live quote under the reference", async () => {
    repository.loadLive.mockResolvedValue(null);
    await expect(quoteLinkRef(COMPANY, QUOTE, "QCZ20261109001", true)).resolves.toEqual({ quoteNumber: null });
  });

  it("asks nothing for an empty reference", async () => {
    await expect(quoteLinkRef(COMPANY, QUOTE, "  ")).resolves.toEqual({ quoteNumber: null });
    expect(repository.loadLive).not.toHaveBeenCalled();
  });

  it("asked with the cargo, gives the quote's package lines as its document holds them", async () => {
    await expect(quoteLinkRef(COMPANY, QUOTE, "QCZ20261109001", true)).resolves.toEqual({
      quoteNumber: "QCZLCL20261109001",
      packages: [{ qty: 4, type: "Pallets", length: 120, width: 80, height: 150, weight: 450, stackable: true }],
    });
  });

  it("gives each package line only the fields a package line has, a figure typed as text as a number, and no lines for a container quote", async () => {
    repository.loadLive.mockResolvedValue({ id: QUOTE, quoteNumber: "QCZ20261109001", data: { packages: [{ qty: "2", type: "Cartons", length: "", weight: "x", note: "fragile" }, "junk"] } });
    const { packages } = await quoteLinkRef(COMPANY, QUOTE, "QCZ20261109001", true);
    expect(packages).toHaveLength(1);
    expect(packages![0]).toMatchObject({ qty: 2, type: "Cartons" });
    expect(packages![0]).not.toHaveProperty("note");
    expect(packages![0].length).toBeUndefined();
    expect(packages![0].weight).toBeUndefined();
    repository.loadLive.mockResolvedValue({ id: QUOTE, quoteNumber: "QCZFCL20261109001", data: { containers: [{ type: "40' HC", qty: 2 }] } });
    await expect(quoteLinkRef(COMPANY, QUOTE, "QCZFCL20261109001", true)).resolves.toEqual({ quoteNumber: "QCZFCL20261109001", packages: [] });
  });
});
