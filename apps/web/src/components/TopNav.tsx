"use client";

import { Dropdown, Input, type MenuProps } from "antd";
import { LogoutOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { useAuth } from "@/lib/auth/AuthContext";

export function TopNav() {
  const { user, logout } = useAuth();

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const userMenuItems: MenuProps["items"] = [
    {
      key: "user",
      label: (
        <span className="text-slate-500 text-xs">{user?.email}</span>
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

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="bg-white border-b border-slate-200 flex items-center px-8 h-[70px] sticky top-0 z-[100]">
      {/* Search */}
      <div className="flex-1 max-w-lg">
        <Input
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder="Search shipments, jobs, customers..."
          className="rounded-xl"
          size="large"
          allowClear
        />
      </div>

      <div className="flex items-center gap-3 ml-auto">
        {/* Date */}
        <span className="text-[13px] text-slate-500">{today}</span>

        {/* User menu */}
        <Dropdown menu={{ items: userMenuItems }} trigger={["click"]} placement="bottomRight">
          <div className="flex items-center gap-2 cursor-pointer px-2.5 py-1.5 rounded-md hover:bg-slate-50">
            <div className="w-8 h-8 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center text-[12px] font-semibold">
              {initials ?? <UserOutlined />}
            </div>
            <span className="text-[13px] text-slate-600 font-medium">
              {user?.displayName ?? "User"}
            </span>
          </div>
        </Dropdown>
      </div>
    </header>
  );
}
