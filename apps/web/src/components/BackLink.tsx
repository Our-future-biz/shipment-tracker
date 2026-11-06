import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { LINK } from "@/styles/ui";

interface BackLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  // Off for a second way back beside another, which carries the arrow for both.
  arrow?: boolean;
}

// The way back from a record: a link above its title, named after the place it leads to.
// A real link, so that place can also be opened in a new tab, in the app's link colour (LINK).
export function BackLink({ href, children, className = "", arrow = true }: BackLinkProps) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 text-[13px] ${LINK} ${className}`}>
      {arrow && <ArrowLeftOutlined className="text-[11px]" />}
      {children}
    </Link>
  );
}
