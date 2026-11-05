"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { navLabelOf } from "@/components/AppSidebar";
import { useShipment } from "@/hooks/useShipment";

// A customer's page is opened from all over the app (shipments, quotes, invoicing, customs...), so
// it remembers where the user came from and offers the way back beside Customer Database. The page
// is noted as it is opened, with its address as it was left (a shipment's tab, a list's filters),
// and kept per browser tab, so it survives a reload and moving between the customer's own tabs.

const KEY = "customers:came-from";

export interface CameFrom {
  customerId: string;
  href: string;
}

const segmentsOf = (href: string) => href.replace(/\?.*$/, "").split("/").filter(Boolean);

function customerIdOf(href: string): string | null {
  const [section, id] = segmentsOf(href);
  return section === "customers" && id ? id : null;
}

// What to remember after moving from `previous` to `current`. Only opening a customer's page changes
// it. Coming from the Customer Database list or another customer there is nothing to offer beyond
// the link to the list; moving within the same customer's page keeps what was noted when it opened.
export function nextCameFrom(stored: CameFrom | null, previous: string | null, current: string): CameFrom | null {
  const customerId = customerIdOf(current);
  if (!customerId || previous === null) return stored;
  if (segmentsOf(previous)[0] === "customers") return customerIdOf(previous) === customerId ? stored : null;
  return { customerId, href: previous };
}

// What the link is called: the quote's number, or the page's name in the menu.
export function cameFromLabel(href: string): string {
  const segments = segmentsOf(href);
  if (segments[0] === "sales" && segments[1] === "quote" && segments[2]) return segments[2];
  return navLabelOf(`/${segments.join("/")}`) ?? "Previous page";
}

function readStored(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): CameFrom | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CameFrom;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

let lastHref: string | null = null;

function trackNavigation(href: string) {
  const stored = parseStored(readStored());
  const next = nextCameFrom(stored, lastHref, href);
  lastHref = href;
  if (next === stored) return;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: the customer's page just offers Customer Database.
  }
  listeners.forEach((listener) => listener());
}

// Sits in the app shell and sees every move. Needs a Suspense boundary, for useSearchParams.
export function CustomerCameFromTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    trackNavigation(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
  return null;
}

// Where this customer's page leads back to, or null when there is nowhere but the list. A shipment
// is named by its job number, read by the id in its address.
export function useCustomerCameFrom(customerId: string): { href: string; label: string } | null {
  const cameFrom = parseStored(useSyncExternalStore(subscribe, readStored, () => null));
  const href = cameFrom?.customerId === customerId ? cameFrom.href : null;
  const [section, shipmentId] = href ? segmentsOf(href) : [];
  const fromShipment = section === "shipments" && !!shipmentId;
  const { shipment } = useShipment(fromShipment ? shipmentId : undefined);

  if (!href) return null;
  return { href, label: fromShipment ? shipment?.jobNumber || "Shipment" : cameFromLabel(href) };
}
