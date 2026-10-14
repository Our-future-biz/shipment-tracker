// Loads every row of a list the API hands out by key: each request asks for the rows after the
// last one already loaded, in the order of their ids. A walk by offset skips a row when an earlier
// one is deleted meanwhile and repeats one when a row is created; a walk by id can do neither. The
// rows come in id order - whoever calls sorts them. A page that fails fails the whole load: part
// of a list is never returned as if it were all of it.

// What the API takes for "from the beginning": every row comes after the nil id. A first request
// without an id would be a page of the sorted list, and the rows before its last one in id order
// would be skipped.
const BEFORE_FIRST_ID = "00000000-0000-0000-0000-000000000000";

// The most rows the API returns for one request.
const PAGE_SIZE = 200;

/** How far a load has come: the rows loaded so far, and how many the list holds in all. */
export interface LoadProgress {
  loaded: number;
  total: number;
}

interface KeyedPage<T> {
  pagination: { total: number; limit: number };
  data: T[];
}

export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (afterId: string, limit: number) => Promise<KeyedPage<T>>,
  onProgress?: (progress: LoadProgress) => void,
): Promise<T[]> {
  const rows: T[] = [];
  let afterId = BEFORE_FIRST_ID;
  for (;;) {
    const page = await fetchPage(afterId, PAGE_SIZE);
    rows.push(...page.data);
    onProgress?.({ loaded: rows.length, total: page.pagination.total });
    const last = page.data[page.data.length - 1];
    // The page says how many rows the server was ready to return; fewer than that is the end.
    if (!last || page.data.length < page.pagination.limit) return rows;
    // A server that hands back the same last row again would make this loop forever.
    if (last.id <= afterId) throw new Error("The list did not advance from one page to the next");
    afterId = last.id;
  }
}
