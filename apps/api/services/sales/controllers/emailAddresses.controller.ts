import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { emailAddressService } from "../services/emailAddress.service";
import type { EmailAddressesResponse } from "../interfaces/interfaces";

/** The addresses the signed-in user emailed quotations to, the latest first. */
export const emailAddressesGet = api(
  { expose: true, auth: true, method: "GET", path: "/sales-email-addresses" },
  async (): Promise<EmailAddressesResponse> => {
    return { data: await emailAddressService.list(getAuthData()!) };
  },
);

interface EmailAddressesUsedRequest {
  addresses: string[];
}

/** Remembers the addresses a quotation was just emailed to (To, CC and BCC). */
export const emailAddressesUsed = api(
  { expose: true, auth: true, method: "POST", path: "/sales-email-addresses/used" },
  async (req: EmailAddressesUsedRequest): Promise<EmailAddressesResponse> => {
    return { data: await emailAddressService.used(getAuthData()!, req.addresses) };
  },
);

interface EmailAddressForgetRequest {
  address: string;
}

/** Takes an address off the signed-in user's list. */
export const emailAddressForget = api(
  { expose: true, auth: true, method: "POST", path: "/sales-email-addresses/forget" },
  async (req: EmailAddressForgetRequest): Promise<EmailAddressesResponse> => {
    return { data: await emailAddressService.forget(getAuthData()!, req.address) };
  },
);
