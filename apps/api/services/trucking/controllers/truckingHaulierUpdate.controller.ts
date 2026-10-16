import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { haulierService } from "../services/haulier.service";
import type { CostSplitBasis, HaulierCurrency, TruckingHaulierResponse, PreferredLaneInput } from "../interfaces/interfaces";
import { requireModule } from "../../../lib/modules";

interface TruckingHaulierUpdateRequest {
  customerId: string;
  insurer: string;
  insurancePolicyNo: string;
  insuranceLimit: number | null;
  insuranceCurrency: HaulierCurrency;
  /** YYYY-MM-DD */
  insuranceValidTo: string | null;
  licenceNo: string;
  /** YYYY-MM-DD; ignored when licenceUnlimited */
  licenceValidTo: string | null;
  licenceUnlimited: boolean;
  adrCapable: boolean;
  /** Vehicle type codes of the trucking settings */
  vehicleTypes: string[];
  paymentDays: number;
  currency: HaulierCurrency;
  /** vatUnreliable, bankAccountPublished, vatCheckedAt, bankAccounts: a manager only (another user sends them as stored) */
  vatUnreliable: boolean;
  bankAccountPublished: boolean;
  /** YYYY-MM-DD */
  vatCheckedAt: string | null;
  /** The bank accounts published in the VAT register ("prefix-number/bank" or IBAN; the whole list). Left out = kept as saved. */
  bankAccounts?: string[];
  costSplitBasis: CostSplitBasis;
  notes: string;
  /** The whole list; lanes without id are new, lanes left out are removed. */
  preferredLanes: PreferredLaneInput[];
  /** The version read (0 when none is saved yet); a save on top of a newer one is refused with 409. */
  version: number;
}

// Saves a haulier's trucking profile (any user; the VAT and bank fields a manager only). The block is changed only by block / unblock.
export const truckingHaulierUpdate = api(
  { expose: true, auth: true, method: "PUT", path: "/trucking/hauliers/:customerId" },
  async ({ customerId, version, ...input }: TruckingHaulierUpdateRequest): Promise<TruckingHaulierResponse> => {
    await requireModule("trucking_concept");
    const { userID, companyID, role } = getAuthData()!;
    return { haulier: await haulierService.update(companyID, userID, role, customerId, input, version) };
  },
);
