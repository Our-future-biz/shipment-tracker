// The sections of Tariffs, in the order the sidebar lists them. A section's title is its label, so
// the menu and the page say the same words.

interface TariffPage {
  label: string;
  path: string;
  // One line on what the section is for, on the Tariffs overview (SectionOverview).
  description: string;
}

export const TARIFF_PAGES = {
  railOperators: { label: "Rail Operators", path: "/tariffs/rail-operators", description: "Rail operators and their tariffs." },
  collections: {
    label: "Last / First Mile Collections",
    path: "/tariffs/collections",
    description: "Hauliers' tariffs for collections and deliveries.",
  },
  shippingLines: { label: "Shipping Lines", path: "/tariffs/shipping-lines", description: "Shipping lines and their tariffs." },
} satisfies Record<string, TariffPage>;

// The Tariffs submenu of the sidebar.
export const TARIFF_NAV: TariffPage[] = Object.values(TARIFF_PAGES);
