import type { ReactNode } from "react";

/** The kinds of things the main search finds, in the order its groups are shown. */
export const SEARCH_KINDS = ["pages", "shipments", "masterJobs", "customers", "quotes", "invoices"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** One thing found, as a row of the dropdown or of the results page. */
export interface SearchHit {
  /** Unique across all groups. */
  key: string;
  href: string;
  /** What it is known by: a job number, a company name, a page name. */
  title: string;
  /** A line on which one it is: customer and route, IČO and city… */
  subtitle: string;
  /** A small mark at the row's end (status), if any. */
  mark?: ReactNode;
  /** The title is a reference (job, MCZ, quote or invoice number): drawn in the reference type. */
  isRef?: boolean;
}

/** A group of hits of one kind. */
export interface SearchGroup {
  kind: SearchKind;
  label: string;
  hits: SearchHit[];
  /** How many match in all; more than `hits` when the list is cut. */
  total: number;
  isLoading: boolean;
  isError: boolean;
  /** The list page that shows all of them, searched for the same text, if there is one. */
  allHref?: string;
}
