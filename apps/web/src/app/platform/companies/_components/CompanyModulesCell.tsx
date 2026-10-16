"use client";

import { Checkbox } from "antd";
import { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useCompanyModules, type CompanyModules } from "@/hooks/useCompanyModules";
import { APP_MODULES, type AppModule } from "@/lib/modules";

interface CompanyModulesCellProps {
  company: CompanyModules & { name: string };
}

// The modules a company has hidden (Warehouse Concept, Trucking Concept): its users don't see them
// and the server refuses their endpoints. Superadmins always see everything.
export function CompanyModulesCell({ company }: CompanyModulesCellProps) {
  const toast = useToast();
  const { setHiddenModules, savingCompanyId } = useCompanyModules();
  const hidden = company.hiddenModules ?? [];
  const saving = savingCompanyId === company.id;

  const handleToggle = async (module: AppModule, hide: boolean) => {
    const next = hide ? [...new Set([...hidden, module])] : hidden.filter((m) => m !== module);
    try {
      await setHiddenModules({ companyId: company.id, hiddenModules: next });
      const label = APP_MODULES.find((m) => m.module === module)?.label ?? module;
      toast.success(`${label} ${hide ? "hidden" : "shown"} for ${company.name}`);
    } catch (e) {
      toast.error(`Not changed — ${apiErrorMessage(e)}`);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      {APP_MODULES.map(({ module, label }) => (
        <Checkbox key={module} checked={hidden.includes(module)} disabled={saving} onChange={(e) => void handleToggle(module, e.target.checked)}>
          <span className="text-xs">Hide {label}</span>
        </Checkbox>
      ))}
    </div>
  );
}
