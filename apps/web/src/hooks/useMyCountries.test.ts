import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { keptAfterQuickPick } from "@/app/calendar/_lib/countryChoice";

const saved: string[][] = [];
const answers: Array<(countries: string[]) => void> = [];
vi.mock("@/lib/api", () => ({
  api: {
    holidays: {
      // Each save waits until the test answers it, as the server would, slower than the clicks.
      holidayMyCountriesSet: vi.fn(({ countries }: { countries: string[] }) => {
        saved.push(countries);
        return new Promise<{ countries: string[] }>((resolve) => answers.push((c) => resolve({ countries: c })));
      }),
    },
  },
  apiErrorMessage: (e: unknown) => String(e),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock("@/hooks/useOrgUnits", () => ({ useCountries: () => ({ countries: [] }) }));

import { MY_COUNTRIES_KEY, latestMyCountries, myCountriesSaveOptions, showMyCountries } from "./useMyCountries";

const OFFERED = ["Austria", "France", "Germany", "Italy"];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  saved.length = 0;
  answers.length = 0;
});

// Mock test S18-100: three quick picks in the calendar's "My countries" kept only the last one.
describe("three quick picks of My countries", () => {
  it("are each shown at once, built on the one before, saved in click order, and all kept", async () => {
    const qc = new QueryClient();
    qc.setQueryData(MY_COUNTRIES_KEY, ["Germany"]);
    const options = myCountriesSaveOptions(qc);
    // What the hook's pick does: the change read against the picker as drawn (Germany: the page has
    // not drawn again between the clicks), applied to the latest list, shown, then saved.
    const pick = (next: string[]) => {
      const countries = keptAfterQuickPick(latestMyCountries(qc), [], OFFERED, ["Germany"], next);
      return qc.getMutationCache().build(qc, options).execute(showMyCountries(qc, countries));
    };
    const done = [pick(["Germany", "Austria"]), pick(["Germany", "France"]), pick(["Germany", "Italy"])];
    expect(qc.getQueryData(MY_COUNTRIES_KEY)).toEqual(["Germany", "Austria", "France", "Italy"]);

    // One save at a time, in click order; an older answer does not put back its shorter list.
    await flush();
    expect(saved).toEqual([["Germany", "Austria"]]);
    answers[0]!(["Germany", "Austria"]);
    await flush();
    expect(qc.getQueryData(MY_COUNTRIES_KEY)).toEqual(["Germany", "Austria", "France", "Italy"]);
    answers[1]!(["Germany", "Austria", "France"]);
    await flush();
    answers[2]!(["Germany", "Austria", "France", "Italy"]);
    await Promise.all(done);
    expect(saved).toEqual([
      ["Germany", "Austria"],
      ["Germany", "Austria", "France"],
      ["Germany", "Austria", "France", "Italy"],
    ]);
    expect(qc.getQueryData(MY_COUNTRIES_KEY)).toEqual(["Germany", "Austria", "France", "Italy"]);
  });
});
