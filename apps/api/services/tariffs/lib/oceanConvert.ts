import type { OceanEquipment, OceanLayout, OceanRateRow, TariffFinding } from "../interfaces/interfaces";
import { splitPorts, type PortToken } from "./oceanPorts";
import { Findings, parsePrice } from "./railConvert";
import { type Sheet, cellText } from "./sheet";

// A shipping line's tariff file turned into rate rows by its layout, and checked: every sheet row
// of a rate table gives a row per port of loading × port of discharge it names, its prices by
// container and its currency (the row's, the cell format's, or the table's). Every figure is read
// by code, never retyped by the AI.

/** A port name of the file, as matching needs it: which side, the country the file names with it, the countries its table is in. */
export interface PortNeed {
  side: "pol" | "pod";
  name: string;
  countryHint: string | null;
  countries: string[];
}

export interface OceanConversion {
  rates: OceanRateRow[];
  ports: PortNeed[];
  findings: TariffFinding[];
}

const portKey = (side: string, name: string) => `${side}|${name}`;

/** Every rate row of the file by the layout, the port names it uses, and what the checks found. */
export function convertOcean(sheets: Sheet[], layout: OceanLayout): OceanConversion {
  const found = new Findings();
  const rates: OceanRateRow[] = [];
  const ports = new Map<string, PortNeed>();
  const need = (side: "pol" | "pod", t: PortToken, countries: string[]) => {
    const key = portKey(side, t.name);
    const known = ports.get(key);
    if (!known) ports.set(key, { side, name: t.name, countryHint: t.country, countries });
    else if (!known.countryHint && t.country) known.countryHint = t.country;
  };

  layout.tables.forEach((table, tableNo) => {
    const sheet = sheets.find((s) => s.name === table.sheet);
    if (!sheet) return;
    const last = table.lastDataRow ?? sheet.rowCount;
    let rows = 0;
    for (const [rowNo, cells] of [...sheet.rows.entries()].filter(([r]) => r >= table.firstDataRow && r <= last).sort(([a], [b]) => a - b)) {
      const podText = cellText(cells[table.pod]);
      const priced = table.prices.map((p) => ({ ...p, cell: parsePrice(cells[p.column]) }));
      const numbers = priced.filter((p) => p.cell.kind === "price");
      // A blank row, a heading or a remark between the rates: nothing to read.
      if (!numbers.length && (!podText || priced.every((p) => p.cell.kind !== "text"))) continue;
      if (!podText) {
        found.add("warning", "rate_without_pod", `${table.label}: a row with prices but no port of discharge in column ${table.pod} is left out`, rowNo, table.pod);
        continue;
      }
      if (!numbers.length) {
        found.add("warning", "rate_without_price", `${table.label}: a row without any price is left out (e.g. "on request")`, rowNo);
        continue;
      }
      const prices: Partial<Record<OceanEquipment, number>> = {};
      for (const p of numbers) {
        const amount = (p.cell as { amount: number }).amount;
        if (amount <= 0) found.add("error", "price_not_positive", `${table.label}: a price in column ${p.column} (${p.label}) is 0 or less`, rowNo, p.column);
        else prices[p.equipment] = amount;
      }
      for (const p of priced) {
        if (p.cell.kind === "text") found.add("warning", "price_text", `${table.label}: column ${p.column} (${p.label}) has text instead of a price; that container is not priced on the row`, rowNo, p.column);
      }
      // The row's currency: its own column, else the format of its first price, else the table's.
      const formatted = numbers.map((p) => sheet.currencies?.get(rowNo)?.[p.column]).find(Boolean);
      const currency = (table.currency ? cellText(cells[table.currency]).toUpperCase() : "") || formatted || table.currencyFixed || "";
      if (!/^[A-Z]{3}$/.test(currency)) {
        found.add("error", "currency_unreadable", `${table.label}: the row's currency is not a code such as USD or EUR`, rowNo, table.currency ?? undefined);
        continue;
      }
      const pols = splitPorts(table.pol ? cellText(cells[table.pol]) : (table.polFixed ?? ""));
      const pods = splitPorts(podText);
      if (!pols.length) {
        found.add("error", "no_pol", `${table.label}: a row names no port of loading`, rowNo, table.pol ?? undefined);
        continue;
      }
      const via = table.via ? cellText(cells[table.via]) : "";
      const remark = table.note ? cellText(cells[table.note]) : "";
      for (const pol of pols) need("pol", pol, []);
      for (const pod of pods) need("pod", pod, table.podCountries);
      for (const pol of pols) {
        for (const pod of pods) {
          rates.push({ table: tableNo, rowNo, polName: pol.name, podName: pod.name, via, currency, prices, note: [pod.note, pol.note, remark].filter(Boolean).join("; ") });
        }
      }
      rows += 1;
    }
    if (!rows) found.add("error", "no_rates", `${table.label}: no rate rows found between row ${table.firstDataRow} and ${table.lastDataRow ?? "the end"}`);
  });
  return { rates, ports: [...ports.values()], findings: found.list() };
}
