import type { ReactNode } from "react";
import { CARD, CARD_BAR, CARD_TITLE } from "@/styles/ui";

interface PortalCardProps {
  /** Czech and English (Bi), so not a plain string as SectionCard's. */
  title: ReactNode;
  /** On the right of the title bar, e.g. a consignment's reference. */
  extra?: ReactNode;
  children: ReactNode;
}

// A card of the haulier pages in the app's look (styles/ui.ts, as SectionCard): white, the indigo
// title bar, the content under it.
export const PortalCard = ({ title, extra, children }: PortalCardProps) => (
  <section className={`${CARD} overflow-hidden`}>
    <div className={CARD_BAR}>
      <h2 className={`${CARD_TITLE} min-w-0`}>{title}</h2>
      {extra && <div className="ml-auto shrink-0">{extra}</div>}
    </div>
    <div className="p-4">{children}</div>
  </section>
);
