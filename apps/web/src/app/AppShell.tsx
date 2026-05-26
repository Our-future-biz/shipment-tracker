"use client";

import { useRouter, usePathname } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { TopNav } from "@/components/TopNav";
import { useEffect } from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;

    if (!user && pathname !== "/login") {
      // Not authenticated → go to login
      router.replace("/login");
    } else if (user && pathname === "/login") {
      // Authenticated but on login page → go to dashboard
      router.replace("/dashboard");
    }
  }, [user, isLoading, router, pathname]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  // Not authenticated — show nothing while redirecting to /login
  if (!user) {
    // If we're on /login, render the login page content
    if (pathname === "/login") {
      return <>{children}</>;
    }
    // Otherwise show nothing while redirect happens
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  // Authenticated on /login — show nothing while redirecting to /dashboard
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
