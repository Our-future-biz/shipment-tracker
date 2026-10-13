import { api, APIError } from "encore.dev/api";
import { resolveGeo, type GeoItem } from "../services/places.service";

interface ResolvePlacesRequest {
  items: GeoItem[];
}
interface ResolvePlacesResponse {
  // Per item, its form in the database ("Hamburg (DEHAM)", "Germany (DE)", "DE"), or null.
  values: (string | null)[];
}

// Matches typed or pasted places and countries (e.g. an imported inquiry) to the database.
export const resolvePlaces = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/places/resolve" },
  async (req: ResolvePlacesRequest): Promise<ResolvePlacesResponse> => {
    if (!Array.isArray(req.items) || req.items.length > 50) {
      throw APIError.invalidArgument("items must be a list of at most 50");
    }
    return { values: await resolveGeo(req.items) };
  },
);
