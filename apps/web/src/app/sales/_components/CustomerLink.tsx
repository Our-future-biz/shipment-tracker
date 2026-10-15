"use client";

import Link from "next/link";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { LINK_CLASS } from "@/components/linkClass";

interface CustomerLinkProps {
  // The customer in the Customer Database; absent when the name was only typed.
  customerId?: string | null;
  name?: string | null;
  // The record the name was linked to no longer exists: the name is text, and says why.
  deleted?: boolean;
  // Layout only, e.g. "block truncate" in a narrow cell.
  className?: string;
}

// A customer's name wherever Sales shows one: the link to the customer's page when the quote or
// task is linked to the Customer Database, plain text when the name was only typed or its record
// was deleted - the page would open on "not found" - and the app's dash when there is none.
export function CustomerLink({ customerId, name, deleted = false, className = "" }: CustomerLinkProps) {
  if (!name) return EMPTY_CELL;
  if (!customerId || deleted) {
    return (
      <span
        className={`font-medium text-slate-700 ${className}`}
        title={deleted ? "The customer record was deleted" : "Typed by hand, not linked to a customer record"}
      >
        {name}
      </span>
    );
  }
  return (
    <Link
      href={`/customers/${customerId}`}
      // In a table whose rows open something else: the click must not open that as well.
      onClick={(e) => e.stopPropagation()}
      className={`font-medium ${LINK_CLASS} ${className}`}
    >
      {name}
    </Link>
  );
}
