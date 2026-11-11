import type { Icon } from "@phosphor-icons/react";
import { fold } from "@/lib/fold";

/** A page of the app the main search can lead to: a sidebar item or one of its sub-pages. */
export interface SearchPage {
  path: string;
  /** "Exchange", or "Finance › Exchange" for a sub-page. */
  label: string;
  description: string;
  icon: Icon;
}

interface MenuItem {
  path: string;
  label: string;
  icon: Icon;
  description?: string;
  children?: { path: string; label: string; description?: string; managersOnly?: boolean }[];
}

/** Every page the user's menu lists, sections first and then their pages, each once. */
export function menuPages(items: MenuItem[], canManageSales: boolean): SearchPage[] {
  const pages: SearchPage[] = [];
  const seen = new Set<string>();
  const add = (page: SearchPage) => {
    if (seen.has(page.path)) return;
    seen.add(page.path);
    pages.push(page);
  };
  for (const item of items) {
    add({ path: item.path, label: item.label, description: item.description ?? "", icon: item.icon });
    for (const child of item.children ?? []) {
      if (child.managersOnly && !canManageSales) continue;
      add({ path: child.path, label: `${item.label} › ${child.label}`, description: child.description ?? "", icon: item.icon });
    }
  }
  return pages;
}

/**
 * The pages whose name (or its section's) holds every typed word, without regard to case or
 * accents; a page whose own name starts with the text comes first. At most `limit`.
 */
export function matchPages(pages: SearchPage[], query: string, limit: number): SearchPage[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const own = (p: SearchPage) => fold(p.label.split(" › ").pop() ?? p.label);
  const hits = pages.filter((p) => {
    const text = fold(`${p.label} ${p.description}`);
    return words.every((w) => text.includes(w));
  });
  const first = words.join(" ");
  return hits
    .map((p, i) => ({ p, i, rank: own(p).startsWith(first) ? 0 : fold(p.label).includes(first) ? 1 : 2 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.p);
}
