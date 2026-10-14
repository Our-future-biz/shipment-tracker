import { describe, expect, it } from "vitest";
import { csvText } from "./csv";

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
