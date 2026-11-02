import { describe, expect, it } from "vitest";
import { searchInlandTerminals, searchTerminals } from "../geo/terminals";

describe("searchTerminals", () => {
  it("finds a terminal by its code: the port's UN/LOCODE and the SMDG terminal code", () => {
    expect(searchTerminals("DEHAMCTB")[0]).toEqual({
      code: "DEHAMCTB",
      name: "HHLA CONTAINER TERMINAL BURCHARDKAI (CTB)",
      portCode: "DEHAM",
      port: "Hamburg",
      countryCode: "DE",
      operator: "HHLA (HAMBURGER HAFEN UND LOGISTIK AG)",
    });
  });

  it("lists every terminal of a port for its UN/LOCODE, before those that only mention it", () => {
    const codes = searchTerminals("deham").map((t) => t.code);
    expect(codes).toContain("DEHAMCTA");
    expect(codes).toContain("DEHAMEGH");
    expect(codes.every((c) => c.startsWith("DEHAM"))).toBe(true);
  });

  it("finds terminals by port, name or operator, by word starts", () => {
    expect(searchTerminals("hamburg").some((t) => t.code === "DEHAMCTB")).toBe(true);
    expect(searchTerminals("burchardkai").map((t) => t.code)).toEqual(["DEHAMCTB"]);
    expect(searchTerminals("hhla").length).toBeGreaterThan(2);
    expect(searchTerminals("amburg").some((t) => t.code === "DEHAMCTB")).toBe(false);
  });

  it("asks for at least 2 letters", () => {
    expect(searchTerminals("h")).toEqual([]);
  });
});

describe("searchInlandTerminals", () => {
  it("finds an inland terminal by its own code", () => {
    expect(searchInlandTerminals("de-it116")[0]).toEqual({ code: "DE-IT116", name: "Duisburg DIT", town: "Duisburg", countryCode: "DE", kind: "intermodal", railroads: null });
  });

  it("finds them by name or town: European intermodal, US rail and dry ports", () => {
    expect(searchInlandTerminals("duisburg").map((t) => t.code)).toEqual(expect.arrayContaining(["DE-IT116", "DE-IT459"]));
    expect(searchInlandTerminals("mobile")).toContainEqual(
      expect.objectContaining({ code: "US-RR004", name: "Container Terminal, Mobile", town: "Mobile, AL", kind: "rail", railroads: "CN, CSX, KCS, ALE, CGR, TASD" }),
    );
    expect(searchInlandTerminals("haqueena")[0]).toMatchObject({ code: "AF-DP001", kind: "dry_port", countryCode: "AF" });
    expect(searchInlandTerminals("ceska trebova")[0]?.code).toBe("CZ-IT80");
  });

  it("asks for at least 2 letters", () => {
    expect(searchInlandTerminals("d")).toEqual([]);
  });
});
