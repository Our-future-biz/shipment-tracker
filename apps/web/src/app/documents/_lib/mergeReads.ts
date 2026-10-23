import { parseContainerNumbers } from "./extraction";

/** One file read into Shipments: its name and the fields read from it, by label. */
export interface FileRead {
  source: string;
  values: Record<string, string>;
}

/** A value the files gave for one field, and the files that gave it. */
export interface ReadChoice {
  value: string;
  sources: string[];
}

export interface MergedReads {
  /** Each field once: the value of the first file that has it. */
  values: Record<string, string>;
  /** The fields the files disagree on, with every value read for them (first one first). */
  choices: Record<string, ReadChoice[]>;
}

// "MAERSK  LINE" and "Maersk Line" are the same value written two ways.
const sameValueKey = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Several files read for one shipment, merged into one set of fields. Container numbers
 * are added up from all files; any other field the files disagree on keeps the first
 * file's value and lists every value read, so the user picks the right one.
 */
export function mergeReads(reads: FileRead[]): MergedReads {
  const byLabel = new Map<string, ReadChoice[]>();
  const containers: string[] = [];
  for (const { source, values } of reads) {
    for (const [label, raw] of Object.entries(values)) {
      const value = raw.trim();
      if (!value) continue;
      if (label === "Container Number") {
        for (const n of parseContainerNumbers(value)) if (!containers.includes(n)) containers.push(n);
        continue;
      }
      const seen = byLabel.get(label) ?? [];
      const same = seen.find((c) => sameValueKey(c.value) === sameValueKey(value));
      if (same) {
        if (!same.sources.includes(source)) same.sources.push(source);
      } else {
        seen.push({ value, sources: [source] });
      }
      byLabel.set(label, seen);
    }
  }

  const values: Record<string, string> = {};
  const choices: Record<string, ReadChoice[]> = {};
  for (const [label, [first, ...others]] of byLabel) {
    if (!first) continue;
    values[label] = first.value;
    if (others.length > 0) choices[label] = [first, ...others];
  }
  if (containers.length > 0) values["Container Number"] = containers.join(", ");
  return { values, choices };
}
