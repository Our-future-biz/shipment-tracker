import { api } from "encore.dev/api";
import type { MatchesRegexp, MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerSiteService } from "../services/customerSite.service";
import type { CustomerSiteItem, CustomerSiteKind } from "../interfaces/interfaces";

// The site's own customer is used, so there is no customerId to send.
interface CustomerSiteUpdateRequest {
  id: string;
  label?: string & MinLen<1> & MaxLen<200>;
  kind?: CustomerSiteKind;
  street?: string & MaxLen<300>;
  /** Czech: 5 digits, spaces allowed ("110 00"); other countries: any non-empty text. */
  postcode?: string & MaxLen<20>;
  city?: string & MaxLen<200>;
  /** ISO 3166-1 alpha-2 */
  country?: string & MatchesRegexp<"^\\s*[A-Za-z]{2}\\s*$">;
  lat?: number | null;
  lng?: number | null;
  openingHours?: string & MaxLen<500>;
  avizaceName?: string & MaxLen<200>;
  avizacePhone?: string & MaxLen<50>;
  avizaceEmail?: string & MaxLen<320>;
  loadingNotes?: string & MaxLen<2000>;
  tailLiftNeeded?: boolean;
  isDefault?: boolean;
}

interface CustomerSiteUpdateResponse {
  site: CustomerSiteItem;
}

export const customerSiteUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customer-sites/:id" },
  async ({ id, ...input }: CustomerSiteUpdateRequest): Promise<CustomerSiteUpdateResponse> => {
    return { site: await customerSiteService.update(id, getAuthData()!.companyID, input) };
  },
);
