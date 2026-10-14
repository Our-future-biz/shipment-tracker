// Job profit for reports, in CZK at a FIXED rate per period (owner decision, 14 Oct 2026):
// each foreign-currency amount is converted at the ČNB average of the month the job falls in
// (mean of that month's fixing days, without the ROE %). A job falls in the month of its tax
// date — ATA for imports, ATD for exports — or, until that is known, of its ETA / ETD
// (provisional). Line rules are those of Costs Breakdown: qty × amount (blank qty = 1);
// buying counts the real cost once filled, otherwise the estimate; selling counts only rows
// ticked "invoice". An amount whose currency has no average is left out and reported.

export interface ReportShipment {
  id: string;
  jobNumber: string;
  customer: string;
  freightMode: string;
  status: string;
  tradeDirection: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  actualArrival: string | null;
  actualDeparture: string | null;
}

export interface ReportBuyRow {
  shipmentId: string;
  estQty: string | null;
  estAmount: string | null;
  estCurrency: string;
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
}

export interface ReportSellRow {
  shipmentId: string;
  qty: string | null;
  amount: string | null;
  currency: string;
  invoice: boolean;
}

// Month (YYYY-MM) → currency → CZK per 1 unit.
export type MonthAverages = Map<string, Record<string, number>>;

export interface JobProfitRow {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  freightMode: string;
  status: string;
  direction: "import" | "export";
  basis: "ata" | "atd" | "eta" | "etd";
  date: string;
  month: string;
  provisional: boolean; // dated by ETA / ETD, not yet by the tax date
  revenueCzk: number;
  costCzk: number;
  profitCzk: number;
  unconverted: string[]; // currencies left out (no average for that month)
}

const n = (v: string | null | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function jobPeriod(s: ReportShipment): { basis: JobProfitRow["basis"]; date: string; provisional: boolean } | null {
  const exp = s.tradeDirection.trim().toLowerCase() === "export";
  const actual = exp ? s.actualDeparture : s.actualArrival;
  if (actual) return { basis: exp ? "atd" : "ata", date: actual.slice(0, 10), provisional: false };
  const est = exp ? s.estimatedDeparture : s.estimatedArrival;
  if (est) return { basis: exp ? "etd" : "eta", date: est.slice(0, 10), provisional: true };
  return null;
}

export function buildJobProfit(
  shipments: ReportShipment[],
  buys: ReportBuyRow[],
  sells: ReportSellRow[],
  averages: MonthAverages,
  fromMonth: string,
  toMonth: string,
): { rows: JobProfitRow[]; undated: number } {
  const buyBy = new Map<string, ReportBuyRow[]>();
  for (const b of buys) buyBy.set(b.shipmentId, [...(buyBy.get(b.shipmentId) ?? []), b]);
  const sellBy = new Map<string, ReportSellRow[]>();
  for (const s of sells) sellBy.set(s.shipmentId, [...(sellBy.get(s.shipmentId) ?? []), s]);

  const rows: JobProfitRow[] = [];
  let undated = 0;
  for (const s of shipments) {
    const period = jobPeriod(s);
    if (!period) {
      undated += 1;
      continue;
    }
    const month = period.date.slice(0, 7);
    if (month < fromMonth || month > toMonth) continue;

    const rates = averages.get(month) ?? {};
    const unconverted = new Set<string>();
    const toCzk = (amount: number, currency: string): number => {
      if (!amount) return 0;
      const cur = (currency || "CZK").toUpperCase();
      if (cur === "CZK") return amount;
      const r = rates[cur];
      if (!r) {
        unconverted.add(cur);
        return 0;
      }
      return amount * r;
    };

    let costCzk = 0;
    for (const b of buyBy.get(s.id) ?? []) {
      const real = n(b.realAmount) * (n(b.realQty) || 1);
      costCzk += real ? toCzk(real, b.realCurrency) : toCzk(n(b.estAmount) * (n(b.estQty) || 1), b.estCurrency);
    }
    let revenueCzk = 0;
    for (const r of sellBy.get(s.id) ?? []) {
      if (r.invoice) revenueCzk += toCzk(n(r.amount) * (n(r.qty) || 1), r.currency);
    }

    rows.push({
      shipmentId: s.id,
      jobNumber: s.jobNumber,
      customer: s.customer,
      freightMode: s.freightMode,
      status: s.status,
      direction: s.tradeDirection.trim().toLowerCase() === "export" ? "export" : "import",
      basis: period.basis,
      date: period.date,
      month,
      provisional: period.provisional,
      revenueCzk: Math.round(revenueCzk * 100) / 100,
      costCzk: Math.round(costCzk * 100) / 100,
      profitCzk: Math.round((revenueCzk - costCzk) * 100) / 100,
      unconverted: [...unconverted].sort(),
    });
  }
  rows.sort((a, b) => (a.date === b.date ? a.jobNumber.localeCompare(b.jobNumber) : b.date.localeCompare(a.date)));
  return { rows, undated };
}
