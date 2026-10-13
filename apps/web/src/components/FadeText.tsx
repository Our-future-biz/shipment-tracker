"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Tooltip } from "antd";

// The last ~5 characters of a value too long for its field fade out.
const FADE = "[mask-image:linear-gradient(to_right,#000_calc(100%-5ch),transparent)]";

interface FadeTextProps {
  children: ReactNode;
  /** The whole value, shown after hovering 1 s; defaults to the children. */
  full?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Browser hint shown while the text fits (it would cover the full-text popup otherwise). */
  title?: string;
}

/**
 * One line of text that stops at the edge of its field instead of running into the next one.
 * When it does not fit, its end fades out, and keeping the cursor on it for 1 s shows it all.
 */
export function FadeText({ children, full, className, style, title }: FadeTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  return (
    <Tooltip title={overflows ? (full ?? children) : null} mouseEnterDelay={1} placement="topLeft">
      <span
        ref={ref}
        className={`block min-w-0 overflow-hidden whitespace-nowrap ${overflows ? FADE : ""} ${className ?? ""}`}
        style={style}
        title={overflows ? undefined : title}
      >
        {children}
      </span>
    </Tooltip>
  );
}
