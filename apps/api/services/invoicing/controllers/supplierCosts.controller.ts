import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { supplierCostsService } from "../services/supplierCosts.service";
import type { SupplierCostsResponse } from "../interfaces/interfaces";

interface SupplierCostsRequest {
  customerId: string;
}

/**
 * What we owe a supplier of the Customer Database, from the shipments' Costs Breakdown: its buying
 * lines not yet paid (received = owed, not received = expected) and the typed vendor names that name
 * it without being linked (Council Outlay 7, step 6b). Read by everyone who sees the supplier's page.
 */
export const invoicingSupplierCosts = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/suppliers/:customerId/costs" },
  async (req: SupplierCostsRequest): Promise<SupplierCostsResponse> => {
    return supplierCostsService.forSupplier(getAuthData()!.companyID, req.customerId);
  },
);
