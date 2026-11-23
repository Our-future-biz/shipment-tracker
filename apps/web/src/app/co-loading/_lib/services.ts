// Co-Loading Concept's services as the module shows them: their words and the search through them.
// Pure, so it is tested without React. The server checks the same lists (api lib/coLoadingService).

export const DIRECTION_OPTIONS = [
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
] as const;

export const MODE_OPTIONS = [
  { value: "sea_lcl", label: "Sea LCL" },
  { value: "sea_fcl", label: "Sea FCL" },
  { value: "air", label: "Air" },
  { value: "rail", label: "Rail" },
  { value: "road", label: "Road" },
] as const;

const labelOf = (options: readonly { value: string; label: string }[], value: string) => options.find((o) => o.value === value)?.label ?? value;

export const directionLabel = (value: string) => labelOf(DIRECTION_OPTIONS, value);
export const modeLabel = (value: string) => labelOf(MODE_OPTIONS, value);

export interface ServiceWords {
  name: string;
  /** The shipments' Service Name it stands for: "ISHA". */
  serviceName: string;
  direction: string;
  mode: string;
  origin: string;
  destination: string;
  note: string;
}

/** The service's route, "Shanghai (CNSHA) → Prague (CZPRG)"; one end alone when only one is given. */
export function routeOf(s: Pick<ServiceWords, "origin" | "destination">): string {
  if (s.origin && s.destination) return `${s.origin} → ${s.destination}`;
  if (s.origin) return `From ${s.origin}`;
  if (s.destination) return `To ${s.destination}`;
  return "";
}

/** The line under the tile's name: "ISHA · Import · Sea LCL · From Shanghai (CNSHA)", then the note. */
export const tileLine = (s: ServiceWords): string =>
  [s.serviceName, directionLabel(s.direction), modeLabel(s.mode), routeOf(s)].filter(Boolean).join(" · ");

/**
 * The services the search finds: every word typed is in the name, the Service Name, the direction, the
 * mode, the route or the note, whatever the case ("shanghai lcl" finds Import from Shanghai, "isha" too).
 */
export function searchServices<T extends ServiceWords>(services: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return services;
  return services.filter((s) => {
    const text = [s.name, s.serviceName, directionLabel(s.direction), modeLabel(s.mode), s.origin, s.destination, s.note].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// ─── Who may make, close and reopen services, and what a closed one shows ───

/** Managers and higher make services (New Service), close and reopen them. The server checks the same. */
export const SERVICE_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

export const canManageServices = (role: string | null | undefined): boolean =>
  !!role && (SERVICE_MANAGER_ROLES as readonly string[]).includes(role);

/** "Closed on 23.11.2026 by Lukas Slavik": when and by whom a closed service was closed. */
export function closedLine(s: { closedAt: string | null; closedByName: string }, formatDate: (iso: string) => string): string {
  if (!s.closedAt) return "";
  return `Closed on ${formatDate(s.closedAt)}${s.closedByName ? ` by ${s.closedByName}` : ""}`;
}

/**
 * The services in the order the tiles show them: open ones first, closed ones (a manager's only)
 * after them, each in the order they came.
 */
export const tilesInOrder = <T extends { closedAt: string | null }>(services: T[]): T[] => [
  ...services.filter((s) => !s.closedAt),
  ...services.filter((s) => s.closedAt),
];
