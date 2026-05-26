"use client";

import { useRouter, usePathname } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { TopNav } from "@/components/TopNav";
import { LoginPage } from "./login/LoginPage";
import { useEffect, useRef } from "react";

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const wasLoggedOut = useRef(true);

  // Track login transition: was logged out → now logged in → navigate to dashboard
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      wasLoggedOut.current = true;
    } else if (wasLoggedOut.current) {
      wasLoggedOut.current = false;
      // Just logged in — navigate to dashboard if not already on a real page
      if (pathname === "/" || pathname === "/login") {
        router.replace("/dashboard");
      }
    }
  }, [user, isLoading, router, pathname]);

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

  return (
    <div className="flex flex-col min-h-screen">
      <TopNav />
      <main className="flex-1 bg-slate-50">{children}</main>
    </div>
  );
};
