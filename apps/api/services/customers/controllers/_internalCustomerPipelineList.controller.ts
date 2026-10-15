import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerPipelineItem } from "../interfaces/interfaces";

interface CustomerPipelineListResponse {
  /** Every live customer of the company. */
  data: CustomerPipelineItem[];
}

/**
 * Internal API of the sales service: the customers of the caller's company for the customer
 * pipeline, which places each of them by what the quotes and shipments services know. All
 * customers in one answer, each with a few fields only - GET /customers returns whole records,
 * logos included, and stops at a limit.
 */
export const _internalCustomerPipelineList = api(
  { expose: false, auth: true, method: "GET", path: "/internal/customers/pipeline-list" },
  async (): Promise<CustomerPipelineListResponse> => {
    const data = await customerService.pipelineList(getAuthData()!.companyID);
    return { data };
  },
);
