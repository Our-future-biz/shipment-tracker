"use client";

import type { ReactNode } from "react";
import { Popover } from "antd";

interface HoverCardProps {
  /** What the card shows. */
  content: ReactNode;
  /** Called when the card opens, so what it shows can be loaded only then. */
  onOpen?: () => void;
  /** Given by a user that has to close the card itself; otherwise the pointer alone decides. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Seconds the pointer rests before the card opens. */
  delay?: number;
  /** For a tall card, which would be cut off above a name near the top edge: opens below it there. */
  flipNearTop?: boolean;
  children: ReactNode;
}

// The small card of a customer, contact or shipment that appears when the pointer rests on its
// name for a moment. Above the name, not flipped below it (antd would flip it near the top edge),
// unless the card asks for that (flipNearTop).
export const HoverCard = ({ content, onOpen, open, onOpenChange, delay = 0.6, flipNearTop = false, children }: HoverCardProps) => (
  <Popover
    // Clicks in the card (selecting text to copy, an e-mail link) stay in it: the card is a portal,
    // so they would otherwise reach the cell around the name and start editing or open the link.
    content={
      <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    }
    trigger="hover"
    mouseEnterDelay={delay}
    placement="topLeft"
    autoAdjustOverflow={flipNearTop}
    arrow={false}
    open={open}
    onOpenChange={(next) => {
      onOpenChange?.(next);
      if (next) onOpen?.();
    }}
  >
    <span className="min-w-0 max-w-full">{children}</span>
  </Popover>
);
