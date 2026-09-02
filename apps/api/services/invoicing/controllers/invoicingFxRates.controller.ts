import { api, Query } from "encore.dev/api";

/**
 * Serverova proxy na kurzovni listek CNB.
 * Mockup vola api.cnb.cz primo z prohlizece a sam v komentari uvadi, ze to ma
 * jit pres serverovou proxy (prohlizec jinak narazi na CORS). Zde je ta proxy.
 *
 * Zdroj: https://api.cnb.cz/cnbapi/exrates/daily?lang=EN[&date=YYYY-MM-DD]
 * Kurz je uveden na "amount" jednotek (napr. 100 JPY), proto se deli.
 */

/** Zalozni kurzy z mockupu, pouziti kdyz je CNB nedostupna. */
const CNB_FALLBACK: Record<string, number> = { USD: 20.62, EUR: 24.12 };

interface FxRatesRequest {
  /** YYYY-MM-DD; prazdne = aktualni kurzovni listek */
  date?: Query<string>;
}

interface FxRatesResponse {
  /** kurzy v CZK za 1 jednotku meny */
  rates: Record<string, number>;
  /** datum, ke kteremu kurzovni listek plati */
  validFor: string;
  /** true = CNB nedostupna, pouzity zalozni kurzy */
  fallback: boolean;
  /** ISO cislo tydne data platnosti */
  week: number;
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

export const invoicingFxRates = api(
  { expose: true, auth: true, method: "GET", path: "/fx/cnb-rates" },
  async (req: FxRatesRequest): Promise<FxRatesResponse> => {
    const date = (req.date ?? "").trim();
    const url = "https://api.cnb.cz/cnbapi/exrates/daily?lang=EN" + (date ? `&date=${date}` : "");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`CNB responded ${res.status}`);

      const data = (await res.json()) as {
        rates?: { currencyCode: string; rate: number; amount: number; validFor: string }[];
      };
      const list = data.rates ?? [];
      if (!list.length) throw new Error("no rates returned");

      const rates: Record<string, number> = { CZK: 1 };
      for (const r of list) {
        if (r.currencyCode && r.rate) rates[r.currencyCode] = r.rate / (r.amount || 1);
      }
      if (!rates.USD || !rates.EUR) throw new Error("rates missing");

      const validFor = list[0]!.validFor || date;
      return { rates, validFor, fallback: false, week: isoWeek(new Date(validFor)) };
    } catch {
      // CNB nedostupna - vratime zalozni kurzy, aby prepocty fungovaly dal
      const validFor = date || new Date().toISOString().slice(0, 10);
      return {
        rates: { CZK: 1, ...CNB_FALLBACK },
        validFor,
        fallback: true,
        week: isoWeek(new Date(validFor)),
      };
    }
  },
);
