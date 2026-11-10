"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { BackLink } from "./BackLink";
import { navGroupHolding, visibleNavItems } from "./AppSidebar";

/**
 * The way back from one of a section's pages (Sales > Quotes) to the section's own page, its tiles:
 * named after the section as your menu shows it. Nothing on the section's own page, or on a page
 * your menu doesn't list under a section (an admin's Warehouse Managers is an item of its own).
 */
export function SectionBackLink({ className = "" }: { className?: string }) {
  const pathname = usePathname().replace(/\/$/, "");
  const { user } = useAuth();
  const items = visibleNavItems(user);
  const holding = navGroupHolding(items, pathname);
  const section = holding ? items.find((i) => i.path === holding) : undefined;
  if (!section || section.path === pathname) return null;
  return (
    <BackLink href={section.path} className={className}>
      {section.label}
    </BackLink>
  );
}
