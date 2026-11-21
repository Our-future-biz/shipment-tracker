// The codes shipping lines use for these Chinese ports, which UN/LOCODE 2025-1 gives the city's
// airport ("CNSHA" is "Shanghai Hongqiao International Apt", "CNNGB" "Ningbo Lishe International Apt").
// The place pickers name them as the port the trade means by them (user council O1 / S10, owner's
// answer Q3), and migration 0024 marks them seaports. The location table keeps the release's names:
// matching a written name (tariff ports, document reading) goes on finding "Shanghai" as CNSGH alone,
// as before, instead of two places of one name.
export const CARRIER_PORT_NAMES: Readonly<Record<string, string>> = {
  CNSHA: "Shanghai",
  CNNGB: "Ningbo",
  CNTAO: "Qingdao",
  CNXMN: "Xiamen",
  CNSZX: "Shenzhen",
  CNTSN: "Tianjin",
  CNDLC: "Dalian",
  CNCAN: "Guangzhou",
  CNFOC: "Fuzhou",
  CNNKG: "Nanjing",
  CNWUH: "Wuhan",
  CNYNT: "Yantai",
  CNHAK: "Haikou",
  CNSWA: "Shantou",
};

// The code UN/LOCODE 2025-1 gives the same port's city, the one a tariff's port name is matched to
// ("Shanghai" → CNSGH): a sea quote on CNSHA must find the rates the tariffs hold under CNSGH, and
// one on CNSGH those a tariff may hold under CNSHA (review of user council step 3, M2). Each is the
// release's place named just as the port, in the same province, marked a seaport by 0024.
export const CARRIER_PORT_CODES: Readonly<Record<string, string>> = {
  CNSHA: "CNSGH",
  CNNGB: "CNNBO",
  CNTAO: "CNQIN",
  CNXMN: "CNXAM",
  CNSZX: "CNSNZ",
  CNTSN: "CNTNJ",
  CNDLC: "CNDAL",
  CNCAN: "CNGGZ",
  CNFOC: "CNFZH",
  CNNKG: "CNNJI",
  CNWUH: "CNNHN",
  CNYNT: "CNYAT",
  CNHAK: "CNHKO",
  CNSWA: "CNSTG",
};

const CARRIER_CODE_OF_PORT: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(CARRIER_PORT_CODES).map(([carrier, port]) => [port, carrier]));

/** The codes of one port: the code itself and, for a carrier code or its port's code, the other one (CNSHA ↔ CNSGH). */
export function samePortCodes(code: string): string[] {
  const other = CARRIER_PORT_CODES[code] ?? CARRIER_CODE_OF_PORT[code];
  return other ? [code, other] : [code];
}

/**
 * What a picker says beside a carrier code, so its row and its port's row, both "Shanghai", are told
 * apart: "carrier code for Shanghai port CNSGH". Null for any other code.
 */
export function carrierCodeWhere(code: string): string | null {
  const port = CARRIER_PORT_CODES[code];
  const name = CARRIER_PORT_NAMES[code];
  return port && name ? `carrier code for ${name} port ${port}` : null;
}

/**
 * The carrier codes whose port name starts with the typed text (ASCII-folded, as the pickers search
 * names), so "Shantou" finds CNSWA though the release names it "Jieyang Chaoshan Apt".
 */
export function carrierPortsNamed(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.entries(CARRIER_PORT_NAMES)
    .filter(([, name]) => name.toLowerCase().startsWith(q))
    .map(([code]) => code);
}

/** Whether a Freight Mode ("Sea FCL", "Sea Freight", …) is by sea: only then is a carrier code its port. */
export const isSeaMode = (freightMode: string | null | undefined): boolean => /^sea/i.test(freightMode ?? "");

/**
 * A stored place text as a sea job shows it: a carrier code saved before the pickers named it as
 * its port ("Shanghai Hongqiao International Apt (CNSHA)") reads "Shanghai (CNSHA)". Only on
 * display, by sea: the stored text is left as it is, and an air or road job's CNSHA stays the
 * airport (mock council S4-1). Any other text is returned unchanged.
 */
export function seaPortText(text: string | null | undefined, freightMode: string | null | undefined): string {
  const value = text ?? "";
  if (!isSeaMode(freightMode)) return value;
  const m = /^(.*\S)\s*\(([A-Z]{2}[A-Z0-9]{3})\)\s*$/.exec(value);
  const name = m ? CARRIER_PORT_NAMES[m[2]!] : undefined;
  return m && name && m[1] !== name ? `${name} (${m[2]})` : value;
}
