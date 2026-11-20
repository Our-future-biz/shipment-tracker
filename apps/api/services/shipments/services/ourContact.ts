import log from "encore.dev/log";
import { invoicing } from "~encore/clients";
import { serviceActor } from "../../../lib/outbox/serviceIdentity";
import type { OurContact } from "../lib/customerLink";

/**
 * Whose customer page it is and how to reach them (the invoicing details): the company's name, phone
 * and e-mail, never a person's. The tracking page and the Import Instructions form both print it
 * (mock council S3-2). Not knowing isn't worth failing the customer's page for.
 */
export async function ourContact(companyId: string): Promise<OurContact> {
  try {
    const { profile } = await invoicing.invoiceProfileGet({ authData: await serviceActor(companyId) });
    return { name: profile.companyName ?? "", phone: profile.phone ?? "", email: profile.email ?? "" };
  } catch (err) {
    log.warn(err, "customer page: the company's contact not read");
    return { name: "", phone: "", email: "" };
  }
}
