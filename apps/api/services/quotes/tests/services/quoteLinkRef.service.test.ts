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
  repository.loadLive.mockResolvedValue({ id: QUOTE, quoteNumber: "QCZLCL20261109001" });
});

describe("quoteLinkRef", () => {
  it("answers the quote's reference as it is now, looked up in the caller's company by the reference given", async () => {
    await expect(quoteLinkRef(COMPANY, QUOTE, " QCZ20261109001 ")).resolves.toBe("QCZLCL20261109001");
    expect(repository.loadLive).toHaveBeenCalledWith(COMPANY, "QCZ20261109001");
  });

  it("answers null when the reference names another quote than the id: a link is to one quote", async () => {
    await expect(quoteLinkRef(COMPANY, OTHER_QUOTE, "QCZ20261109001")).resolves.toBeNull();
  });

  it("answers null when the company has no live quote under the reference", async () => {
    repository.loadLive.mockResolvedValue(null);
    await expect(quoteLinkRef(COMPANY, QUOTE, "QCZ20261109001")).resolves.toBeNull();
  });

  it("asks nothing for an empty reference", async () => {
    await expect(quoteLinkRef(COMPANY, QUOTE, "  ")).resolves.toBeNull();
    expect(repository.loadLive).not.toHaveBeenCalled();
  });
});
