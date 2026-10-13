// An item of a submenu of the sidebar (components/AppSidebar.tsx).
export interface SalesNavItem {
  label: string;
  path: string;
  // Other addresses the item stays lit under, besides its own: an open record keeps its list lit.
  alsoActiveUnder?: string[];
  // Shown only to those the server lets manage Sales (useSalesPermissions). Sales keeps its role
  // rules on the server, so this is its answer and not a list of roles.
  managersOnly?: boolean;
  // Set apart from the items above it by a thin line.
  divided?: boolean;
}

// The pages of Sales. A page's title is its label, so the menu and the page say the same word.
export const SALES_PAGES = {
  quotes: { label: "Quotes", path: "/sales/quotes", alsoActiveUnder: ["/sales/quote"] },
  followup: { label: "Follow-up", path: "/sales/followup" },
  pipeline: { label: "Pipeline", path: "/sales/pipeline" },
  report: { label: "Sales Report", path: "/sales/report" },
  // Not daily work, and only a manager can change anything on it. Everybody may still read it:
  // the quote page links here.
  settings: { label: "Settings", path: "/sales/settings", managersOnly: true, divided: true },
} satisfies Record<string, SalesNavItem>;

// The Sales submenu of the sidebar, in the order a salesperson needs the pages.
export const SALES_NAV: SalesNavItem[] = Object.values(SALES_PAGES);

// Sales Settings keeps its tab in the address (?tab=); the first one is where the page opens.
export const SALES_SETTINGS_TABS = [
  { key: "company", label: "Company details" },
  { key: "terms", label: "Terms & Conditions" },
] as const;

export type SalesSettingsTab = (typeof SALES_SETTINGS_TABS)[number]["key"];

export const salesSettingsHref = (tab: SalesSettingsTab) => `${SALES_PAGES.settings.path}?tab=${tab}`;
