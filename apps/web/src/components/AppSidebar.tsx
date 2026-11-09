"use client";

import { Fragment, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tooltip, Dropdown } from "antd";
import {
  AddressBookIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  ChartLineUpIcon,
  ClipboardTextIcon,
  CurrencyCircleDollarIcon,
  FileMagnifyingGlassIcon,
  HardDrivesIcon,
  PackageIcon,
  ReceiptIcon,
  SealCheckIcon,
  SquaresFourIcon,
  StackIcon,
  TruckIcon,
  UsersIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useAuth } from "@/lib/auth/AuthContext";
import { SALES_NAV, type SalesNavItem } from "@/app/sales/_lib/tabs";
import { TARIFF_NAV } from "@/app/tariffs/_lib/tariffPages";
import { ContainerHookIcon } from "@/components/icons/ContainerHookIcon";
import { MonitorChartIcon } from "@/components/icons/MonitorChartIcon";
import { ICON_BTN_GHOST } from "@/styles/ui";

// An item of a submenu. Its shape is defined with the Sales menu, the one that uses all of it.
type NavChild = SalesNavItem;

export interface NavItem {
  path: string;
  label: string;
  // A Phosphor icon, drawn as an outline and filled where you are (NavIcon).
  icon: Icon;
  // A section: clicking it opens its own page at `path` (Sales, Tariffs and Finance show their
  // pages there to pick from, SectionOverview) and unfolds its pages in the menu.
  children?: NavChild[];
  // One line on what the section is for, under its title on its own page.
  description?: string;
  // If set, the item only shows for these roles.
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: SquaresFourIcon },
  { path: "/shipments", label: "Shipments", icon: ContainerHookIcon },
  { path: "/master-jobs", label: "Master Jobs", icon: StackIcon },
  { path: "/customers", label: "Customer Database", icon: AddressBookIcon },
  {
    path: "/sales",
    label: "Sales",
    icon: ChartLineUpIcon,
    description: "Quotes for customers, their follow-up and the results.",
    children: SALES_NAV,
  },
  { path: "/tariffs", label: "Tariffs", icon: ReceiptIcon, description: "Our suppliers' tariffs, by kind of transport.", children: TARIFF_NAV },
  { path: "/documents", label: "Document / Text Reading", icon: FileMagnifyingGlassIcon },
  // Finance's pages keep their own addresses (/invoicing, /exchange); /finance is its overview.
  {
    path: "/finance",
    label: "Finance",
    icon: CurrencyCircleDollarIcon,
    description: "Invoicing of the jobs, and the exchange rates the app works with.",
    children: [
      { path: "/invoicing", label: "Invoicing", description: "Invoices to customers for the jobs." },
      { path: "/exchange", label: "Exchange", description: "The exchange rates amounts are converted with." },
    ],
  },
  { path: "/customs", label: "Customs", icon: SealCheckIcon },
  // The warehouse and its concept prototype share the package box.
  { path: "/warehouse", label: "Warehouse", icon: PackageIcon },
  // The concept modules are prototypes shown to superadmins only (Gate Log is a tab of Warehouse Concept).
  // Warehouse Concept opens its own page; its Managers cockpit is a page of its own under it.
  {
    path: "/warehouse-concept",
    label: "Warehouse Concept",
    icon: PackageIcon,
    roles: ["superadmin"],
    children: [{ path: "/warehouse-concept/managers", label: "Managers" }],
  },
  // The same page for admins and managers, who don't see the rest of the concept module.
  { path: "/warehouse-concept/managers", label: "Warehouse Managers", icon: ClipboardTextIcon, roles: ["admin", "manager"] },
  { path: "/trucking", label: "Trucking Concept", icon: TruckIcon, roles: ["superadmin"] },
  { path: "/cockpit", label: "Cockpit", icon: MonitorChartIcon },
  {
    path: "/calendar",
    label: "Calendar",
    icon: CalendarDotsIcon,
    children: [{ path: "/calendar/public-holidays", label: "Public Holidays" }],
  },
  // Company admins/managers manage their own users; superadmins manage all companies.
  { path: "/settings/users", label: "Users", icon: UsersIcon, roles: ["admin", "manager"] },
  { path: "/settings/organization", label: "Organization", icon: BuildingsIcon, roles: ["admin", "superadmin"] },
  { path: "/platform/companies", label: "Platform", icon: HardDrivesIcon, roles: ["superadmin"] },
];

