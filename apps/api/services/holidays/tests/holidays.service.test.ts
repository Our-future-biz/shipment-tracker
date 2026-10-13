import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listAllForCompany: vi.fn(),
  insertMany: vi.fn(),
  softDeleteForCompany: vi.fn(),
}));
vi.mock("../repositories/publicHoliday.repository", () => ({ publicHolidayRepository: repo }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({ APIError: { notFound: (msg: string) => new Error(msg) } }));

import { holidaysService } from "../services/holidays.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const blank = {
  country: "", countryCode: "", nationalHoliday: "", nationalStart: "", nationalEnd: "",
  regionalHoliday: "", regionalStart: "", regionalEnd: "", regions: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.listAllForCompany.mockResolvedValue([]);
});

describe("holidaysService.import", () => {
  it("saves usable rows with blank dates as null and the trimmed source", async () => {
    const res = await holidaysService.import(
      COMPANY,
      [{ ...blank, country: "Austria", nationalHoliday: "Epiphany", nationalStart: "06.01.2026" }],
      "  at.xlsx ",
    );
    expect(res).toEqual({ added: 1, skipped: 0 });
    expect(repo.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({
        companyId: COMPANY, source: "at.xlsx", country: "Austria",
        nationalStart: "2026-01-06", nationalEnd: "2026-01-06", regionalStart: null, regionalEnd: null,
      }),
    ]);
  });

  it("skips incomplete rows, rows already saved and repeats within the upload", async () => {
    repo.listAllForCompany.mockResolvedValue([
      {
        ...blank, id: "1", source: "", createdAt: new Date(), country: "Austria", nationalHoliday: "Epiphany",
        nationalStart: "2026-01-06", nationalEnd: "2026-01-06", regionalStart: null, regionalEnd: null,
      },
    ]);
    const res = await holidaysService.import(
      COMPANY,
      [
        { ...blank, country: "austria", nationalHoliday: "Epiphany", nationalStart: "2026-01-06" }, // already saved
        { ...blank, country: "Austria", nationalHoliday: "No date" }, // incomplete
        { ...blank, country: "Germany", nationalHoliday: "Unity Day", nationalStart: "2026-10-03" },
        { ...blank, country: "Germany", nationalHoliday: "Unity Day", nationalStart: "03.10.2026" }, // repeat
      ],
      "",
    );
    expect(res).toEqual({ added: 1, skipped: 3 });
  });

  it("treats missing rows as an empty upload", async () => {
    expect(await holidaysService.import(COMPANY, undefined, undefined)).toEqual({ added: 0, skipped: 0 });
  });
});

describe("holidaysService.remove", () => {
  it("throws not found when nothing was deleted", async () => {
    repo.softDeleteForCompany.mockResolvedValue(null);
    await expect(holidaysService.remove("x", COMPANY)).rejects.toThrow("Holiday not found");
  });
});
