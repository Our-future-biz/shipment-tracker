import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { myCountriesService } from "../services/myCountries.service";

// The signed-in user's countries: the Public Holidays page and the year calendar show only their
// holidays; an empty list shows every country.

interface MyCountriesResponse {
  /** As the World Holidays list names them (its Country, else its Country code) */
  countries: string[];
}

export const holidayMyCountriesGet = api(
  { expose: true, auth: true, method: "GET", path: "/holidays/my-countries" },
  async (): Promise<MyCountriesResponse> => {
    const auth = getAuthData()!;
    return { countries: await myCountriesService.get(auth.companyID, auth.userID) };
  },
);

interface MyCountriesSetRequest {
  countries: (string & MaxLen<100>)[] & MaxLen<300>;
}

export const holidayMyCountriesSet = api(
  { expose: true, auth: true, method: "PUT", path: "/holidays/my-countries" },
  async ({ countries }: MyCountriesSetRequest): Promise<MyCountriesResponse> => {
    const auth = getAuthData()!;
    return { countries: await myCountriesService.set(auth.companyID, auth.userID, countries) };
  },
);
