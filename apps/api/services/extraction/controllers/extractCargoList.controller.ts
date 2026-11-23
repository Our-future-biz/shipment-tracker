import { api, APIError } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CargoLineRead } from "../lib/cargoList";
import { chargeReading } from "../lib/readingBudget";
import { readCargoFile, readCargoText } from "../services/cargoList.service";

interface ExtractCargoListRequest {
  /** A pasted cargo list. Give this or a file, not both. */
  text?: string & MaxLen<100000>;
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
export const extractCargoList = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/cargo-list", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractCargoListRequest): Promise<ExtractCargoListResponse> => {
    const text = req.text?.trim() ?? "";
    const hasFile = !!req.fileBase64 && !!req.fileName;
    if (hasFile === (text.length > 0)) throw APIError.invalidArgument("Give either a file or a text to read");
    if (!hasFile && text.length < 10) throw APIError.invalidArgument("The text is too short to hold a cargo list");
    // One paid Claude read: counted against the user's hourly reading budget.
    chargeReading(getAuthData()!.userID, 1);
    return hasFile ? readCargoFile(req.fileBase64!, req.fileName!) : readCargoText(text);
  },
);
