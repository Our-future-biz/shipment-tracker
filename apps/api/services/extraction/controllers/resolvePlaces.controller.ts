import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { resolveGeo, type GeoItem } from "../services/places.service";

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
    return { values: await resolveGeo(req.items) };
  },
);