/** Hide role-restricted items the user can't access. */
export function navItemVisible(item: Pick<NavItem, "roles">, user: { role: string } | null): boolean {
  return !item.roles || (user != null && item.roles.includes(user.role));
}

/** The menu items `user` sees. */
export const visibleNavItems = (user: { role: string } | null) => NAV_ITEMS.filter((item) => navItemVisible(item, user));

/** The section at `path` (a menu item with pages under it), for its own page. */
export const navSection = (path: string): NavItem | undefined => NAV_ITEMS.find((i) => i.children && i.path === path);

// The menu's text: dark enough to read crisply on white (the app's body slate-700, a submenu one
// step lighter), black on hover. "Here" is marked in bold white on indigo: the page you are on, or
// the item you just clicked while its page is on its way (navLooks). A section open over the page
// you are on is tinted, bold indigo. Each state carries its own weight, so a row never has two weights for
// the stylesheet's order to decide between.
const NAV_IDLE = "font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100";
const NAV_CHILD_IDLE = "font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100";
const NAV_ACTIVE = "font-semibold bg-indigo-600 text-white";
const NAV_GROUP_LIT = "font-semibold text-indigo-700 bg-indigo-50";

/** How a row is marked: "here" (solid), the group open over "here" (tint), or not at all. */
export type NavLook = "active" | "lit" | "idle";
const LOOK_CLASS: Record<NavLook, string> = { active: NAV_ACTIVE, lit: NAV_GROUP_LIT, idle: NAV_IDLE };

// A menu icon: Phosphor's outline, filled on a marked row. Its colour is the row's text colour.
function NavIcon({ icon: I, filled }: { icon: Icon; filled: boolean }) {
  return <I size={20} weight={filled ? "fill" : "regular"} aria-hidden className="shrink-0" />;
}

// The rows are buttons, so the menu works from the keyboard too; the ring shows for the keyboard only.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";
// Inside the row, for the sub-pages, whose sliding wrapper would cut off a ring drawn outside them.
const FOCUS_INSET = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500";

// The row of a menu item: a 40px square tile in the folded menu, a full-width row otherwise.
const navRow = (collapsed: boolean) =>
  `flex items-center rounded-xl text-[14px] cursor-pointer transition-all duration-150 ${FOCUS} ${
    collapsed ? "justify-center w-10 h-10 mx-auto mb-1" : "w-full text-left gap-3 px-4 py-3 mb-0.5"
  }`;

const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 64;

// Whether `pathname` is the page at `path` or anything below it.
const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

// Whether a submenu item is lit at `pathname`: its page, or one of the addresses it stays lit under.
const childOwns = (child: NavChild, pathname: string) => [child.path, ...(child.alsoActiveUnder ?? [])].some((path) => isUnder(pathname, path));

/**
 * Whether the page at `pathname` belongs to a menu item: its own address or anything below it, or
 * for a group one of its submenu's pages, which may have addresses of their own (Finance's).
 */
export const navItemOwns = (item: Pick<NavItem, "path" | "children">, pathname: string): boolean =>
  isUnder(pathname, item.path) || (item.children ?? []).some((c) => childOwns(c, pathname));

/**
 * The submenu item lit at `pathname`: the one holding it, the most specific when two do (one's
 * address under another's). None when no item holds the page.
 */
export function navActiveChild<T extends NavChild>(children: T[], pathname: string): T | undefined {
  let lit: T | undefined;
  let depth = -1;
  for (const c of children) {
    for (const path of [c.path, ...(c.alsoActiveUnder ?? [])]) {
      if (isUnder(pathname, path) && path.length > depth) {
        lit = c;
        depth = path.length;
      }
    }
  }
  return lit;
}

/** The group holding the page at `pathname`, if any. */
export const navGroupHolding = (items: NavItem[], pathname: string): string | null =>
  items.find((i) => i.children && navItemOwns(i, pathname))?.path ?? null;

