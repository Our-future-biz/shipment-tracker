import type { ReactNode } from "react";
import { LINK_CLASS } from "@/components/linkClass";

// How the Tariffs pages write a missing value, a fact of a layout and a layout's terms.

/** A word in grey for what is not there: "none", "—". */
export const muted = (text: string) => <span className="text-slate-400">{text}</span>;

interface FactProps {
  label: string;
  children: ReactNode;
}

/** A fact of how a file was read, as those who cannot change it see it. */
export const Fact = ({ label, children }: FactProps) => (
  <div className="min-w-0">
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="text-[13px] text-slate-800 mt-0.5">{children}</div>
  </div>
);

interface LayoutTermsProps {
  conditions: string[];
  links: { label: string; url: string }[];
}

/** A layout's terms and links, as text. */
export const LayoutTerms = ({ conditions, links }: LayoutTermsProps) => (
  <>
    {conditions.length > 0 && (
      <Fact label="Conditions">
        <ul className="m-0 pl-4 flex flex-col gap-0.5">
          {conditions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </Fact>
    )}
    {links.length > 0 && (
      <Fact label="Links">
        <ul className="m-0 pl-0 list-none flex flex-col gap-0.5">
          {links.map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </Fact>
    )}
  </>
);
