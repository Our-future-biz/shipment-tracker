"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tooltip, Dropdown } from "antd";
import {
  DashboardOutlined,
  ContainerOutlined,
  FileTextOutlined,
  DollarOutlined,
  FileSearchOutlined,
  InboxOutlined,
  TeamOutlined,
  LineChartOutlined,
  LeftOutlined,
  RightOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { useSidebarState } from "@/hooks/useSidebarState";
import { SALES_NAV } from "@/app/sales/_lib/tabs";
import type { ReactNode } from "react";

interface NavChild {
  path: string;
  label: string;
}
interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { path: "/shipments", label: "Shipments", icon: <ContainerOutlined /> },
  { path: "/customers", label: "Customer Database", icon: <TeamOutlined /> },
  { path: "/sales", label: "Sales", icon: <LineChartOutlined />, children: SALES_NAV.map(({ path, label }) => ({ path, label })) },
  { path: "/documents", label: "Document / Text Reading", icon: <FileTextOutlined /> },
  { path: "/invoicing", label: "Invoicing", icon: <DollarOutlined /> },
  { path: "/quotes", label: "Quote", icon: <FileSearchOutlined /> },
  { path: "/warehouse", label: "Warehouse", icon: <InboxOutlined /> },
];

const EXPANDED_WIDTH = 260;
const COLLAPSED_WIDTH = 64;

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarState();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // Auto-expand the group that owns the current route.
  useEffect(() => {
    for (const item of NAV_ITEMS) {
      if (item.children && (pathname === item.path || pathname.startsWith(item.path + "/"))) {
        setOpenGroups((g) => (g[item.path] ? g : { ...g, [item.path]: true }));
      }
    }
  }, [pathname]);

  const width = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const renderLeaf = (item: NavItem) => {
    const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
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
    const children = item.children ?? [];
    const groupActive = pathname === item.path || pathname.startsWith(item.path + "/");
    const open = !!openGroups[item.path];

    // Collapsed: submenu shown as a right-side flyout.
    if (collapsed) {
      return (
        <Dropdown
          key={item.path}
          placement="bottomRight"
          trigger={["click", "hover"]}
          menu={{
            items: children.map((c) => ({
              key: c.path,
              label: c.label,
              onClick: () => router.push(c.path),
            })),
            selectedKeys: children.filter((c) => pathname === c.path).map((c) => c.path),
          }}
        >
          <div
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
          onClick={() => setOpenGroups((g) => ({ ...g, [item.path]: !g[item.path] }))}
          className={`flex items-center gap-3 rounded-xl text-[14px] cursor-pointer mb-0.5 px-4 py-3 transition-all duration-150 ${
            groupActive && !open ? "text-indigo-600 font-medium bg-indigo-50" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          }`}
        >
          <span className="text-base shrink-0">{item.icon}</span>
          <span className="whitespace-nowrap overflow-hidden flex-1">{item.label}</span>
          <DownOutlined className={`text-[10px] transition-transform duration-150 ${open ? "" : "-rotate-90"}`} />
        </div>
        {open && (
          <div className="ml-4 pl-3 border-l border-slate-100 mb-1 space-y-0.5">
            {children.map((c) => {
              const active = pathname === c.path;
              return (
                <div
                  key={c.path}
                  onClick={() => router.push(c.path)}
                  className={`px-3 py-2 rounded-lg text-[13px] cursor-pointer transition-all duration-150 ${
                    active ? "bg-indigo-500 text-white font-medium" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {c.label}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className="bg-white border-r border-slate-200 flex flex-col shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden"
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
        {NAV_ITEMS.map((item) => (item.children ? renderGroup(item) : renderLeaf(item)))}
      </nav>
    </aside>
  );
}
