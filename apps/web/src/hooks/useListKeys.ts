"use client";

import { useRef } from "react";

/**
 * Stable React keys for an editable list whose items carry no id (e.g. quote lines stored as
 * plain JSON). Rows added at the end get a new key; call `remove(i)` when row i is deleted so
 * the rows after it keep theirs — inputs and dropdowns then stay with their own row.
 */
export function useListKeys(length: number): { keys: string[]; remove: (index: number) => void } {
  const keys = useRef<string[]>([]);
  const next = useRef(0);
  while (keys.current.length < length) keys.current.push(`row-${next.current++}`);
  if (keys.current.length > length) keys.current.length = length;
  return {
    keys: keys.current,
    remove: (index) => {
      keys.current.splice(index, 1);
    },
  };
}
