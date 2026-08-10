import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerItem } from "../interfaces/interfaces";

interface CustomerUpdateRequest {
  id: string;
  companyName?: string;
  dic?: string;
  status?: string;
  salesOwner?: string;
  label?: string;
  creditLimit?: number;
  currency?: string;
  paymentTerms?: string;
  freightPaymentTerms?: string;
  dutyPaymentTerms?: string;
  companyWebsite?: string;
  city?: string;
  country?: string;
  registeredAddress?: string;
  nace?: string;
  totalRevenue?: number;
  totalProfit?: number;
  totalShipments?: number;
  lastActivityDate?: string;
}

interface CustomerUpdateResponse {
  customer: CustomerItem;
}

export const customerUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customers/:id" },
  async (req: CustomerUpdateRequest): Promise<CustomerUpdateResponse> => {
    const { id, ...patch } = req;
    const customer = await customerService.update(id, getAuthData()!.companyID, patch);
    if (!customer) {
      throw APIError.notFound("Customer not found");
    }
    return { customer: customer as unknown as CustomerItem };
  },
);
