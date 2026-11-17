import { describe, expect, it } from "vitest";
import { allFieldsSearchHref, searchColumnsFor, searchesAllFields, shownColumnsParams, typedSearchParams } from "./allFieldsSearch";

const paramsOf = (href: string) => new URL(href, "http://app.test").searchParams;
const SHOWN = ["jobNumber", "masterJob", "customer", "customerPic"];

describe("the Shipments list opened by Show all on the main search's results", () => {
  it("searches every field for the same text, as the main search does, so it lists what that counted", () => {
    const params = paramsOf(allFieldsSearchHref("gmbh"));
    expect(new URL(allFieldsSearchHref("gmbh"), "http://app.test").pathname).toBe("/shipments");
    expect(params.get("q")).toBe("gmbh");
    expect(searchesAllFields(params)).toBe(true);
    // No columns named: the API then searches what the main search searches.
    expect(searchColumnsFor(params, SHOWN)).toBeUndefined();
  });

  it("keeps a text with spaces and signs as typed", () => {
    expect(paramsOf(allFieldsSearchHref("müller & co")).get("q")).toBe("müller & co");
  });

  it("goes back to the columns shown on Search shown columns only, the text kept", () => {
    const params = shownColumnsParams(paramsOf(allFieldsSearchHref("gmbh")));
    expect(params.get("q")).toBe("gmbh");
    expect(searchColumnsFor(params, SHOWN)).toEqual(SHOWN);
  });

  it("goes back to the columns shown once a search is typed in the list's own box", () => {
    const typed = typedSearchParams(paramsOf(`${allFieldsSearchHref("gmbh")}&status=active`), "gmbh hamburg");
    expect(typed.get("q")).toBe("gmbh hamburg");
    expect(typed.get("status")).toBe("active");
    expect(searchesAllFields(typed)).toBe(false);
    expect(typedSearchParams(paramsOf("/shipments?q=gmbh"), "").has("q")).toBe(false);
  });
});

describe("the Shipments list's own search", () => {
  it("looks in the columns shown", () => {
    const params = paramsOf("/shipments?q=gmbh");
    expect(searchesAllFields(params)).toBe(false);
    expect(searchColumnsFor(params, SHOWN)).toEqual(SHOWN);
  });

  it("has nothing to search in every field without a text", () => {
    expect(searchesAllFields(paramsOf("/shipments?fields=all"))).toBe(false);
  });
});
