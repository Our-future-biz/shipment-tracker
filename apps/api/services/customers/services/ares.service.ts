import { APIError } from "encore.dev/api";
import type { AresResult } from "../interfaces/interfaces";

const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

interface AresAddress {
  nazevUlice?: string;
  cisloDomovni?: number | string;
  cisloOrientacni?: number | string;
  nazevObce?: string;
  psc?: number | string;
}

interface AresResponse {
  ico?: string;
  dic?: string;
  obchodniJmeno?: string;
  nazev?: string;
  pravniForma?: string;
  sidlo?: AresAddress;
  stavSubjektu?: string;
  datumVzniku?: string;
  czNace?: string[];
}

class AresService {
  async lookup(ico: string): Promise<AresResult> {
    if (!/^\d{8}$/.test(ico)) {
      throw APIError.invalidArgument("ICO must be exactly 8 digits");
    }

    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      res = await fetch(`${ARES_BASE}/${ico}`, {
        headers: { Accept: "application/json", "User-Agent": "ShipmentTracker-CRM/1.0" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      throw APIError.unavailable("ARES registry unavailable");
    }

    if (res.status === 404 || res.status === 204) {
      throw APIError.notFound("Company not found in ARES registry");
    }
    if (!res.ok) {
      throw APIError.unavailable(`ARES registry error (HTTP ${res.status})`);
    }

    let json: AresResponse;
    try {
      json = (await res.json()) as AresResponse;
    } catch {
      throw APIError.internal("Failed to parse ARES response");
    }

    const adresa = json.sidlo ?? {};
    const houseNumber = adresa.cisloDomovni
      ? `${adresa.cisloDomovni}${adresa.cisloOrientacni ? "/" + adresa.cisloOrientacni : ""}`
      : "";

    return {
      ico: json.ico ?? ico,
      dic: json.dic ?? "",
      companyName: json.obchodniJmeno ?? json.nazev ?? "",
      legalForm: json.pravniForma ?? "",
      registeredAddress: [adresa.nazevUlice, houseNumber, adresa.nazevObce, adresa.psc]
        .filter(Boolean)
        .join(", "),
      city: adresa.nazevObce ?? "",
      country: "CZ",
      companyStatus: json.stavSubjektu ?? "Active",
      registrationDate: json.datumVzniku ? String(json.datumVzniku).split("T")[0] : "",
      nace: json.czNace ? json.czNace.join(", ") : "",
    };
  }
}

export const aresService = new AresService();
