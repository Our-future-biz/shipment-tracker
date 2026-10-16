"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// A tab or sub-tab kept in the URL (?key=value), so it survives refresh, Back and shared
// links. The fallback value is left out of the URL; anything not allowed reads as the fallback.
export function useUrlParam<K extends string>(key: string, allowed: readonly K[], fallback: K): [K, (value: K) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get(key);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as K) : fallback;
  const set = useCallback(
    (next: K) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, key, fallback],
  );
  return [value, set];
}
