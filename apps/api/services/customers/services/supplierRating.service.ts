import { APIError } from "encore.dev/api";
import { customerSupplierRatingRepository } from "../repositories/customerSupplierRating.repository";
import { isSupplier, type CustomerItem, type SupplierRatingEntry } from "../interfaces/interfaces";
import { toCustomerItem, toSupplierRatingEntry } from "../lib/mappers";
import { canRateSupplier } from "../../../lib/salesPolicy";
import { userEmailOf } from "../../../lib/companyUsers";
import { customerService } from "./customer.service";

/** Who sets a rating: the signed-in user and their role. */
export interface RatingActor {
  userID: string;
  role: string;
}

export interface SupplierRatingInput {
  /** 0–5 whole stars, or null to clear it (back to not rated). */
  rating: number | null;
  reason?: string;
}

/** The highest rating that still needs a reason: one that warns the next person picking this supplier. */
export const REASON_REQUIRED_UP_TO = 2;

// A supplier's 0–5 star rating, set by hand by a manager. The current one is on the customer; every
// change is kept. Who set it is taken from the login, recorded by e-mail as every person is.
class SupplierRatingService {
  async set(companyId: string, customerId: string, actor: RatingActor, input: SupplierRatingInput): Promise<CustomerItem> {
    if (!canRateSupplier(actor.role)) throw APIError.permissionDenied("Only a manager can rate a supplier");
    const { rating } = input;
    if (rating !== null && !(Number.isInteger(rating) && rating >= 0 && rating <= 5)) {
      throw APIError.invalidArgument("A rating is a whole number of stars from 0 to 5");
    }
    const reason = (input.reason ?? "").trim();
    if (rating !== null && rating <= REASON_REQUIRED_UP_TO && !reason) {
      throw APIError.invalidArgument(`Give a reason for a rating of ${rating} stars: it warns whoever picks this supplier next`);
    }
    const customer = await customerService.requireLive(customerId, companyId);
    if (!isSupplier(customer.roles)) {
      throw APIError.invalidArgument("Only a supplier can be rated: give the company a role other than Customer first");
    }
    const row = await customerSupplierRatingRepository.setRating(companyId, customerId, {
      rating,
      reason: rating === null ? "" : reason,
      setBy: await userEmailOf(actor.userID),
      setByUserId: actor.userID || null,
    });
    // Deleted, or no longer a supplier, since the check above.
    if (!row) throw APIError.notFound("Supplier not found");
    return toCustomerItem(row);
  }

  /** Every change of the live customer's rating, newest first. */
  async history(companyId: string, customerId: string): Promise<SupplierRatingEntry[]> {
    await customerService.requireLive(customerId, companyId);
    return (await customerSupplierRatingRepository.listForCustomer(companyId, customerId)).map(toSupplierRatingEntry);
  }
}

export const supplierRatingService = new SupplierRatingService();
