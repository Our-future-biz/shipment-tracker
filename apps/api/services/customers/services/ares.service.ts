import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { AresResult, AresSearchHit } from "../interfaces/interfaces";

const ARES_BASE = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";
// Commercial register (veřejný rejstřík) - holds the file number printed on invoices.
const ARES_VR = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty-vr";

interface AresAddress {
  nazevUlice?: string;
  cisloDomovni?: number | string;
  cisloOrientacni?: number | string;
  cisloOrientacniPismeno?: string;
  nazevObce?: string;
  nazevCastiObce?: string;
  nazevMestskehoObvodu?: string;
  kodStatu?: string;
  psc?: number | string;
}

export interface AresResponse {
  ico?: string;
  dic?: string;
  obchodniJmeno?: string;
  nazev?: string;
  pravniForma?: string;
  sidlo?: AresAddress;
  datumVzniku?: string;
  czNace?: string[];
  seznamRegistraci?: { stavZdrojeDph?: string };
}

export interface AresVrResponse {
  zaznamy?: {
    primarniZaznam?: boolean;
    spisovaZnacka?: { soud?: string; oddil?: string; vlozka?: number | string; datumVymazu?: string }[];
  }[];
}

/** Registry courts as printed on an invoice ("vedená u …"). */
const COURTS: Record<string, string> = {
  MSPH: "Městského soudu v Praze",
  KSBR: "Krajského soudu v Brně",
  KSOS: "Krajského soudu v Ostravě",
  KSPL: "Krajského soudu v Plzni",
  KSUL: "Krajského soudu v Ústí nad Labem",
  KSHK: "Krajského soudu v Hradci Králové",
  KSCB: "Krajského soudu v Českých Budějovicích",
};