/**
 * The menu's sections: the one unfolded (at most one), and the item you last clicked, a section or
 * any other, which is the one marked until a page is reached.
 */
export interface NavGroups {
  open: string | null;
  selected: string | null;
}

/** What changes the menu's sections. */
export type NavGroupEvent =
  // A click on a section from outside it: its page is on its way and the section unfolds.
  | { type: "open"; group: string }
  // A click on the section you are in: it folds or unfolds, and you stay on your page.
  | { type: "toggle"; group: string }
  // A click on any other item (`path`, its page), or on the logo.
  | { type: "leaf"; path: string }
  // A page reached by any route: a click here, a link elsewhere, Back.
  | { type: "arrive"; holding: string | null };

/**
 * The sections after an event. A click on a section unfolds it and folds any other, or, inside it,
 * folds it when it is the unfolded one; either way the section is the one marked, so folding it
 * again never hands the mark to another item. A click on any other item folds the section and
 * marks that item at once, before its page is here. Arriving on a page leaves unfolded only the
 * section holding it, and the page marked.
 */
export function nextNavGroups(groups: NavGroups, event: NavGroupEvent): NavGroups {
  switch (event.type) {
    case "open":
      return { open: event.group, selected: event.group };
    case "toggle":
      return { open: groups.open === event.group ? null : event.group, selected: event.group };
    case "leaf":
      return { open: null, selected: event.path };
    case "arrive":
      return { open: event.holding, selected: null };
  }
}

/**
 * Whether a click on a section opens its page: from outside the section, and also while another
 * click's page is on its way, the address still showing the page you are leaving. Inside the
 * section, with nothing on its way, it only folds or unfolds.
 */
export const sectionClickOpensPage = (groups: NavGroups, holding: string | null, holdsPage: boolean): boolean =>
  !holdsPage || (groups.selected !== null && groups.selected !== holding);

/** The folded menu's flyout once a page is reached: kept when it is the section holding the page. */
export const flyoutAfterArrival = (flyout: string | null, holding: string | null): string | null =>
  flyout !== null && flyout === holding ? flyout : null;

/**
 * How the unfolded menu marks where you are. One place only is marked "here": the item you just
 * clicked while its page is on its way, else the page you are on. A section on its own page is
 * marked itself; on one of its pages it is tinted while that page shows under it, and marked
 * itself when folded over it.
 */
export function navLooks({ open, selected }: NavGroups, holding: string | null) {
  const picking = selected !== null && selected !== holding;
  return {
    // A top-level item, at `path`.
    leaf: (path: string, isPage: boolean): NavLook => (picking ? (path === selected ? "active" : "idle") : isPage ? "active" : "idle"),
    // A section's sub-page.
    child: (isPage: boolean): NavLook => (isPage && !picking ? "active" : "idle"),
    group: (path: string, holdsPage: boolean, ownPage = false): NavLook => {
      if (picking) return path === selected ? "active" : "idle";
      if (holdsPage) return !ownPage && path === open ? "lit" : "active";
      return "idle";
    },
  };
}

/**
 * What `user`'s menu calls the page at `pathname`: its submenu item when it has one, otherwise its
 * item. The item `user` sees comes first (an admin's Warehouse Managers, a superadmin's Managers
 * under Warehouse Concept); a page their menu does not list takes the name it has in anyone's.
 */
export function navLabelOf(pathname: string, user: { role: string } | null): string | null {
  const path = pathname.replace(/\/$/, "");
  const owns = (i: NavItem) => navItemOwns(i, path);
  const item = visibleNavItems(user).find(owns) ?? NAV_ITEMS.find(owns);
  return item?.children?.find((c) => isUnder(path, c.path))?.label ?? item?.label ?? null;
}

