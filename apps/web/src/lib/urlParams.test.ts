import { afterEach, describe, expect, it, vi } from "vitest";
import { replaceSearchParams } from "./urlParams";

function fakeWindow(search: string) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", { location: { search }, history: { replaceState } });
  return replaceState;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replaceSearchParams", () => {
  it("sets and removes parameters, keeping the others", () => {
    const replaceState = fakeWindow("?tab=overdue&q=x");
    replaceSearchParams("/accounts-payable", { invoice: "abc", tab: null });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/accounts-payable?q=x&invoice=abc");
  });

  it("leaves the bare path when nothing is left", () => {
    const replaceState = fakeWindow("?invoice=abc");
    replaceSearchParams("/accounts-payable", { invoice: null, tab: "" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/accounts-payable");
  });
});
