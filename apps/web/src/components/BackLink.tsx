import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";

interface BackLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  // Off for a second way back beside another, which carries the arrow for both.
  arrow?: boolean;
}

// The way back from a record: a link above its title, named after the place it leads to.
// A real link, so that place can also be opened in a new tab. The colours need "!": antd gives
// every <a> its own link colour in unlayered CSS, which wins over a plain utility.
export function BackLink({ href, children, className = "", arrow = true }: BackLinkProps) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 text-[13px] !text-indigo-500 hover:!text-indigo-600 ${className}`}>
      {arrow && <ArrowLeftOutlined className="text-[11px]" />}
      {children}
    </Link>
  );
}
