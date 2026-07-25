// Ported from the POC CustomerProfileDetail: derive cargo/industry/risk from ARES data.

export type RiskLevel = "Low" | "Medium" | "High";

interface NaceEntry {
  label: string;
  cargo: string;
  risk: RiskLevel;
}

const NACE_MAP: Record<string, NaceEntry> = {
  "01": { label: "Agriculture", cargo: "Agricultural products", risk: "Low" },
  "10": { label: "Food manufacturing", cargo: "Food / Perishables", risk: "Low" },
  "20": { label: "Chemicals", cargo: "Chemicals / Hazmat", risk: "High" },
  "21": { label: "Pharmaceuticals", cargo: "Pharma / Temp-controlled", risk: "Medium" },
  "23": { label: "Non-metallic minerals", cargo: "Stone / Glass / Ceramics", risk: "Low" },
  "24": { label: "Basic metals", cargo: "Steel / Metals", risk: "Medium" },
  "25": { label: "Fabricated metal products", cargo: "Metal parts", risk: "Low" },
  "26": { label: "Electronics / ICT", cargo: "Electronics / Hi-tech", risk: "Medium" },
  "28": { label: "Machinery", cargo: "Industrial machinery", risk: "Low" },
  "29": { label: "Automotive", cargo: "Vehicles / Auto parts", risk: "Medium" },
  "46": { label: "Wholesale trade", cargo: "Mixed goods", risk: "Low" },
  "47": { label: "Retail trade", cargo: "Consumer goods", risk: "Low" },
  "49": { label: "Land transport", cargo: "Logistics services", risk: "Low" },
  "52": { label: "Warehousing / Logistics", cargo: "Logistics services", risk: "Low" },
  "62": { label: "IT / Software", cargo: "Electronics / Equipment", risk: "Low" },
  "64": { label: "Financial services", cargo: "Documents", risk: "Low" },
  G: { label: "Wholesale & Retail trade", cargo: "Mixed goods", risk: "Low" },
};

export interface NaceHit extends NaceEntry {
  code: string;
}

export function parseNaceCodes(nace: string): string[] {
  if (!nace) return [];
  return nace.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getNaceInfo(codes: string[]): { primary: NaceHit | null; secondary: NaceHit[] } {
  const results = codes
    .map((code) => {
      const e = NACE_MAP[code] ?? NACE_MAP[code.slice(0, 2)] ?? NACE_MAP[code.slice(0, 1)];
      return e ? { ...e, code } : null;
    })
    .filter((x): x is NaceHit => !!x);
  return { primary: results[0] ?? null, secondary: results.slice(1) };
}

export function calcCompanyAge(regDate: string): { years: number; label: string } {
  if (!regDate) return { years: 0, label: "—" };
  const years = Math.floor((Date.now() - new Date(regDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25));
  return { years, label: years <= 0 ? "< 1 year" : `${years} years` };
}

export function calcRisk(
  status: string,
  regDate: string,
  naceInfo: { primary: NaceHit | null; secondary: NaceHit[] },
): { level: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  let level: RiskLevel = "Low";
  const { years } = calcCompanyAge(regDate);
  if (status && !status.toLowerCase().includes("active")) {
    reasons.push("Registry status: " + status);
    level = "High";
  }
  if (years < 2 && regDate) {
    reasons.push("New company (< 2 years)");
    if (level === "Low") level = "Medium";
  }
  if (naceInfo.primary?.risk === "High") {
    level = "High";
    reasons.push("High-risk industry");
  } else if (naceInfo.primary?.risk === "Medium" && level === "Low") {
    level = "Medium";
  }
  return { level, reasons };
}

export const RISK_COLOR: Record<RiskLevel, { bg: string; text: string }> = {
  Low: { bg: "#dcfce7", text: "#16a34a" },
  Medium: { bg: "#fef3c7", text: "#d97706" },
  High: { bg: "#fee2e2", text: "#dc2626" },
};
