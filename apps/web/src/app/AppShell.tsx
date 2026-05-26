"use client";

import { usePathname } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { TopNav } from "@/components/TopNav";
import { LoginPage } from "./login/LoginPage";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopNav />
      <main className="flex-1 bg-slate-50">{children}</main>
    </div>
  );
};
