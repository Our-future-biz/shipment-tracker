"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { useTheme } from "@/lib/theme/ThemeProvider";
import { LoginPage } from "./login/LoginPage";
import { Spin } from "antd";
import {
  DashboardOutlined,
  TableOutlined,
  FileSearchOutlined,
  DollarOutlined,
  FileTextOutlined,
  InboxOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
} from "@ant-design/icons";

const TABS = [
  { key: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { key: "/shipments", label: "Shipments", icon: <TableOutlined /> },
  { key: "/documents", label: "Document/Text Reading", icon: <FileSearchOutlined /> },
  { key: "/invoicing", label: "Invoicing", icon: <DollarOutlined /> },
  { key: "/quotes", label: "Quote", icon: <FileTextOutlined /> },
  { key: "/warehouse", label: "Warehouse", icon: <InboxOutlined /> },
];

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center justify-between bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-900/30">
            <TableOutlined className="text-teal-600 dark:text-teal-400 text-lg" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">Shipment Tracker</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">Operations Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span className="tabular-nums">
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </span>
          <button onClick={toggle} className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
            {isDark ? <SunOutlined /> : <MoonOutlined />}
          </button>
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-200 dark:border-gray-700">
            <span className="text-xs text-gray-600 dark:text-gray-300">{user.displayName || user.email}</span>
            <button onClick={logout} className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-800">
              <LogoutOutlined />
            </button>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div className="flex-none border-b border-gray-200 dark:border-gray-700 px-6 bg-white dark:bg-gray-900">
        <nav className="flex gap-0 h-10">
          {TABS.map((tab) => {
            const isActive = pathname === tab.key || (tab.key === "/dashboard" && pathname === "/");
            return (
              <Link
                key={tab.key}
                href={tab.key}
                className={`flex items-center gap-1.5 px-4 h-10 text-xs font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-teal-500 text-teal-600 dark:text-teal-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                }`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <main className="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-950">
        {children}
      </main>
    </div>
  );
};
