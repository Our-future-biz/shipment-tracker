"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// How long a click waits for a second one before it counts as a single click. Systems allow up
// to about 0.5 s between the clicks of a double click; slower ones still never do both (below).
const DOUBLE_CLICK_MS = 400;

interface SingleOrDouble {
  /** A single click (after the double-click window has passed). */
  onSingle: () => void;
  /** A double click: the single click is then not done. */
  onDouble: () => void;
}

// Events from a portal (a hover card, a tooltip) reach the React parents of the element that
// opened it; only clicks on the element itself count.
const isOwn = (e: MouseEvent | KeyboardEvent) => (e.currentTarget as Node).contains(e.target as Node);

/**
 * Click and double-click on the same element: one click acts (opens a link, a preview), two
 * clicks edit — as everywhere else in the Shipments grid and cards, with no pencil beside it.
 * The single click waits a moment so a double click does not also do it, and once it has been
 * done a late second click no longer edits: never both. F2 edits from the keyboard.
 */
export function useSingleOrDouble({ onSingle, onDouble }: SingleOrDouble) {
  const timer = useRef<number | undefined>(undefined);
  const singleDone = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = (e: MouseEvent) => {
    if (!isOwn(e)) return;
    e.stopPropagation();
    e.preventDefault();
    // The second click of a double click: onDoubleClick does the rest.
    if (e.detail > 1) return;
    window.clearTimeout(timer.current);
    singleDone.current = false;
    // detail 0: Enter on a focused link or button, which never becomes a double click.
    const wait = e.detail === 0 ? 0 : DOUBLE_CLICK_MS;
    timer.current = window.setTimeout(() => {
      singleDone.current = true;
      onSingle();
    }, wait);
  };

  const onDoubleClick = (e: MouseEvent) => {
    if (!isOwn(e)) return;
    e.stopPropagation();
    e.preventDefault();
    window.clearTimeout(timer.current);
    if (singleDone.current) return;
    onDouble();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "F2" || !isOwn(e)) return;
    e.preventDefault();
    e.stopPropagation();
    onDouble();
  };

  return { onClick, onDoubleClick, onKeyDown };
}

interface EditableLinkProps {
  href: string;
  /** Double click (or F2): edit the value instead of following the link. */
  onEdit: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const isModified = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

/**
 * A value that is a link and can be edited: a click follows the link, a double click edits it.
 * Ctrl/Cmd/Shift-click and the middle button keep the browser's own behaviour (a new tab).
 */
export function EditableLink({ href, onEdit, className, style, children }: EditableLinkProps) {
  const router = useRouter();
  const { onClick, onDoubleClick, onKeyDown } = useSingleOrDouble({ onSingle: () => router.push(href), onDouble: onEdit });

  return (
    <Link
      href={href}
      className={className}
      style={style}
      onClick={(e) => {
        if (isModified(e) || e.button !== 0) {
          e.stopPropagation();
          return;
        }
        onClick(e);
      }}
      onDoubleClick={(e) => {
        // A modified double click opened tabs; it does not also edit.
        if (isModified(e)) {
          e.stopPropagation();
          return;
        }
        onDoubleClick(e);
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </Link>
  );
}
