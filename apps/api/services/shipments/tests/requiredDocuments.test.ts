import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CUSTOMS_DOCUMENT_TYPES,
  REQUIRED_DOCUMENT_TYPES,
  REVIEWED_DOCUMENT_TYPES,
  SAFETY_PAPERWORK_TYPES,
  documentTypeLabel,
  isReviewedDocumentType,
  missingDocumentTypes,
  requiredDocumentTypes,
} from "../lib/requiredDocuments";

/**
 * The server's lists of required and reviewed documents have to match the web's
 * (apps/web/src/lib/documentTypes.ts), which the Documents and Customs tabs judge by.
 * This test is the guard against the two drifting apart.
 */

const WEB_DOCUMENT_TYPES = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../web/src/lib/documentTypes.ts");
const source = readFileSync(WEB_DOCUMENT_TYPES, "utf8");

/** The text of one exported declaration of the web file, up to the `end` that closes it. */
function declaration(exportName: string, end: string): string {
  const start = source.indexOf(`export const ${exportName}`);
  expect(start, `${exportName} not found in documentTypes.ts`).toBeGreaterThan(-1);
  const close = source.indexOf(end, start);
  expect(close, `end of ${exportName} not found`).toBeGreaterThan(start);
  return source.slice(start, close);
}

/** Every quoted text of a piece of source, in order. */
const quoted = (block: string): string[] => [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

/** The types of one group of the web's DOCUMENT_GROUPS, by its title. */
function groupTypes(title: string): string[] {
  const groups = declaration("DOCUMENT_GROUPS", "] as const;");
  const line = groups.split("\n").find((l) => l.includes(`title: "${title}"`));
  expect(line, `group "${title}" not found in DOCUMENT_GROUPS`).toBeDefined();
  const types = /types: \[([^\]]*)\]/.exec(line!);
  expect(types, `group "${title}" lists no types in place`).not.toBeNull();
  return quoted(types![1]!);
}

describe("required documents parity with the web", () => {
  it("the documents every shipment is expected to have match documentTypes.ts", () => {
    expect(quoted(declaration("REQUIRED_DOCUMENT_TYPES", "] as const;").split("[")[1]!)).toEqual([...REQUIRED_DOCUMENT_TYPES]);
  });

  it("the safety paperwork of dangerous goods matches documentTypes.ts", () => {
    expect(quoted(declaration("SAFETY_PAPERWORK_TYPES", "] as const;").split("[")[1]!)).toEqual([...SAFETY_PAPERWORK_TYPES]);
  });

  it("dangerous goods are asked for the safety paperwork on top, as the web asks", () => {
    // The web's rule, read as text: the required types, and the safety paperwork when dangerous.
    expect(declaration("requiredDocumentTypes", ";")).toContain("dangerous ? [...REQUIRED_DOCUMENT_TYPES, ...SAFETY_PAPERWORK_TYPES] : REQUIRED_DOCUMENT_TYPES");
    expect(requiredDocumentTypes(false)).toEqual([...REQUIRED_DOCUMENT_TYPES]);
    expect(requiredDocumentTypes(true)).toEqual([...REQUIRED_DOCUMENT_TYPES, "MSDS", "Dangerous Goods Declaration"]);
  });

  it("the commercial paperwork customs starts with matches documentTypes.ts", () => {
    expect(quoted(declaration("CUSTOMS_DOCUMENT_TYPES", ";").split("=")[1]!)).toEqual([...CUSTOMS_DOCUMENT_TYPES]);
  });

  it("the documents customs reviews are the web's Commercial and Customs Documents tables", () => {
    // The web's isReviewedDocumentType: DOCUMENT_GROUPS[0] and DOCUMENT_GROUPS[2].
    expect(declaration("isReviewedDocumentType", ";")).toContain("[...DOCUMENT_GROUPS[0].types, ...DOCUMENT_GROUPS[2].types]");
    const titles = [...declaration("DOCUMENT_GROUPS", "] as const;").matchAll(/title: "([^"]+)"/g)].map((m) => m[1]!);
    expect([titles[0], titles[2]]).toEqual(["Commercial Documents", "Customs Documents"]);
    expect([...groupTypes("Commercial Documents"), ...groupTypes("Customs Documents")]).toEqual([...REVIEWED_DOCUMENT_TYPES]);
    expect(isReviewedDocumentType("Invoice")).toBe(true);
    expect(isReviewedDocumentType("Bill of Lading")).toBe(false);
    expect(isReviewedDocumentType("MSDS")).toBe(false);
    expect(isReviewedDocumentType("")).toBe(false);
  });

  it("a type is shown under the web's name", () => {
    // The web keeps the names in a map that is not exported: read it where it is declared.
    const start = source.indexOf("const DOCUMENT_TYPE_LABELS");
    expect(start, "DOCUMENT_TYPE_LABELS not found in documentTypes.ts").toBeGreaterThan(-1);
    const web = [...source.slice(start, source.indexOf(";", start)).matchAll(/(\w+|"[^"]+"): "([^"]+)"/g)].map((m) => [m[1]!.replace(/"/g, ""), m[2]!]);
    expect(web.length).toBeGreaterThan(0);
    for (const [type, label] of web) expect(documentTypeLabel(type!)).toBe(label);
    // Nothing is renamed here that the web shows as stored.
    const renamed = new Set(web.map(([type]) => type));
    for (const type of quoted(declaration("DOCUMENT_TYPES", "] as const;"))) if (!renamed.has(type)) expect(documentTypeLabel(type)).toBe(type);
  });

  it("every required, safety and reviewed type is a type the web knows", () => {
    const known = quoted(declaration("DOCUMENT_TYPES", "] as const;"));
    for (const type of [...requiredDocumentTypes(true), ...REVIEWED_DOCUMENT_TYPES, ...CUSTOMS_DOCUMENT_TYPES]) expect(known).toContain(type);
  });
});

describe("missingDocumentTypes", () => {
  const file = (documentType: string, customsStatus = "") => ({ documentType, customsStatus });

  it("names the wanted types no file covers, in the order asked", () => {
    expect(missingDocumentTypes(SAFETY_PAPERWORK_TYPES, [])).toEqual(["MSDS", "Dangerous Goods Declaration"]);
    expect(missingDocumentTypes(SAFETY_PAPERWORK_TYPES, [file("MSDS")])).toEqual(["Dangerous Goods Declaration"]);
    expect(missingDocumentTypes(SAFETY_PAPERWORK_TYPES, [file("Dangerous Goods Declaration"), file("MSDS", "approved")])).toEqual([]);
  });

  it("a declined document does not stand for its type, until one that was not declined is there", () => {
    expect(missingDocumentTypes(["Invoice"], [file("Invoice", "declined")])).toEqual(["Invoice"]);
    expect(missingDocumentTypes(["Invoice"], [file("Invoice", "declined"), file("Invoice")])).toEqual([]);
  });

  it("a file with no type covers nothing", () => {
    expect(missingDocumentTypes(["Invoice"], [file("")])).toEqual(["Invoice"]);
  });
});
