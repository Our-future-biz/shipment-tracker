import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CargoLineRead } from "../lib/cargoList";
import { readCargoList } from "../services/cargoList.service";

interface ExtractCargoListRequest {
  /** A pasted cargo list. Give this or a file, not both. */
  text?: string & MaxLen<100000>;
  /** The file, at most 20 MB; a picture at most 5 MB. */
  fileBase64?: string;
  fileName?: string & MaxLen<300>;
}

interface ExtractCargoListResponse {
  lines: CargoLineRead[];
  /** The document was longer than one reading takes, or the reply was cut off: lines may be missing. */
  partial: boolean;
}

// The Loading Planner's reader: the cargo lines of a packing list, a quote request or a pasted
// e-mail. It only reads - the planner shows the lines for checking before any is added to a plan.
// One paid Claude reading, counted against the user's hourly budget once the request cannot be
// refused without it (cargoList.service). The body limit is a 20 MB file written as base64, with
// room for the rest of the request.
export const extractCargoList = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/cargo-list", bodyLimit: 30 * 1024 * 1024 },
  async (req: ExtractCargoListRequest): Promise<ExtractCargoListResponse> => {
    return readCargoList(getAuthData()!.userID, req);
  },
);
