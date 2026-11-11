import { afterEach, describe, expect, it, vi } from "vitest";
import { csvText, downloadCsv } from "./csv";

describe("csvText", () => {
  it("quotes every cell and doubles its quotes", () => {
    expect(csvText([["a", 'say "hi"']])).toBe('"a","say ""hi"""');
  });

  it("escapes text a spreadsheet would run as a formula", () => {
    expect(csvText([["=HYPERLINK(\"x\")", "+cmd", "@SUM(A1)", "\tx", "-x"]])).toBe(
      '"\'=HYPERLINK(""x"")","\'+cmd","\'@SUM(A1)","\'\tx","\'-x"',
    );
  });

  it("leaves numbers, negative ones included, and phone numbers readable", () => {
    expect(csvText([["-5.00", "12", "+420777123456"]])).toBe('"-5.00","12","\'+420777123456"');
  });

  it("writes one line per row", () => {
    expect(csvText([["h1", "h2"], ["a", "b"]])).toBe('"h1","h2"\n"a","b"');
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the file's link until the browser has taken the download over, instead of freeing it at the click", () => {
    vi.useFakeTimers();
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", { createElement: () => link, body: { appendChild: vi.fn() } });
    vi.stubGlobal("window", { setTimeout: (run: () => void, ms: number) => setTimeout(run, ms) });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:shipments");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    downloadCsv("shipments.csv", [["Job"], ["SCZ1"]]);
    expect(link.click).toHaveBeenCalled();
    expect(link.download).toBe("shipments.csv");
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revoke).toHaveBeenCalledWith("blob:shipments");
  });
});