export function AppSidebar() {
  // The app runs with trailingSlash, so the pathname ends in a slash the menu paths do not have.
  const pathname = usePathname().replace(/\/$/, "");
  const router = useRouter();
  const { collapsed, toggle } = useSidebarState();
  const { user } = useAuth();
  const { canManageSales } = useSalesPermissions();

  // Hide role-restricted items the current user can't access.
  const navItems = NAV_ITEMS.filter((item) => navItemVisible(item, user));
  const holding = navGroupHolding(navItems, pathname);

  // The unfolded group and the one you last clicked (nextNavGroups). Arriving on a page resets them
  // while rendering, so no frame shows the group of the page you left.
  const [groups, setGroups] = useState<NavGroups>({ open: holding, selected: null });
  const arrival = `${user?.role ?? ""} ${pathname}`;
  const [arrivedAt, setArrivedAt] = useState(arrival);
  // The folded menu: the group whose flyout is open. Folding or unfolding the menu closes it, or it
  // would open by itself the next time the menu is folded.
  const [flyout, setFlyout] = useState<string | null>(null);
  const [flyoutMenu, setFlyoutMenu] = useState(collapsed);
  if (arrivedAt !== arrival) {
    setArrivedAt(arrival);
    setGroups(nextNavGroups(groups, { type: "arrive", holding }));
    // A flyout open under the pointer stays when its section's page is the one reached.
    setFlyout(flyoutAfterArrival(flyout, holding));
  }
  if (flyoutMenu !== collapsed) {
    setFlyoutMenu(collapsed);
    setFlyout(null);
  }

  const fold = (event: NavGroupEvent) => setGroups((g) => nextNavGroups(g, event));
  // Another page than a section's: the section you had unfolded folds, even when the page is this
  // one, and the item clicked is marked at once.
  const goTo = (path: string) => {
    fold({ type: "leaf", path });
    router.push(path);
  };
  const looks = navLooks(groups, holding);

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const renderLeaf = (item: NavItem) => {
    const isPage = isUnder(pathname, item.path);
    // The folded menu unfolds no group: the page is the one marked there.
    const look: NavLook = collapsed ? (isPage ? "active" : "idle") : looks.leaf(item.path, isPage);
    const row = (
      <button
        type="button"
        onClick={() => goTo(item.path)}
        // Folded, the tile shows only the icon, which is hidden from screen readers: the tile is named.
        aria-label={collapsed ? item.label : undefined}
        aria-current={isPage ? "page" : undefined}
        className={`${navRow(collapsed)} ${LOOK_CLASS[look]}`}
      >
        <NavIcon icon={item.icon} filled={look !== "idle"} />
        {!collapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
      </button>
    );
    return collapsed ? (
      <Tooltip key={item.path} title={item.label} placement="right">
        {row}
      </Tooltip>
    ) : (
      <div key={item.path}>{row}</div>
    );
  };

  const renderGroup = (item: NavItem) => {
    const children = (item.children ?? []).filter((c) => !c.managersOnly || canManageSales);
    const holdsPage = navItemOwns(item, pathname);
    const current = navActiveChild(children, pathname);
    // The section's own page, or one of its pages its menu doesn't list (the concept's Gate Log).
    const ownPage = holdsPage && !current;
    // From outside the section, a click opens the section's own page, its menu unfolding; inside
    // it, the click only folds or unfolds the menu, and you stay on your page. The second click of
    // a double click is no new choice (it would fold the section just opened).
    const opensPage = sectionClickOpensPage(groups, holding, holdsPage);
    const openSection = (e: React.MouseEvent) => {
      if (e.detail > 1) return;
      if (opensPage) {
        fold({ type: "open", group: item.path });
        router.push(item.path);
      } else fold({ type: "toggle", group: item.path });
    };

    // Folded menu: the tile shows its pages as a flyout to the right of the rail, on hover, and a
    // click opens the section's page (from inside the section, the flyout). Beside the rail, not
    // below the tile, so it never covers the tiles under it and a click meant for one of them can't
    // land in it. The tile holding the page is marked; one being picked from is tinted.
    if (collapsed) {
      const picking = flyout === item.path;
      const look: NavLook = holdsPage ? "active" : picking ? "lit" : "idle";
      return (
        <Dropdown
          key={item.path}
          // Its top left corner by the tile's top right one, past the rail's edge; moved up or
          // left when it would leave the window.
          align={{ points: ["tl", "tr"], offset: [20, 0], overflow: { adjustX: true, adjustY: true } }}
          trigger={["hover"]}
          // It grows from the tile rather than sliding down, as a menu beside the rail.
          transitionName="ant-zoom-big"
          // Time to cross the gap from the tile to the flyout.
          mouseLeaveDelay={0.2}
          open={picking}
          onOpenChange={(isOpen) => setFlyout((f) => (isOpen ? item.path : f === item.path ? null : f))}
          menu={{
            items: children.flatMap((c) => [
              ...(c.divided ? [{ type: "divider" as const }] : []),
              { key: c.path, label: c === current ? <span className="font-semibold">{c.label}</span> : c.label, onClick: () => router.push(c.path) },
            ]),
            selectedKeys: current ? [current.path] : [],
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              if (e.detail > 1) return;
              if (!opensPage) return setFlyout(item.path);
              fold({ type: "open", group: item.path });
              router.push(item.path);
            }}
            aria-label={item.label}
            // Folded, the tile stands for its pages too: it is the current one on any of them.
            aria-current={holdsPage ? "page" : undefined}
            aria-haspopup="menu"
            aria-expanded={picking}
            className={`${navRow(true)} ${LOOK_CLASS[look]}`}
          >
            <NavIcon icon={item.icon} filled={look !== "idle"} />
          </button>
        </Dropdown>
      );
    }

    const isOpen = groups.open === item.path;
    const look = looks.group(item.path, holdsPage, ownPage);
    return (
      <div key={item.path}>
        <button
          type="button"
          onClick={openSection}
          aria-expanded={isOpen}
          aria-current={ownPage ? "page" : undefined}
          className={`${navRow(false)} ${LOOK_CLASS[look]}`}
        >
          <NavIcon icon={item.icon} filled={look !== "idle"} />
          <span className="whitespace-nowrap overflow-hidden flex-1">{item.label}</span>
          <CaretDownIcon size={12} weight="bold" aria-hidden className={`shrink-0 transition-transform duration-150 ${isOpen ? "" : "-rotate-90"}`} />
        </button>
        {/* The pages slide open and shut (the grid row grows from 0 to its height), so the rows
            below move rather than jump; folded, they are out of reach of the mouse and the keyboard. */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          inert={!isOpen}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="ml-4 pl-3 border-l border-slate-100 mb-1 space-y-0.5">
              {children.map((c) => {
                const isPage = c === current;
                return (
                  <Fragment key={c.path}>
                    {c.divided && <div role="separator" className="h-px mx-3 my-1 bg-slate-100" />}
                    <button
                      type="button"
                      onClick={() => router.push(c.path)}
                      aria-current={isPage ? "page" : undefined}
                      className={`block w-full text-left px-3 py-2 rounded-lg text-[13px] cursor-pointer transition-all duration-150 ${FOCUS_INSET} ${
                        looks.child(isPage) === "active" ? NAV_ACTIVE : NAV_CHILD_IDLE
                      }`}
                    >
                      {c.label}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      className="print:hidden bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Header with logo + collapse toggle */}
      <div
        className={`h-[70px] border-b border-slate-200 shrink-0 flex ${
          collapsed ? "flex-col items-center justify-center gap-1" : "items-center px-5 gap-2"
        }`}
      >
        {collapsed ? (
          <>
            <div
              onClick={() => goTo("/dashboard")}
              className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shrink-0 cursor-pointer"
            >
              ST
            </div>
            <button
              onClick={toggle}
              aria-label="Expand sidebar"
              className={ICON_BTN_GHOST}
            >
              <CaretRightIcon size={14} weight="bold" aria-hidden />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 cursor-pointer min-w-0 flex-1" onClick={() => goTo("/dashboard")}>
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-[12px] shrink-0">ST</div>
              <div className="overflow-hidden">
                <div className="text-[14px] font-semibold text-slate-900 whitespace-nowrap">Shipment Tracker</div>
              </div>
            </div>
            <button
              onClick={toggle}
              className={ICON_BTN_GHOST}
              aria-label="Collapse sidebar"
            >
              <CaretLeftIcon size={14} weight="bold" aria-hidden />
            </button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        {navItems.map((item) => (item.children ? renderGroup(item) : renderLeaf(item)))}
      </nav>
    </aside>
  );
}
