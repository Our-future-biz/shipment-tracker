"use client";

import { useMemo } from "react";
import { useUsers } from "@/hooks/useUsers";
import { NO_NAMES, namesOf, type PeopleNames } from "./personNames";

/** The company's users' names by e-mail, from the list the user pickers already read (one request, cached). */
export function usePeopleNames(): PeopleNames {
  const { users } = useUsers();
  // Until the list is read `users` is a new empty list on every render: the same NO_NAMES then, so
  // what is worked out from the names isn't worked out again each time.
  const read = users.length > 0 ? users : null;
  return useMemo(() => (read ? namesOf(read) : NO_NAMES), [read]);
}
