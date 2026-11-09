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

/** The same way back where it is a step inside a page and not a page of its own. */
export function BackButton({ onClick, children, className = "" }: { onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 text-[13px] bg-transparent border-0 p-0 cursor-pointer ${LINK} ${className}`}>
      <ArrowLeftOutlined className="text-[11px]" />
      {children}
    </button>
  );
}
