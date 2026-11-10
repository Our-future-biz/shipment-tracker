"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { navLabelOf } from "@/components/AppSidebar";

// A record's page (a customer, a shipment) is opened from all over the app, so it remembers where
// the user came from and offers the way back beside its own list. The page is noted as it is
// opened, with its address as it was left (a shipment's tab, a master job's tab, a list's filters),
// and kept per browser tab, so it survives a reload and moving between the record's own tabs.

/** The page a record's page was opened from. */
export interface CameFrom {
  /** The record whose page was opened. */
  id: string;
  href: string;
}

const segmentsOf = (href: string) => href.replace(/\?.*$/, "").split("/").filter(Boolean);

/** The id of the `section` record a page shows (/customers/<id>/), or null for any other page. */
export function recordIdOf(section: string, href: string): string | null {
  const [first, id] = segmentsOf(href);
  return first === section && id ? id : null;
}

// What to remember after moving from `previous` to `current`. Only opening a record's page changes
// it. Coming from the section's own list or another of its records there is nothing to offer beyond
// the link to the list; moving within the same record's page keeps what was noted when it opened.
export function nextCameFrom(section: string, stored: CameFrom | null, previous: string | null, current: string): CameFrom | null {
  const id = recordIdOf(section, current);
  if (!id || previous === null) return stored;
  if (segmentsOf(previous)[0] === section) return recordIdOf(section, previous) === id ? stored : null;
  return { id, href: previous };
}

// What the link is called: the quote's number, or the page's name in `user`'s menu.
export function cameFromLabel(href: string, user: { role: string } | null): string {
  const segments = segmentsOf(href);
  if (segments[0] === "sales" && segments[1] === "quote" && segments[2]) return segments[2];
  return navLabelOf(`/${segments.join("/")}`, user) ?? "Previous page";
}

/** The master job a Master Jobs address has open (?open=<id>), or null. */
export function openMasterJobOf(href: string): string | null {
  if (segmentsOf(href)[0] !== "master-jobs") return null;
  return new URLSearchParams(href.split("?")[1] ?? "").get("open");
}

// One section's note, kept in sessionStorage under its own key.
function cameFromStore(section: string, key: string) {
  const listeners = new Set<() => void>();
  const read = (): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const parse = (raw: string | null): CameFrom | null => {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<CameFrom>;
      return typeof value.id === "string" && typeof value.href === "string" ? { id: value.id, href: value.href } : null;
    } catch {
      return null;
    }
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return {
    track(previous: string | null, current: string) {
      const stored = parse(read());
      const next = nextCameFrom(section, stored, previous, current);
      if (next === stored) return;
      try {
        if (next) sessionStorage.setItem(key, JSON.stringify(next));
        else sessionStorage.removeItem(key);
      } catch {
        // Storage unavailable: the record's page just offers its list.
      }
      listeners.forEach((listener) => listener());
    },
    /** Where this record's page leads back to, or null when there is nowhere but its list. */
    useHref(id: string): string | null {
      const cameFrom = parse(useSyncExternalStore(subscribe, read, () => null));
      return cameFrom?.id === id ? cameFrom.href : null;
    },
  };
}

export const customerCameFrom = cameFromStore("customers", "customers:came-from");
export const shipmentCameFrom = cameFromStore("shipments", "shipments:came-from");
const STORES = [customerCameFrom, shipmentCameFrom];

let lastHref: string | null = null;

// Sits in the app shell and sees every move. Needs a Suspense boundary, for useSearchParams.
export function CameFromTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const href = search ? `${pathname}?${search}` : pathname;
    for (const store of STORES) store.track(lastHref, href);
    lastHref = href;
  }, [pathname, search]);
  return null;
}
