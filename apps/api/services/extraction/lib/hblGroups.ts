// Pages of a pre-alert that belong to the same House Bill of Lading are one
// shipment, however many pages it runs to and however many copies were sent
// (a rated and an unrated HBL of the same shipment, for instance).

export interface ClassifiedPage {
  pageNum: number;
  fileName: string;
  type: string;
  /** House B/L number as printed on the page; "" when none was read. */
  ref: string;
}

/** "CHI/BRV/V01035" and "CHIBRVV01035" are the same House B/L. */
export function normalizeHblRef(ref: string | null | undefined): string {
  return (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * HBL pages grouped into one entry per House B/L, in the order each was first
 * met. A page without a readable number continues the HBL on the page right
 * before it in the same file (a rider or continuation sheet); otherwise it
 * stands on its own.
 */
export function groupHblPages<T extends ClassifiedPage>(pages: T[]): T[][] {
  const groups = new Map<string, T[]>();
  let previous: { fileName: string; pageNum: number; key: string } | null = null;
  for (const page of pages) {
    if (page.type !== "HBL") {
      previous = null;
      continue;
    }
    const ref = normalizeHblRef(page.ref);
    const continued: string | null =
      !ref && previous && previous.fileName === page.fileName && previous.pageNum === page.pageNum - 1
        ? previous.key
        : null;
    const key: string = ref || continued || `page-${page.pageNum}`;
    const group = groups.get(key);
    if (group) group.push(page);
    else groups.set(key, [page]);
    previous = { fileName: page.fileName, pageNum: page.pageNum, key };
  }
  return [...groups.values()];
}
