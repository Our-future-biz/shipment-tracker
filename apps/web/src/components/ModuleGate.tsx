"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuth, useModules } from "@/lib/auth/AuthContext";
import { useToast } from "@/lib/toast";
import { APP_MODULES, type AppModule } from "@/lib/modules";

interface ModuleGateProps {
  module: AppModule;
  children: ReactNode;
}

// A module's pages for a company that has it hidden: nothing of them is shown or asked for, and
// the user is sent to the dashboard (the server refuses the module's endpoints anyway).
export function ModuleGate({ module, children }: ModuleGateProps) {
  const { user, isLoading } = useAuth();
  const { isEnabled } = useModules();
  const router = useRouter();
  const toast = useToast();
  const enabled = isEnabled(module);
  const blocked = !isLoading && !!user && !enabled;
  const told = useRef(false);

  useEffect(() => {
    if (!blocked || told.current) return;
    told.current = true;
    const label = APP_MODULES.find((m) => m.module === module)?.label ?? "This module";
    toast.info(`${label} is not enabled for your company`);
    router.replace("/dashboard");
  }, [blocked, module, router, toast]);

  if (isLoading || blocked) {
    return (
      <div className="flex justify-center p-10">
        <Spin />
      </div>
    );
  }
  return <>{children}</>;
}
