import type { ReactNode } from "react";
import { SectionCard } from "@/components/SectionCard";

interface ReportCardProps {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}

// One section of the Reports tab: the app's titled card (SectionCard), its extras on the right of the title bar.
export const ReportCard = ({ title, extra, children }: ReportCardProps) => (
  <SectionCard title={title} extra={extra && <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">{extra}</div>}>
    {children}
  </SectionCard>
);