/** 17000 -> "170 00" */
function formatPostalCode(psc: number | string | undefined): string {
  const digits = String(psc ?? "").replace(/\D/g, "");
  return digits.length === 5 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** ARES names sometimes carry repeated spaces ("VIENNA INTERNATIONAL   a.s."). */
const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** Parses the main ARES record. Pure, so it is unit-tested with a real response. */
export function parseAres(json: AresResponse, ico: string): AresResult {
  const adresa = json.sidlo ?? {};
  const orientacni = adresa.cisloOrientacni ? `${adresa.cisloOrientacni}${adresa.cisloOrientacniPismeno ?? ""}` : "";
  const houseNumber = adresa.cisloDomovni ? `${adresa.cisloDomovni}${orientacni ? "/" + orientacni : ""}` : "";
  // villages without street names are addressed by the part of the municipality
  const streetName = adresa.nazevUlice ?? (adresa.nazevCastiObce !== adresa.nazevObce ? adresa.nazevCastiObce : adresa.nazevObce);

  return {
    ico: json.ico ?? ico,
    dic: json.dic ?? "",
    companyName: clean(json.obchodniJmeno ?? json.nazev),
    legalForm: json.pravniForma ?? "",
    registeredAddress: [adresa.nazevUlice, houseNumber, adresa.nazevObce, adresa.psc]
      .filter(Boolean)
      .join(", "),
    city: adresa.nazevObce ?? "",
    country: adresa.kodStatu || "CZ",
    registrationDate: json.datumVzniku ? String(json.datumVzniku).split("T")[0] : "",
    nace: json.czNace ? json.czNace.join(", ") : "",
    street: [streetName, houseNumber].filter(Boolean).join(" "),
    // "Praha 7" rather than "Praha" - the district is part of a Prague postal address
    postalCity: adresa.nazevMestskehoObvodu ?? adresa.nazevObce ?? "",
    postalCode: formatPostalCode(adresa.psc),
    vatPayer: json.seznamRegistraci?.stavZdrojeDph === "AKTIVNI",
    registerEntry: "",
  };
}

/** "B 8573 vedená u Městského soudu v Praze", from the current file number of the register. */
export function registerEntryFrom(vr: AresVrResponse): string {
  const record = vr.zaznamy?.find((z) => z.primarniZaznam) ?? vr.zaznamy?.[0];
  const current = record?.spisovaZnacka?.filter((s) => !s.datumVymazu).at(-1);
  if (!current?.oddil || !current.vlozka) return "";
  const court = current.soud ? COURTS[current.soud] ?? current.soud : "";
  return `${current.oddil} ${current.vlozka}${court ? ` vedená u ${court}` : ""}`;
}

/** At most this many companies are offered for a name. */
export const ARES_SEARCH_LIMIT = 10;

interface AresSearchResponse {
  ekonomickeSubjekty?: { ico?: string; obchodniJmeno?: string; sidlo?: { textovaAdresa?: string }; datumZaniku?: string }[];
}

/** The companies of a name search that still exist. Pure, so it is unit-tested. */
export function parseAresSearch(json: AresSearchResponse): AresSearchHit[] {
  return (json.ekonomickeSubjekty ?? [])
    .filter((subject) => subject.ico && !subject.datumZaniku)
    .map((subject) => ({
      ico: subject.ico!,
      companyName: clean(subject.obchodniJmeno),
      address: subject.sidlo?.textovaAdresa ?? "",
    }));
}

async function fetchJson(url: string, timeoutMs: number, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        "User-Agent": "ShipmentTracker-CRM/1.0",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Register entry, or "" - sole traders have none, and a slow register must not block the lookup. */
async function lookupRegisterEntry(ico: string): Promise<string> {
  try {
    const res = await fetchJson(`${ARES_VR}/${ico}`, 5000);
    return res.ok ? registerEntryFrom((await res.json()) as AresVrResponse) : "";
  } catch (err) {
    log.warn("ARES register lookup failed", { ico, error: err instanceof Error ? err.message : String(err) });
    return "";
  }
}

/**
 * Whether ARES refused a search because the name fits too many companies. ARES answers with a
 * JSON error whose code/description names it ("…PRILIS_MNOHO…", "příliš mnoho"); matched loosely,
 * so a reworded description still counts. Pure, so it is unit-tested.
 */
export function isTooManyAnswer(body: string): boolean {
  return /PRILIS_MNOHO|p[řr][íi]li[šs]\s+mnoho|too many/i.test(body);
}

/**
 * Registry searches per company per minute. Kept in this process only: with several instances
 * each allows this many - a brake on runaway typing loops, not an exact quota.
 */
export const SEARCHES_PER_MINUTE = 30;
const searchLog = new Map<string, number[]>();

export function searchAllowed(companyId: string, now = Date.now()): boolean {
  const recent = (searchLog.get(companyId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= SEARCHES_PER_MINUTE) {
    searchLog.set(companyId, recent);
    return false;
  }
  recent.push(now);
  searchLog.set(companyId, recent);
  return true;
}

class AresService {
  // Companies whose name contains the text, to pick one before its record is read by IČO.
  async search(companyId: string, name: string): Promise<{ companies: AresSearchHit[]; tooMany: boolean }> {
    const text = name.trim();
    if (text.length < 3) throw APIError.invalidArgument("Type at least 3 characters of the company name");
    if (!searchAllowed(companyId)) throw APIError.resourceExhausted("Too many registry searches — wait a minute and try again");
    let res: Response;
    try {
      res = await fetchJson(`${ARES_BASE}/vyhledat`, 8000, { obchodniJmeno: text, pocet: ARES_SEARCH_LIMIT, start: 0 });
    } catch (err) {
      log.warn("ARES search failed", { name: text, error: err instanceof Error ? err.message : String(err) });
      throw APIError.unavailable("ARES registry unavailable");
    }
    if (res.status === 400) {
      // A name too general for ARES (over 1,000 companies) is refused with 400 rather than listed;
      // any other 400 (e.g. characters ARES does not take) is not "too many".
      const body = await res.text().catch(() => "");
      if (isTooManyAnswer(body)) return { companies: [], tooMany: true };
      log.warn("ARES search refused the name", { name: text, body: body.slice(0, 300) });
      throw APIError.invalidArgument("The registry cannot search for this name — try other words");
    }
    if (!res.ok) {
      log.warn("ARES search returned an error", { name: text, status: res.status });
      throw APIError.unavailable("ARES registry is not answering, try again later");
    }
    let json: AresSearchResponse;
    try {
      json = (await res.json()) as AresSearchResponse;
    } catch (err) {
      log.error(err, "ARES search response is not JSON", { name: text });
      throw APIError.internal("Failed to parse ARES response");
    }
    return { companies: parseAresSearch(json), tooMany: false };
  }

  async lookup(ico: string): Promise<AresResult> {
    if (!/^\d{8}$/.test(ico)) {
      throw APIError.invalidArgument("ICO must be exactly 8 digits");
    }

    const registerEntry = lookupRegisterEntry(ico);
    let res: Response;
    try {
      res = await fetchJson(`${ARES_BASE}/${ico}`, 8000);
    } catch (err) {
      log.warn("ARES lookup failed", { ico, error: err instanceof Error ? err.message : String(err) });
      throw APIError.unavailable("ARES registry unavailable");
    }

    if (res.status === 404 || res.status === 204) {
      throw APIError.notFound("Company not found in ARES registry");
    }
    if (!res.ok) {
      log.warn("ARES returned an error", { ico, status: res.status });
      throw APIError.unavailable("ARES registry is not answering, try again later");
    }

    let json: AresResponse;
    try {
      json = (await res.json()) as AresResponse;
    } catch (err) {
      log.error(err, "ARES response is not JSON", { ico });
      throw APIError.internal("Failed to parse ARES response");
    }

    return { ...parseAres(json, ico), registerEntry: await registerEntry };
  }
}

export const aresService = new AresService();
