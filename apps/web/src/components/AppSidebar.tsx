"use client";

import { Fragment, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tooltip, Dropdown } from "antd";
import {
  DashboardOutlined,
  ContainerOutlined,
  FileTextOutlined,
  DollarOutlined,
  InboxOutlined,
  TeamOutlined,
  LineChartOutlined,
  SafetyCertificateOutlined,
  ClusterOutlined,
  ControlOutlined,
  LeftOutlined,
  RightOutlined,
  DownOutlined,
  UsergroupAddOutlined,
  ApartmentOutlined,
  SwapOutlined,
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  TagsOutlined,
} from "@ant-design/icons";
import { useSalesPermissions } from "@/hooks/useSalesPermissions";
import { useSidebarState } from "@/hooks/useSidebarState";
import { useAuth } from "@/lib/auth/AuthContext";
import { SALES_NAV, SALES_PAGES, type SalesNavItem } from "@/app/sales/_lib/tabs";
import { TARIFF_NAV, TARIFF_PAGES } from "@/app/tariffs/_lib/tariffPages";
import type { ReactNode } from "react";

// An item of a submenu. Its shape is defined with the Sales menu, the one that uses all of it.
type NavChild = SalesNavItem;

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  // A group: clicking it opens its own page, the arrow folds the submenu.
  children?: NavChild[];
  // A group's own page, when that is not `path` itself.
  home?: string;
  // If set, the item only shows for these roles.
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { path: "/shipments", label: "Shipments", icon: <ContainerOutlined /> },
  { path: "/customers", label: "Customer Database", icon: <TeamOutlined /> },
  // The Quotes list is where work in Sales starts, so that is what "Sales" opens. /sales itself
  // only redirects there: going straight saves the detour.
  { path: "/sales", label: "Sales", icon: <LineChartOutlined />, home: SALES_PAGES.quotes.path, children: SALES_NAV },
  // Tariffs has no page of its own yet: it opens its first section, as Sales opens Quotes.
  {
    path: "/tariffs",
    label: "Tariffs",
    icon: <TagsOutlined />,
    home: TARIFF_PAGES.railOperators.path,
    children: TARIFF_NAV,
  },
  { path: "/documents", label: "Document / Text Reading", icon: <FileTextOutlined /> },
  { path: "/invoicing", label: "Invoicing", icon: <DollarOutlined /> },
  { path: "/exchange", label: "Exchange", icon: <SwapOutlined /> },
  { path: "/customs", label: "Customs", icon: <SafetyCertificateOutlined /> },
  { path: "/warehouse", label: "Warehouse", icon: <InboxOutlined /> },
  // The concept modules are prototypes shown to superadmins only (Gate Log is a tab of Warehouse Concept).
  // Warehouse Concept opens its own page; its Managers cockpit is a page of its own under it.
  {
    path: "/warehouse-concept",
    label: "Warehouse Concept",
    icon: <InboxOutlined />,
    roles: ["superadmin"],
    children: [{ path: "/warehouse-concept/managers", label: "Managers" }],
  },
  { path: "/trucking", label: "Trucking Concept", icon: <CarOutlined />, roles: ["superadmin"] },
  { path: "/master-jobs", label: "Master Jobs", icon: <ClusterOutlined /> },
  { path: "/cockpit", label: "Cockpit", icon: <ControlOutlined /> },
  {
    path: "/calendar",
    label: "Calendar",
    icon: <CalendarOutlined />,
    children: [{ path: "/calendar/public-holidays", label: "Public Holidays" }],
  },
  // Company admins/managers manage their own users; superadmins manage all companies.
  { path: "/settings/users", label: "Users", icon: <UsergroupAddOutlined />, roles: ["admin", "manager"] },
  { path: "/settings/organization", label: "Organization", icon: <BankOutlined />, roles: ["admin", "superadmin"] },
  { path: "/platform/companies", label: "Platform", icon: <ApartmentOutlined />, roles: ["superadmin"] },
];

/** Hide role-restricted items the user can't access. */
export function navItemVisible(item: Pick<NavItem, "roles">, user: { role: string } | null): boolean {
  return !item.roles || (user != null && item.roles.includes(user.role));
}

/** The menu items `user` sees. */
export const visibleNavItems = (user: { role: string } | null) => NAV_ITEMS.filter((item) => navItemVisible(item, user));

const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 64;

// Whether `pathname` is the page at `path` or anything below it.
const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + "/");

