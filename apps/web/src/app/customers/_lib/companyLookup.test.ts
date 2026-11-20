import { describe, expect, it } from "vitest";
import { lookupStepOf, nameSearchHelpOf, NO_COMPANY_FOUND, STILL_SEARCHING, TOO_MANY_COMPANIES } from "./companyLookup";

describe("what Look up does with what is typed", () => {
  it("reads a full IČO and refuses a short one", () => {
    expect(lookupStepOf("27082440")).toEqual({ kind: "ico" });
    expect(lookupStepOf("2708")).toEqual({ kind: "refuse", message: "IČO must be exactly 8 digits" });
  });

  it("shows the matches for a name of three letters or more", () => {
    expect(lookupStepOf("Notino")).toEqual({ kind: "names" });
    expect(lookupStepOf("HOPI s.r.o.")).toEqual({ kind: "names" });
    expect(lookupStepOf(" No ")).toEqual({ kind: "refuse", message: "Type at least 3 characters of the company name, or the IČO" });
  });
});

describe("the line under the box for a name", () => {
  const base = { asked: false, name: "Notino", searchedName: "Notino", fetching: false, results: { tooMany: false, companies: [{}, {}] } };

  it("says nothing while matches are there to pick", () => {
    expect(nameSearchHelpOf(base)).toBeUndefined();
    expect(nameSearchHelpOf({ ...base, asked: true })).toBeUndefined();
  });

  it("says the search still runs once Look up was pressed, not while one only types", () => {
    const waiting = { ...base, searchedName: "Noti", results: undefined };
    expect(nameSearchHelpOf(waiting)).toBeUndefined();
    expect(nameSearchHelpOf({ ...waiting, asked: true })).toBe(STILL_SEARCHING);
    expect(nameSearchHelpOf({ ...base, asked: true, fetching: true, results: undefined })).toBe(STILL_SEARCHING);
  });

  it("says when nothing was found, or too much", () => {
    expect(nameSearchHelpOf({ ...base, results: { tooMany: false, companies: [] } })).toBe(NO_COMPANY_FOUND);
    expect(NO_COMPANY_FOUND).toBe("No company found under that name");
    expect(nameSearchHelpOf({ ...base, asked: true, results: { tooMany: true, companies: [] } })).toBe(TOO_MANY_COMPANIES);
  });

  it("says nothing for a name too short to search", () => {
    expect(nameSearchHelpOf({ ...base, asked: true, name: "No", searchedName: "No", results: undefined })).toBeUndefined();
  });
});
