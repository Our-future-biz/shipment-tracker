// What each star means, shown where a manager rates a supplier, so stars mean the same for everyone
// (Council Outlay 7, D8). The server asks for a reason up to 2 stars (D7): those warn the next person.

export const REASON_REQUIRED_UP_TO = 2;

export const RATING_MEANINGS: readonly { stars: number; title: string; text: string }[] = [
  { stars: 0, title: "Do not use", text: "Do not use, or only under an open corrective action." },
  { stars: 1, title: "Last resort", text: "Serious failures; use only with a manager's agreement." },
  { stars: 2, title: "Use with caution", text: "Repeated delays or claims; prefer another supplier where there is one." },
  { stars: 3, title: "Acceptable", text: "Usable, with occasional delays, POD chasing or invoice corrections." },
  { stars: 4, title: "Reliable", text: "Rare, minor issues, solved without being chased." },
  { stars: 5, title: "First choice", text: "No service failures or claims of note in 12 months; POD and invoices clean." },
];

/** Whether a reason must go with this rating. */
export const reasonRequired = (rating: number | null): boolean => rating !== null && rating <= REASON_REQUIRED_UP_TO;