export function AppSidebar() {
  // The app runs with trailingSlash, so the pathname ends in a slash the menu paths do not have.
  const pathname = usePathname().replace(/\/$/, "");
  const router = useRouter();
  const { collapsed, toggle } = useSidebarState();
  const { user } = useAuth();
  const { canManageSales } = useSalesPermissions();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const isChildActive = (child: NavChild) => [child.path, ...(child.alsoActiveUnder ?? [])].some((path) => isUnder(pathname, path));

  // Hide role-restricted items the current user can't access.
  const navItems = NAV_ITEMS.filter((item) => navItemVisible(item, user));

  // Auto-expand the group that owns the current route.
  useEffect(() => {
    for (const item of NAV_ITEMS) {
      if (item.children && isUnder(pathname, item.path)) {
        setOpenGroups((g) => (g[item.path] ? g : { ...g, [item.path]: true }));
      }
    }
  }, [pathname]);

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const renderLeaf = (item: NavItem) => {
    const isActive = isUnder(pathname, item.path);
    const navItem = (
      <div
        onClick={() => router.push(item.path)}
        className={`flex items-center gap-3 rounded-xl text-[14px] cursor-pointer mb-0.5 transition-all duration-150 ${
          collapsed ? "justify-center px-2 py-3" : "px-4 py-3"
        } ${isActive ? "bg-indigo-500 text-white font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"}`}
      >
        <span className="text-base shrink-0">{item.icon}</span>
        {!collapsed && <span className="whitespace-nowrap overflow-hidden">{item.label}</span>}
      </div>
    );
    return collapsed ? (
      <Tooltip key={item.path} title={item.label} placement="right">
        {navItem}
      </Tooltip>
    ) : (
      <div key={item.path}>{navItem}</div>
    );
  };

  const renderGroup = (item: NavItem) => {
    const children = (item.children ?? []).filter((c) => !c.managersOnly || canManageSales);
    const groupActive = isUnder(pathname, item.path);
    const open = !!openGroups[item.path];
    const onOwnPage = pathname === item.path;
    const openOwnPage = () => router.push(item.home ?? item.path);
    const toggleGroup = () => setOpenGroups((g) => ({ ...g, [item.path]: !g[item.path] }));

    // Collapsed: submenu shown as a right-side flyout.
    if (collapsed) {
      return (
        <Dropdown
          key={item.path}
          placement="bottomRight"
          trigger={["click", "hover"]}
          menu={{
            items: children.flatMap((c) => [
              ...(c.divided ? [{ type: "divider" as const }] : []),
              { key: c.path, label: c.label, onClick: () => router.push(c.path) },
            ]),
            selectedKeys: children.filter(isChildActive).map((c) => c.path),
          }}
        >
          <div
            onClick={openOwnPage}
            className={`flex items-center justify-center px-2 py-3 rounded-xl text-[14px] cursor-pointer mb-0.5 transition-all duration-150 ${
              groupActive ? "bg-indigo-500 text-white font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="text-base shrink-0">{item.icon}</span>
          </div>
        </Dropdown>
      );
    }

    return (
      <div key={item.path}>
        <div
          onClick={() => {
            setOpenGroups((g) => ({ ...g, [item.path]: true }));
            openOwnPage();
          }}
          className={`flex items-center gap-3 rounded-xl text-[14px] cursor-pointer mb-0.5 px-4 py-3 transition-all duration-150 ${
            onOwnPage
              ? "bg-indigo-500 text-white font-medium"
              : groupActive && !open
                ? "text-indigo-600 font-medium bg-indigo-50"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          <span className="text-base shrink-0">{item.icon}</span>
          <span className="whitespace-nowrap overflow-hidden flex-1">{item.label}</span>
          <DownOutlined
            onClick={(e) => { e.stopPropagation(); toggleGroup(); }}
            className={`text-[10px] transition-transform duration-150 p-1.5 -m-1.5 ${open ? "" : "-rotate-90"}`}
          />
        </div>
        {open && (
          <div className="ml-4 pl-3 border-l border-slate-100 mb-1 space-y-0.5">
            {children.map((c) => (
              <Fragment key={c.path}>
                {c.divided && <div role="separator" className="h-px mx-3 my-1 bg-slate-100" />}
                <div
                  onClick={() => router.push(c.path)}
                  className={`px-3 py-2 rounded-lg text-[13px] cursor-pointer transition-all duration-150 ${
                    isChildActive(c) ? "bg-indigo-500 text-white font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {c.label}
                </div>
              </Fragment>
            ))}
          </div>
        )}
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
              onClick={() => router.push("/dashboard")}
              className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold text-[11px] shrink-0 cursor-pointer"
            >
              ST
            </div>
            <button
              onClick={toggle}
              aria-label="Expand sidebar"
              className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150"
            >
              <RightOutlined className="text-[11px]" />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 cursor-pointer min-w-0 flex-1" onClick={() => router.push("/dashboard")}>
              <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0">ST</div>
              <div className="overflow-hidden">
                <div className="text-[15px] font-semibold text-slate-800 whitespace-nowrap">Shipment Tracker</div>
              </div>
            </div>
            <button
              onClick={toggle}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors duration-150 shrink-0"
              aria-label="Collapse sidebar"
            >
              <LeftOutlined className="text-xs" />
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
