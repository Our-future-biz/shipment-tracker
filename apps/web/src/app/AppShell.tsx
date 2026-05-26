"use client";

import { usePathname, useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { TopNav } from "@/components/TopNav";
import { LoginPage } from "./login/LoginPage";
import { useEffect } from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Redirect logged-in users away from /login
  useEffect(() => {
    if (!isLoading && user && pathname === "/login") {
      router.replace("/dashboard");
    }
  }, [isLoading, user, pathname, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  // Not logged in → show login page (no header)
  if (!user) {
    return <LoginPage />;
  }

  // Logged in but still on /login path → show nothing while redirect happens
  if (pathname === "/login") {
    return null;
  }

  // Normal authenticated layout
  return (
    <div className="flex flex-col min-h-screen">
      <TopNav />
      <main className="flex-1 bg-slate-50">{children}</main>
    </div>
  );
};
