import { api, APIError } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { cargoFileProblem, type CargoLineRead } from "../lib/cargoList";
import { chargeReading } from "../lib/readingBudget";
import { readCargoFile, readCargoText } from "../services/cargoList.service";

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
// The body limit is a 20 MB file written as base64, with room for the rest of the request.
export const extractCargoList = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/cargo-list", bodyLimit: 30 * 1024 * 1024 },
  async (req: ExtractCargoListRequest): Promise<ExtractCargoListResponse> => {
    const text = req.text?.trim() ?? "";
    const hasFile = !!req.fileBase64 && !!req.fileName;
    if (hasFile === (text.length > 0)) throw APIError.invalidArgument("Choose a file or paste a text, not both.");
    if (!hasFile && text.length < 10) throw APIError.invalidArgument("The text is too short to hold a cargo list.");
    // What can be told without reading - the kind of file, its size - is refused before a reading is counted.
    const problem = hasFile ? cargoFileProblem(req.fileName!, req.fileBase64!) : null;
    if (problem) throw APIError.invalidArgument(problem);
    // One paid Claude read: counted against the user's hourly reading budget.
    chargeReading(getAuthData()!.userID, 1);
    return hasFile ? readCargoFile(req.fileBase64!, req.fileName!) : readCargoText(text);
  },
);
