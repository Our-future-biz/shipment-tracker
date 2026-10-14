"use client";

import { useRouter, usePathname } from "next/navigation";
import { Spin } from "antd";
import { useAuth } from "@/lib/auth/AuthContext";
import { TopNav } from "@/components/TopNav";
import { AppSidebar } from "@/components/AppSidebar";
import { useEffect, useState } from "react";

const PUBLIC_PATHS = ["/login"];
// Signed-in pages shown full screen, without the sidebar and top bar (the warehouse phone floor mode).
const FULL_SCREEN_PATHS = ["/warehouse/floor"];

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [hasRedirected, setHasRedirected] = useState(false);

  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isLoading) return;

    if (!user && !isPublicPath && !hasRedirected) {
      // Not authenticated on a protected page → go to login
      setHasRedirected(true);
      router.replace("/login");
    } else if (user && isPublicPath) {
      // Authenticated on login page → go to dashboard
      router.replace("/dashboard");
    }
  }, [user, isLoading, isPublicPath, hasRedirected, router]);

  // Reset redirect flag when pathname changes
  useEffect(() => {
    setHasRedirected(false);
  }, [pathname]);

  // Public paths: render content directly (login page)
  if (isPublicPath) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-screen">
          <Spin size="large" />
        </div>
      );
    }
    // If user is authenticated on login page, show spinner while redirecting
    if (user) {
      return (
        <div className="flex items-center justify-center h-screen">
          <Spin size="large" />
        </div>
      );
    }
    return <>{children}</>;
  }

  // Protected paths: need authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  // Not authenticated → show spinner while redirecting to /login
  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spin size="large" />
      </div>
    );
  }

  // Authenticated, full-screen page → no sidebar or top bar
  if (FULL_SCREEN_PATHS.some((p) => pathname.startsWith(p))) {
    return <main className="min-h-screen bg-slate-50">{children}</main>;
  }

  // Authenticated → show app
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopNav />
        <main className="flex-1 min-w-0 bg-slate-50 print:bg-white">{children}</main>
      </div>
    </div>
  );
};
