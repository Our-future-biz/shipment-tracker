import { APIError } from "encore.dev/api";
import { customers, quotes, shipments } from "~encore/clients";
import { isRealYmd } from "../../../lib/businessDate";
import { foldDiacritics } from "../../../lib/db/textSearch";
import type { PipelineBoard, PipelineStage } from "../interfaces/interfaces";
import { PIPELINE_STAGES, buildBoard, type PipelineCustomer } from "../utils/pipelineStage.utils";

/** The pipeline as the API takes it: the period of the Won column, and which part of the cards. */
export interface PipelineRequest {
  /** YYYY-MM-DD; left out = all time. */
  wonSince?: string;
  /** Only this column's cards, from `offset` on. */
  stage?: PipelineStage;
  /** Cards per column. */
  limit?: number;
  offset?: number;
  /** Part of the company's name, with or without diacritics, in any case. */
  search?: string;
  /** One account type (KEY ACCOUNT, …), or "none" for the customers without one. */
  label?: string;
  /** The sales owner's e-mail, or "none" for the customers that have no owner. */
  owner?: string;
}

// Which customers the search and filters keep; undefined when nothing narrows the board.
function matcher(request: PipelineRequest): ((customer: PipelineCustomer) => boolean) | undefined {
  const search = foldDiacritics(request.search?.trim() ?? "");
  const label = request.label?.trim() ?? "";
  const owner = request.owner?.trim().toLowerCase() ?? "";
  if (!search && !label && !owner) return undefined;
  return (customer) =>
    (!search || foldDiacritics(customer.companyName).includes(search)) &&
    (!label || (label === "none" ? !customer.label : customer.label === label)) &&
    (!owner || (owner === "none" ? !customer.salesOwner.trim() : customer.salesOwner.trim().toLowerCase() === owner));
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

class PipelineService {
  // The customer pipeline: Prospect, Proposal, Won. Nothing of it is stored - customers, quotes
  // and shipments live in three databases, so each service is asked for its facts about the
  // caller's company (the login travels with the calls) and the board is put together here
  // (buildBoard). A service that cannot be asked fails the request: a board with a column
  // missing would pass for one that is empty.
  async board(request: PipelineRequest): Promise<PipelineBoard> {
    const wonSince = request.wonSince || null;
    if (wonSince !== null && !isRealYmd(wonSince)) throw APIError.invalidArgument("wonSince must be a real date (YYYY-MM-DD)");
    if (request.stage !== undefined && !PIPELINE_STAGES.includes(request.stage)) {
      throw APIError.invalidArgument("stage must be prospect, proposal or won");
    }
    const [customerList, quoteFacts, shipmentFacts] = await Promise.all([
      customers._internalCustomerPipelineList(),
      quotes._internalSalesQuoteCustomerFacts(),
      shipments._internalShipmentCustomerFacts(),
    ]);
    return buildBoard(customerList.data, quoteFacts, shipmentFacts, {
      wonSince,
      limit: Math.min(Math.max(Math.trunc(request.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT),
      stage: request.stage,
      offset: Math.max(Math.trunc(request.offset ?? 0), 0),
      match: matcher(request),
    });
  }
}

export const pipelineService = new PipelineService();
