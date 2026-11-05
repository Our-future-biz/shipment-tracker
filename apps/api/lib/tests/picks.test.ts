import { describe, expect, it } from "vitest";
import { byPicks, pickCode } from "../geo/picks";
import { searchAirports } from "../geo/airports";
import { searchInlandTerminals, searchTerminals } from "../geo/terminals";

const code = (x: { code: string }) => x.code;

describe("byPicks", () => {
  it("puts the most picked first and keeps the search's order otherwise", () => {
    const list = ["DEHMC", "DEHAM", "USZH8", "USHAM", "USHBQ", "USHG7"].map((c) => ({ code: c }));
    // DEHAM picked 4 times, USHBQ once.
    expect(byPicks(list, code, new Map([["DEHAM", 4], ["USHBQ", 1]])).map(code)).toEqual(["DEHAM", "USHBQ", "DEHMC", "USZH8", "USHAM", "USHG7"]);
    // Then USHG7 twice: it passes USHBQ.
    expect(byPicks(list, code, new Map([["DEHAM", 4], ["USHBQ", 1], ["USHG7", 2]])).map(code)).toEqual(["DEHAM", "USHG7", "USHBQ", "DEHMC", "USZH8", "USHAM"]);
  });

  it("changes nothing without picks", () => {
    const list = [{ code: "B" }, { code: "A" }];
    expect(byPicks(list, code).map(code)).toEqual(["B", "A"]);
    expect(byPicks(list, code, new Map()).map(code)).toEqual(["B", "A"]);
  });
});

describe("the searches with a user's picks", () => {
  it("list a picked airport first, also one the list would have cut", () => {
    const all = searchAirports("international", 1000).map(code);
    const last = all.at(-1)!;
    expect(searchAirports("international", 30).map(code)).not.toContain(last);
    expect(searchAirports("international", 30, new Map([[last, 1]]))[0]?.code).toBe(last);
  });

  it("list picked terminals first", () => {
    const codes = searchTerminals("deham").map(code);
    const picked = codes.at(-1)!;
    expect(searchTerminals("deham", 30, new Map([[picked, 3]]))[0]?.code).toBe(picked);
    const inland = searchInlandTerminals("duisburg").map(code);
    expect(searchInlandTerminals("duisburg", 30, new Map([[inland.at(-1)!, 1]]))[0]?.code).toBe(inland.at(-1));
  });
});

describe("pickCode", () => {
  it("takes place, airport and terminal codes, in capitals", () => {
    expect(["deham", "PVG", "DEHAMCTB", "de-it116", " USHBQ "].map(pickCode)).toEqual(["DEHAM", "PVG", "DEHAMCTB", "DE-IT116", "USHBQ"]);
  });
  it("refuses anything else", () => {
    expect(["", "Hamburg port", "DE", "DEHAM!", "DE-XX1"].map(pickCode)).toEqual([null, null, null, null, null]);
  });
});
