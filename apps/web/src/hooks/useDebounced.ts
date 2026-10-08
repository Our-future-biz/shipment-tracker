"use client";

import { useEffect, useState } from "react";

// Returns `value` once it has stopped changing for `delay` ms — e.g. a search box that
// should query only after the user pauses typing.
export function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
