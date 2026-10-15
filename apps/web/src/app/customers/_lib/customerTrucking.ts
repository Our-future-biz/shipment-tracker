import type { TariffListItem } from "@/hooks/useTrucking";
import { SCOPE_LABELS } from "@/app/trucking/_lib/tariffs";

// Which trucking price lists a customer's consignments are priced with, for the Trucking tab of
// the Customer Database: per scope the customer's own sell tariff (a matrix or a discount on
// Standard), else the Standard list; and a haulier's buy tariffs.

export interface PriceListUsed {
  scope: TariffListItem["scope"];
  /** The tariff that prices this scope for the customer. */
  tariff: TariffListItem;
  /** The customer's own list; false = the Standard list, used for want of one. */
  own: boolean;
  /** The Standard list of the scope, which a discount follows; null when there is none. */
  standard: TariffListItem | null;
}

const SCOPES = Object.keys(SCOPE_LABELS) as TariffListItem["scope"][];

/** Per scope that has any sell list: the customer's own one when it has one, else the Standard list. */
export function priceListsUsed(tariffs: readonly TariffListItem[], customerId: string): PriceListUsed[] {
  const sell = tariffs.filter((t) => t.side === "SELL");
  return SCOPES.flatMap((scope): PriceListUsed[] => {
    const standard = sell.find((t) => t.scope === scope && !t.ownerCustomerId) ?? null;
    const own = sell.find((t) => t.scope === scope && t.ownerCustomerId === customerId);
    if (own) return [{ scope, tariff: own, own: true, standard }];
    return standard ? [{ scope, tariff: standard, own: false, standard }] : [];
  });
}

/** A haulier's buy tariffs, by scope. */
export function haulierBuyTariffs(tariffs: readonly TariffListItem[], customerId: string): TariffListItem[] {
  return tariffs
    .filter((t) => t.side === "BUY" && t.ownerCustomerId === customerId)
    .sort((a, b) => SCOPES.indexOf(a.scope) - SCOPES.indexOf(b.scope) || a.name.localeCompare(b.name, "cs"));
}
