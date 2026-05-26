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
        <span className="text-slate-500 text-xs">
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
    <nav className="bg-white border-b border-slate-200 flex items-center px-6 h-[52px] sticky top-0 z-[100]">
      {/* Logo */}
      <div
        className="flex items-center gap-2 mr-8 cursor-pointer"
        onClick={() => router.push("/dashboard")}
      >
        <div className="w-7 h-7 bg-indigo-500 rounded-[7px] flex items-center justify-center text-white font-bold text-xs">
          ST
        </div>
        <span className="font-semibold text-[15px] text-slate-800">Shipment Tracker</span>
      </div>

      {/* Nav links */}
      <div className="flex gap-0.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.path || pathname.startsWith(item.path + "/");
          return (
            <div
              key={item.path}
              onClick={() => router.push(item.path)}
              className={`px-3.5 py-3.5 text-sm cursor-pointer transition-all duration-150 ${
                isActive
                  ? "font-medium text-indigo-500 border-b-2 border-indigo-500"
                  : "font-normal text-slate-500 border-b-2 border-transparent"
              }`}
            >
              {item.label}
            </div>
          );
        })}
      </div>

      {/* User menu */}
      <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="bottomRight">
        <div className="flex items-center gap-2 cursor-pointer px-2.5 py-1.5 rounded-md">
          <div className="w-7 h-7 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center text-[11px] font-semibold">
            {user?.displayName
              ?.split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) ?? <UserOutlined />}
          </div>
          <span className="text-xs text-slate-500">
            {user?.displayName ?? "User"}
          </span>
        </div>
      </Dropdown>
    </nav>
  );
}
