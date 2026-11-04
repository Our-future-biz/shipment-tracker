import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerRepository } from "../repositories/customer.repository";

interface CustomerViewCountsResponse {
  customers: number;
  /** Any role but customer; a company that is both is counted in each */
  suppliers: number;
  all: number;
}

// How many companies each view of the Customer Database list holds, for its view buttons (Council Review 5, m28).
export const customerViewCounts = api(
  { expose: true, auth: true, method: "GET", path: "/customers/view-counts" },
  async (): Promise<CustomerViewCountsResponse> => customerRepository.viewCounts(getAuthData()!.companyID),
);
