"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth, useCanSeeConcepts } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";

interface SuperadminOnlyProps {
  children: ReactNode;
}

// The pages of a concept module: for anyone but a superadmin nothing of them is shown or asked
// for, and the user is sent to the dashboard.
export function SuperadminOnly({ children }: SuperadminOnlyProps) {
  const { user, isLoading } = useAuth();
  const allowed = useCanSeeConcepts();
  const router = useRouter();
  const toast = useToast();
  const blocked = !isLoading && !allowed;
  const told = useRef(false);

  useEffect(() => {
    if (!blocked || told.current) return;
    told.current = true;
    if (user) toast.info("This page is not available");
    router.replace("/dashboard");
  }, [blocked, router, toast, user]);

  if (isLoading || blocked) {
    return (
      <div className="flex justify-center p-10">
        <Spin />
      </div>
    );
  }
  return <>{children}</>;
}
