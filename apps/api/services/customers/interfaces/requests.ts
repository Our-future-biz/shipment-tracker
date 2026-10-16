import type { MaxLen, MinLen } from "encore.dev/validate";
import type { ContactRole } from "./interfaces";

/** The contact person sent with a new customer, with the same limits as a contact added later. */
export interface CustomerContactRequest {
  firstName: string & MinLen<1> & MaxLen<100>;
  lastName: string & MinLen<1> & MaxLen<100>;
  email?: string & MaxLen<320>;
  phone?: string & MaxLen<50>;
  role?: ContactRole;
}
