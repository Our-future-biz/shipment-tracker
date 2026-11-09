import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { AresResult, AresSearchHit, CustomerRole } from "../interfaces/interfaces";
import type { CustomerContactRequest } from "../interfaces/requests";
import type { PublicRegistrationForm, RegistrationLinkItem, RegistrationSettings } from "../interfaces/registration";
import { companyRegistrationService } from "../services/companyRegistration.service";

// ─── Sales → Settings: what the form calls the terms, and where they are read ───

export const registrationSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/customers/registration-settings" },
  async (): Promise<RegistrationSettings> => companyRegistrationService.settings(getAuthData()!.companyID),
);

interface RegistrationSettingsSaveRequest {
  termsName: string & MaxLen<200>;
  termsUrl: string & MaxLen<1000>;
}

// Managers and admins only.
export const registrationSettingsSave = api(
  { expose: true, auth: true, method: "PUT", path: "/customers/registration-settings" },
  async (req: RegistrationSettingsSaveRequest): Promise<RegistrationSettings> => companyRegistrationService.saveSettings(getAuthData()!, req),
);

// ─── The links, as the desk sees them ───

interface RegistrationLinkCreateRequest {
  roles: CustomerRole[];
  /** Who the link is for, as a reminder. */
  label?: string & MaxLen<200>;
}

// A new link. The answer is the only time the URL is known.
export const registrationLinkCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/registration-links" },
  async (req: RegistrationLinkCreateRequest): Promise<{ url: string; link: RegistrationLinkItem }> => companyRegistrationService.createLink(getAuthData()!, req),
);

export const registrationLinkList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/registration-links" },
  async (): Promise<{ links: RegistrationLinkItem[] }> => ({ links: await companyRegistrationService.openLinks(getAuthData()!.companyID) }),
);

export const registrationLinkRevoke = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/registration-links/:id" },
  async ({ id }: { id: string }): Promise<void> => {
    await companyRegistrationService.revokeLink(getAuthData()!, id);
  },
);

// ─── The company's page, without a login: the link's token is the only key ───

export const publicRegistrationForm = api(
  { expose: true, auth: false, method: "GET", path: "/public/company-registration/:token", sensitive: true },
  async ({ token }: { token: string }): Promise<{ form: PublicRegistrationForm }> => ({ form: await companyRegistrationService.publicForm(token) }),
);

export const publicRegistrationAres = api(
  { expose: true, auth: false, method: "GET", path: "/public/company-registration/:token/ares/:ico", sensitive: true },
  async ({ token, ico }: { token: string; ico: string }): Promise<AresResult> => companyRegistrationService.publicAresLookup(token, ico),
);

interface PublicRegistrationSearchRequest {
  token: string;
  name: string & MaxLen<200>;
}

export const publicRegistrationAresSearch = api(
  { expose: true, auth: false, method: "GET", path: "/public/company-registration/:token/ares-search", sensitive: true },
  async ({ token, name }: PublicRegistrationSearchRequest): Promise<{ companies: AresSearchHit[]; tooMany: boolean }> => companyRegistrationService.publicAresSearch(token, name),
);

interface PublicRegistrationSubmitRequest {
  token: string;
  /** Must be true: the form's tick box. */
  termsAccepted: boolean;
  country: string & MaxLen<2>;
  ico?: string & MaxLen<8>;
  companyName?: string & MaxLen<300>;
  registrationNumber?: string & MaxLen<50>;
  vatId?: string & MaxLen<20>;
  street?: string & MaxLen<200>;
  city?: string & MaxLen<200>;
  postalCode?: string & MaxLen<20>;
  contact: CustomerContactRequest;
}

export const publicRegistrationSubmit = api(
  { expose: true, auth: false, method: "POST", path: "/public/company-registration/:token", sensitive: true },
  async ({ token, ...input }: PublicRegistrationSubmitRequest): Promise<void> => {
    await companyRegistrationService.submit(token, input);
  },
);
