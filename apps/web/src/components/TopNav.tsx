"use client";

import { usePathname, useRouter } from "next/navigation";
import { Dropdown, type MenuProps } from "antd";
import { LogoutOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/shipments", label: "Shipments" },
  { path: "/documents", label: "Documents" },
  { path: "/invoicing", label: "Invoicing" },
  { path: "/quotes", label: "Quotes" },
  { path: "/warehouse", label: "Warehouse" },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const userMenuItems: MenuProps["items"] = [
    {
      key: "user",
      label: (
        <span style={{ color: "#64748b", fontSize: 12 }}>
          {user?.email}
        </span>
      ),
      disabled: true,
    },
    { type: "divider" },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      onClick: logout,
    },
  ];

  return (
    <nav
      style={{
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        height: 52,
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 32, cursor: "pointer" }}
        onClick={() => router.push("/dashboard")}
      >
        <div
          style={{
            width: 28,
            height: 28,
            background: "#6366f1",
            borderRadius: 7,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          ST
        </div>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#1e293b" }}>Shipment Tracker</span>
      </div>

      {/* Nav links */}
      <div style={{ display: "flex", gap: 2, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + "/");
          return (
            <div
              key={item.path}
              onClick={() => router.push(item.path)}
              style={{
                padding: "14px 14px",
                fontSize: 13,
                fontWeight: isActive ? 500 : 450,
                color: isActive ? "#6366f1" : "#64748b",
                cursor: "pointer",
                borderBottom: isActive ? "2px solid #6366f1" : "2px solid transparent",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      {/* User menu */}
      <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="bottomRight">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            padding: "6px 10px",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              background: "#e0e7ff",
              color: "#6366f1",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {user?.displayName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) ?? <UserOutlined />}
          </div>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {user?.displayName ?? "User"}
          </span>
        </div>
      </Dropdown>
    </nav>
  );
}
