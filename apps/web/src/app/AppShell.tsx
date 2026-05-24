"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
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
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <header style={{ flexShrink: 0, borderBottom: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: "#f0fdfa", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TableOutlined style={{ color: "#0d9488", fontSize: 16 }} />
          </div>
          <div>
            <h1 style={{ fontSize: 14, fontWeight: 600, color: "#1f2937", margin: 0, lineHeight: 1.3 }}>Shipment Tracker</h1>
            <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>Operations Dashboard</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "#6b7280" }}>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8, paddingLeft: 12, borderLeft: "1px solid #e5e7eb" }}>
            <span style={{ fontSize: 12, color: "#374151" }}>{user.displayName || user.email}</span>
            <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", color: "#6b7280", fontSize: 12 }}>
              <LogoutOutlined />
            </button>
          </div>
        </div>
      </header>

      {/* Tab navigation */}
      <div style={{ flexShrink: 0, borderBottom: "1px solid #e5e7eb", padding: "0 24px", background: "#fff" }}>
        <nav style={{ display: "flex", gap: 0, height: 38 }}>
          {TABS.map((tab) => {
            const isActive = pathname === tab.key || (tab.key === "/dashboard" && pathname === "/");
            return (
              <Link
                key={tab.key}
                href={tab.key}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 38,
                  fontSize: 12, fontWeight: 500, textDecoration: "none",
                  borderBottom: isActive ? "2px solid #0d9488" : "2px solid transparent",
                  color: isActive ? "#0d9488" : "#6b7280",
                  transition: "color 0.15s",
                }}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      <main style={{ flex: 1, minHeight: 0, overflow: "auto", background: "#f5f5f5" }}>
        {children}
      </main>
    </div>
  );
};
