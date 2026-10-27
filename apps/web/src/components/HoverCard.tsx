"use client";

import type { ReactNode } from "react";
import { Popover } from "antd";

interface HoverCardProps {
  /** What the card shows. */
  content: ReactNode;
  /** Called when the card opens, so what it shows can be loaded only then. */
  onOpen?: () => void;
  children: ReactNode;
}

// The small card of a customer, contact or shipment that appears when the pointer rests on its
// name for a moment. Always above the name, never flipped below it (antd would flip it near the
// top edge).
export const HoverCard = ({ content, onOpen, children }: HoverCardProps) => (
  <Popover
    // Clicks in the card (selecting text to copy, an e-mail link) stay in it: the card is a portal,
    // so they would otherwise reach the cell around the name and start editing or open the link.
    content={
      <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    }
    trigger="hover"
    mouseEnterDelay={0.6}
    placement="topLeft"
    autoAdjustOverflow={false}
    arrow={false}
    onOpenChange={(open) => open && onOpen?.()}
  >
    <span className="min-w-0 max-w-full">{children}</span>
  </Popover>
);
