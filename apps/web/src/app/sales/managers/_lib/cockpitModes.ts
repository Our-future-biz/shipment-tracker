import type { SalesCockpitMode } from "@/hooks/useSalesManagersCockpit";

// The freight modes Sales → Managers is filtered by, kept in the address (?mode=).
export const COCKPIT_MODES: { key: SalesCockpitMode; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sea", label: "Sea" },
  { key: "air", label: "Air" },
  { key: "rail", label: "Rail" },
  { key: "road", label: "Road" },
];

// The quotes' freight modes each one counts: the server's MODES (apps/api/services/sales/utils/managersCockpit.utils.ts),
// which counts the cockpit's tiles - keep the two in step, so the Quote inquiries list a tile opens
// lists what the tile counted.
const MODE_SERVICES: Record<Exclude<SalesCockpitMode, "all">, readonly string[]> = {
  sea: ["Sea FCL", "Sea LCL", "Sea Break Bulk"],
  air: ["Air"],
  rail: ["Rail"],
  road: ["Road"],
};

/** The mode an address names, or All. */
export const cockpitModeOf = (value: string | null): SalesCockpitMode => COCKPIT_MODES.find((m) => m.key === value)?.key ?? "all";

/** Whether a quote of this freight mode is counted in `mode`. */
export const inCockpitMode = (serviceType: string, mode: SalesCockpitMode): boolean => mode === "all" || MODE_SERVICES[mode].includes(serviceType);
