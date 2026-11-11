// The fields a user chose to see in the cards of a shipment's Details tab (useCardFields), as
// stored: { "<card id>": ["field key", ...], "<card id>#known": [...] }. A card without a choice
// shows all its fields. "#known" lists every field the card had when the choice was saved, so a
// field added to the card later shows by itself instead of staying hidden from whoever ever chose.

export type CardFieldMap = Record<string, string[]>;

const knownKey = (cardId: string) => `${cardId}#known`;

/** The stored choices out of their JSON; anything that is not an object is no choice. */
export function parseCardFields(stored: string | null | undefined): CardFieldMap {
  if (!stored) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object" ? (parsed as CardFieldMap) : {};
  } catch {
    return {};
  }
}

/** The keys of the fields a card shows, in the card's order: the chosen ones and any added since. */
export function visibleCardKeys(map: CardFieldMap, cardId: string, allKeys: string[]): string[] {
  const chosen = map[cardId];
  if (!Array.isArray(chosen)) return allKeys;
  const known = map[knownKey(cardId)];
  const isNew = (k: string) => Array.isArray(known) && !known.includes(k);
  return allKeys.filter((k) => chosen.includes(k) || isNew(k));
}

/** The choices with one field of a card shown or hidden; the other cards' stay as they are. */
export function cardWithFieldToggled(map: CardFieldMap, cardId: string, key: string, allKeys: string[]): CardFieldMap {
  const current = visibleCardKeys(map, cardId, allKeys);
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  return { ...map, [cardId]: next, [knownKey(cardId)]: allKeys };
}

/** The choices with a card back to showing all its fields. */
export function cardWithoutChoice(map: CardFieldMap, cardId: string): CardFieldMap {
  const next = { ...map };
  delete next[cardId];
  delete next[knownKey(cardId)];
  return next;
}
