// How a master job is named by its mode and filling (mock test council n31), as the server words it (apps/api
// shipments lib/masterJobKind kindShipments, masterJobMode).

/**
 * Shipments of a Load Type in words: "Full Load shipments", "Consolidation shipments" - but "Single Shipments" and
 * "Project Shipments", never "Single Shipment shipments".
 */
export const kindShipments = (name: string): string => (/shipment$/i.test(name.trim()) ? `${name.trim()}s` : `${name.trim()} shipments`);

/**
 * The freight mode a master job goes by: its own, else - while it has none - the one mode its shipments share
 * (the server's `houseFreightMode`), so a master job of air houses with no Freight Mode is not named or served as
 * sea. "" when neither says.
 */
export const masterJobModeOf = (mj: { freightMode?: string | null; houseFreightMode?: string | null }): string =>
  (mj.freightMode ?? "").trim() || (mj.houseFreightMode ?? "").trim();
