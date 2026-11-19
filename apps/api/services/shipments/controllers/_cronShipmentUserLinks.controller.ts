import { api } from "encore.dev/api";
import type { UserLinksBackfillResult } from "../interfaces/interfaces";
import { shipmentUserLinksService } from "../services/shipmentUserLinks.service";

// Called by the cron only (expose: false), without a login: fills the users' ids beside Handled By
// and Holiday Cover on every company's live jobs (services/shipmentUserLinks.service). Safe to run again.
export const _cronShipmentUserLinks = api(
  { expose: false, auth: false, method: "POST", path: "/internal/shipments/user-links/backfill" },
  async (): Promise<UserLinksBackfillResult> => shipmentUserLinksService.backfillAll(),
);
