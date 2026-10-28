// The sections of Tariffs, in the order the sidebar lists them. A section's title is its label, so
// the menu and the page say the same words.

interface TariffPage {
  label: string;
  path: string;
}

export const TARIFF_PAGES = {
  railOperators: { label: "Rail Operators", path: "/tariffs/rail-operators" },
  collections: { label: "Last / First Mile Collections", path: "/tariffs/collections" },
  shippingLines: { label: "Shipping Lines", path: "/tariffs/shipping-lines" },
} satisfies Record<string, TariffPage>;

// The Tariffs submenu of the sidebar.
export const TARIFF_NAV: TariffPage[] = Object.values(TARIFF_PAGES);
