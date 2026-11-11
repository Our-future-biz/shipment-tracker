import type { SearchGroup, SearchHit } from "./searchTypes";

/**
 * The hit Enter opens in the main search: the picked one (`active`, counted across the groups in
 * their order), and only when it was found for the text in the box. While that text is still being
 * waited for (`ready` false: the debounce) or while the hit's group still shows the answer for the
 * text before, the hit is one of an earlier text: null then, and Enter opens the page of all results
 * for what is typed.
 */
export function hitToOpen(groups: SearchGroup[], active: number, ready: boolean): SearchHit | null {
  if (!ready || active < 0) return null;
  let index = 0;
  for (const group of groups) {
    for (const hit of group.hits) {
      if (index === active) return group.isLoading ? null : hit;
      index++;
    }
  }
  return null;
}
