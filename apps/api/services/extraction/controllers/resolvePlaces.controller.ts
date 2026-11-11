import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { resolveGeo, type GeoItem } from "../services/places.service";
import { chargeReading } from "../lib/readingBudget";

interface ResolvePlacesRequest {
  items: GeoItem[] & MaxLen<50>;
}
interface ResolvePlacesResponse {
  // Per item, its form in the database ("Hamburg (DEHAM)", "Germany (DE)", "DE"), or null.
  values: (string | null)[];
}

// Matches typed or pasted places and countries (e.g. an imported inquiry) to the database.
export const resolvePlaces = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/places/resolve" },
  async (req: ResolvePlacesRequest): Promise<ResolvePlacesResponse> => {
    // Matched in the database for free; asking the AI is a paid call, counted like a page read.
    const userID = getAuthData()!.userID;
    return { values: await resolveGeo(req.items, { beforeAi: () => chargeReading(userID, 1) }) };
  },
);
