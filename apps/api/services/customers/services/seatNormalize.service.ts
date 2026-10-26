import log from "encore.dev/log";
import type { CustomerSeatNormalizeResult } from "../interfaces/interfaces";
import { planSeatNormalize } from "../lib/seat";
import { customerAddressRepository } from "../repositories/customerAddress.repository";

// The backfill for the seat columns: before they followed the Registered address, an edit in the
// Addresses tab left the customer's registered address, city and country as they were. A superadmin
// starts it for the caller's company; running it again changes nothing more.
class CustomerSeatService {
  async normalize(companyId: string): Promise<CustomerSeatNormalizeResult> {
    const plan = planSeatNormalize(await customerAddressRepository.seatsOf(companyId));
    const changed = await customerAddressRepository.applySeats(companyId, plan.changes);
    log.info("customer seats normalized", { companyId, checked: plan.checked, changed, unmatched: plan.unmatched.length });
    return { checked: plan.checked, changed, unmatched: plan.unmatched };
  }
}

export const customerSeatService = new CustomerSeatService();
