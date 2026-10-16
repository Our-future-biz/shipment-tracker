import type { interfaces } from "@/lib/api/client";

type Basis = interfaces.JobProfitRow["basis"];

const LABELS: Record<Basis, string> = {
  ata: "ATA",
  atd: "ATD",
  eta: "ETA",
  etd: "ETD",
  delivery: "Delivered",
  "planned delivery": "Planned delivery",
};

/** How a job's period was dated, as shown next to the month: "ATA", "Delivered" (a road job), … */
export const periodBasisLabel = (basis: Basis): string => LABELS[basis] ?? basis.toUpperCase();

/** Why a provisional period may still move. */
export const provisionalText = (basis: Basis): string =>
  basis === "planned delivery" ? "Not delivered yet — placed by the planned delivery date and may move" : "No ATA / ATD yet — placed by ETA / ETD and may move";
