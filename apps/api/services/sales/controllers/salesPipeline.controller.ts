import { api } from "encore.dev/api";
import { pipelineService } from "../services/pipeline.service";
import type { PipelineBoard } from "../interfaces/interfaces";

interface SalesPipelineRequest {
  /**
   * The Won column holds the customers whose first shipment was created on this day or later
   * (YYYY-MM-DD, the day in Prague). Left out = all time. The other columns do not depend on it.
   */
  wonSince?: string;
  /** Only this column's cards, from `offset` on: the way to fetch more of a column that was cut. */
  stage?: "prospect" | "proposal" | "won";
  /** Cards per column: 100 when left out, at most 500. */
  limit?: number;
  /** With `stage`: how many cards of that column to skip. */
  offset?: number;
}

/**
 * The customer pipeline: every customer of the company on the stage its quotes and shipments put
 * it on - Prospect (interested, no quote sent yet), Proposal (a quote was sent), Won (a shipment
 * was ordered) - with its open quotes and last activity. `totals` count whole columns; `cards`
 * are cut to the limit; `notes` count what cannot be placed. Read-only: nothing is written, the
 * status on a customer record is neither read as a stage nor changed.
 */
export const salesPipeline = api(
  { expose: true, auth: true, method: "GET", path: "/sales/pipeline" },
  async (req: SalesPipelineRequest): Promise<PipelineBoard> => {
    return pipelineService.board(req);
  },
);
