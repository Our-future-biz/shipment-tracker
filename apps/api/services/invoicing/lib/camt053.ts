import { createHash } from "node:crypto";

// A bank statement in CAMT.053 XML (ISO 20022 BankToCustomerStatement, camt.053.001.02 to .08), read strictly: what is
// not well-formed XML, not a camt.053 of those versions, or has an amount the app can't trust is refused with a clear
// message, never half read. No XML library is in the app, so a small parser for the subset a statement uses is here:
// elements, attributes, text, CDATA, comments and processing instructions; a DOCTYPE (and so any entity of its own) is
// refused. Pure: the file in, the statements and their entries out (services/bankStatement stores them).

export class Camt053Error extends Error {}

const MAX_DEPTH = 64;
const MAX_TEXT = 1000;
/** A statement element has a handful of attributes; a file with more is not a bank statement (and never slow to refuse). */
const MAX_ATTRS = 64;
/** A 10 MB statement holds a few hundred thousand elements; more is not a statement the app reads. */
const MAX_ELEMENTS = 500_000;

// ── XML ──

interface XmlNode {
  /** The local name (no prefix) */
  name: string;
  /** The namespace URI the element is in ("" when none) */
  ns: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9._-]*(?::[A-Za-z_][A-Za-z0-9._-]*)?$/;
const PREDEFINED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

class XmlReader {
  private i = 0;
  private elements = 0;
  constructor(private readonly s: string) {}

  private fail(message: string, at = this.i): never {
    const line = this.s.slice(0, at).split("\n").length;
    throw new Camt053Error(`The file is not well-formed XML (line ${line}): ${message}`);
  }

  private startsWith(t: string) {
    return this.s.startsWith(t, this.i);
  }

  private skipTo(end: string, what: string): string {
    const at = this.s.indexOf(end, this.i);
    if (at < 0) this.fail(`${what} is not closed`);
    const body = this.s.slice(this.i, at);
    this.i = at + end.length;
    return body;
  }

  private skipSpace() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
  }

  private decode(raw: string, at: number): string {
    if (!raw.includes("&")) return raw;
    let out = "";
    let k = 0;
    while (k < raw.length) {
      const amp = raw.indexOf("&", k);
      if (amp < 0) {
        out += raw.slice(k);
        break;
      }
      out += raw.slice(k, amp);
      const semi = raw.indexOf(";", amp);
      if (semi < 0 || semi - amp > 12) this.fail("a bare '&' (write &amp;)", at + amp);
      const name = raw.slice(amp + 1, semi);
      let ch: string | undefined = PREDEFINED[name];
      if (ch === undefined) {
        const m = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(name);
        if (!m) this.fail(`unknown entity &${name};`, at + amp);
        const cp = m[1] ? parseInt(m[1], 16) : parseInt(m[2]!, 10);
        if (cp < 1 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) this.fail(`character &${name}; is not allowed`, at + amp);
        ch = String.fromCodePoint(cp);
      }
      out += ch;
      k = semi + 1;
    }
    return out;
  }

  private readName(): string {
    const start = this.i;
    while (this.i < this.s.length && !/[\s/>=]/.test(this.s[this.i]!)) this.i++;
    const name = this.s.slice(start, this.i);
    if (!NAME.test(name)) this.fail(`"${name.slice(0, 40)}" is not an element or attribute name`, start);
    return name;
  }

  /** Comments, processing instructions and white space between elements (before and after the root). */
  private skipMisc() {
    for (;;) {
      this.skipSpace();
      if (this.startsWith("<!--")) {
        this.i += 4;
        this.skipTo("-->", "A comment");
      } else if (this.startsWith("<?")) {
        this.i += 2;
        this.skipTo("?>", "A processing instruction");
      } else if (this.startsWith("<!DOCTYPE") || this.startsWith("<!doctype")) {
        this.fail("a DOCTYPE is not allowed in a bank statement");
      } else return;
    }
  }

  read(): XmlNode {
    if (this.s.charCodeAt(0) === 0xfeff) this.i = 1;
    this.skipMisc();
    if (!this.startsWith("<") || this.startsWith("</")) this.fail("no root element");
    const root = this.element(new Map(), 0);
    this.skipMisc();
    if (this.i < this.s.length) this.fail("content after the root element");
    return root;
  }

  private element(parentNs: Map<string, string>, depth: number): XmlNode {
    if (depth > MAX_DEPTH) this.fail("elements nested too deep");
    if (++this.elements > MAX_ELEMENTS) this.fail(`more than ${MAX_ELEMENTS} elements: this is not a bank statement the app reads`);
    const tagAt = this.i;
    this.i++; // <
    const qname = this.readName();
    const rawAttrs: [string, string][] = [];
    const attrNames = new Set<string>();
    let selfClosing = false;
    for (;;) {
      const before = this.i;
      this.skipSpace();
      if (this.startsWith("/>")) {
        this.i += 2;
        selfClosing = true;
        break;
      }
      if (this.startsWith(">")) {
        this.i++;
        break;
      }
      if (this.i >= this.s.length) this.fail(`the tag <${qname}> is not closed`, tagAt);
      if (this.i === before) this.fail(`no space before an attribute of <${qname}>`);
      const attrAt = this.i;
      const name = this.readName();
      this.skipSpace();
      if (this.s[this.i] !== "=") this.fail(`attribute ${name} has no value`, attrAt);
      this.i++;
      this.skipSpace();
      const quote = this.s[this.i];
      if (quote !== '"' && quote !== "'") this.fail(`attribute ${name}'s value is not in quotes`, attrAt);
      this.i++;
      const valueAt = this.i;
      const raw = this.skipTo(quote, `The value of attribute ${name}`);
      if (raw.includes("<")) this.fail(`'<' in the value of attribute ${name}`, valueAt);
      if (attrNames.has(name)) this.fail(`attribute ${name} given twice`, attrAt);
      if (attrNames.size >= MAX_ATTRS) this.fail(`<${qname}> has more than ${MAX_ATTRS} attributes`, attrAt);
      attrNames.add(name);
      rawAttrs.push([name, this.decode(raw, valueAt)]);
    }

    // Namespaces: declarations on this element, then the element's own prefix resolved against them.
    let nsMap = parentNs;
    const attrs: Record<string, string> = {};
    for (const [name, value] of rawAttrs) {
      if (name === "xmlns" || name.startsWith("xmlns:")) {
        if (nsMap === parentNs) nsMap = new Map(parentNs);
        nsMap.set(name === "xmlns" ? "" : name.slice(6), value);
      } else {
        attrs[name.includes(":") ? name.slice(name.indexOf(":") + 1) : name] = value;
      }
    }
    const colon = qname.indexOf(":");
    const prefix = colon < 0 ? "" : qname.slice(0, colon);
    const ns = nsMap.get(prefix);
    if (prefix && ns === undefined) this.fail(`namespace prefix "${prefix}" is not declared`, tagAt);
    const node: XmlNode = { name: colon < 0 ? qname : qname.slice(colon + 1), ns: ns ?? "", attrs, children: [], text: "" };
    if (selfClosing) return node;

    for (;;) {
      const textAt = this.i;
      const lt = this.s.indexOf("<", this.i);
      if (lt < 0) this.fail(`<${qname}> is not closed`, tagAt);
      if (lt > this.i) {
        const raw = this.s.slice(this.i, lt);
        node.text += this.decode(raw, textAt);
        this.i = lt;
      }
      if (this.startsWith("</")) {
        this.i += 2;
        const closeAt = this.i;
        const name = this.readName();
        this.skipSpace();
        if (this.s[this.i] !== ">") this.fail(`the closing tag </${name}> is not closed`, closeAt);
        this.i++;
        if (name !== qname) this.fail(`</${name}> closes <${qname}>`, closeAt);
        return node;
      }
      if (this.startsWith("<!--")) {
        this.i += 4;
        this.skipTo("-->", "A comment");
      } else if (this.startsWith("<![CDATA[")) {
        this.i += 9;
        node.text += this.skipTo("]]>", "A CDATA section");
      } else if (this.startsWith("<?")) {
        this.i += 2;
        this.skipTo("?>", "A processing instruction");
      } else if (this.startsWith("<!")) {
        this.fail("a declaration is not allowed here");
      } else {
        node.children.push(this.element(nsMap, depth + 1));
      }
    }
  }
}

/** The file's bytes as text: a byte-order mark, else the XML declaration's encoding, else UTF-8 (strict). */
export function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return utf8(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  const head = Buffer.from(bytes.subarray(0, 200)).toString("latin1");
  const declared = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head)?.[1]?.toLowerCase();
  if (!declared || declared === "utf-8" || declared === "utf8") return utf8(bytes);
  const allowed = ["windows-1250", "cp1250", "iso-8859-2", "windows-1252", "iso-8859-1", "us-ascii"];
  if (!allowed.includes(declared)) throw new Camt053Error(`The file's encoding ${declared} is not read (UTF-8, windows-1250 or ISO-8859-2 are)`);
  try {
    return new TextDecoder(declared === "cp1250" ? "windows-1250" : declared).decode(bytes);
  } catch {
    throw new Camt053Error(`The file's encoding ${declared} could not be read`);
  }
}

function utf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Camt053Error("The file is not valid UTF-8 text");
  }
}

// ── CAMT.053 ──

/** One money movement on the account. Several transactions booked as one entry become one entry each (see split). */
export interface CamtEntry {
  /** The same movement read from another file has the same key (the bank's reference; else a hash of its facts) */
  key: string;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  /** Money in (CRDT) */
  credit: boolean;
  /** The bank took an earlier entry back (RvslInd): never a customer's payment */
  reversal: boolean;
  /** BOOK; a pending or information-only entry is not money on the account yet */
  booked: boolean;
  variableSymbol: string;
  constantSymbol: string;
  specificSymbol: string;
  endToEndId: string;
  counterpartyName: string;
  counterpartyAccount: string;
  /** What the payer wrote (RmtInf/Ustrd) and the document numbers they gave (Strd/RfrdDocInf/Nb) */
  message: string;
}

export interface CamtStatement {
  /** Stmt/Id */
  id: string;
  iban: string;
  currency: string;
  fromDate: string | null;
  toDate: string | null;
  entries: CamtEntry[];
}

export interface CamtFile {
  /** e.g. camt.053.001.02 */
  version: string;
  statements: CamtStatement[];
}

const CAMT_NS = /^urn:iso:std:iso:20022:tech:xsd:camt\.053\.001\.(\d{2})$/;
const FIRST_VERSION = 2;
const LAST_VERSION = 8;

/** The first child (in the statement's namespace) along a path of local names. */
function child(node: XmlNode | undefined, ns: string, ...path: string[]): XmlNode | undefined {
  let at = node;
  for (const name of path) {
    at = at?.children.find((c) => c.name === name && c.ns === ns);
    if (!at) return undefined;
  }
  return at;
}

function childrenOf(node: XmlNode | undefined, ns: string, name: string): XmlNode[] {
  return node ? node.children.filter((c) => c.name === name && c.ns === ns) : [];
}

const clip = (s: string) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s);
const clean = (s: string) => clip(s.replace(/\s+/g, " ").trim());

function textOf(node: XmlNode | undefined, ns: string, ...path: string[]): string {
  const n = path.length ? child(node, ns, ...path) : node;
  return n ? clean(n.text) : "";
}

/** A Dt (yyyy-mm-dd) or DtTm (its day, as the bank wrote it) under a date choice element. */
function dayOf(node: XmlNode | undefined, ns: string, what: string): string | null {
  if (!node) return null;
  const raw = textOf(node, ns, "Dt") || textOf(node, ns, "DtTm") || clean(node.text);
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!m) throw new Camt053Error(`${what} "${raw.slice(0, 30)}" is not a date`);
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) throw new Camt053Error(`${what} "${raw.slice(0, 30)}" is not a real day`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** An ActiveOrHistoricCurrencyAndAmount: digits with at most 5 decimals; more than cents is refused (never rounded away). */
function amountOf(node: XmlNode, what: string): { amount: number; currency: string; cents: number } {
  const raw = clean(node.text);
  const m = /^(\d{1,12})(?:\.(\d{1,5}))?$/.exec(raw);
  if (!m) throw new Camt053Error(`${what} "${raw.slice(0, 30)}" is not an amount`);
  const decimals = (m[2] ?? "").replace(/0+$/, "");
  if (decimals.length > 2) throw new Camt053Error(`${what} ${raw} has more than 2 decimals`);
  const currency = (node.attrs.Ccy ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Camt053Error(`${what} ${raw} has no currency`);
  const cents = Number(m[1]) * 100 + Number(decimals.padEnd(2, "0"));
  return { amount: cents / 100, currency, cents };
}

function creditOf(raw: string, what: string): boolean {
  if (raw === "CRDT") return true;
  if (raw === "DBIT") return false;
  throw new Camt053Error(`${what} says "${raw.slice(0, 10)}" where CRDT or DBIT belongs`);
}

/** An account: its IBAN, else its other id. */
function accountOf(node: XmlNode | undefined, ns: string): string {
  return textOf(node, ns, "Id", "IBAN") || textOf(node, ns, "Id", "Othr", "Id");
}

/** A party's name: Nm, or Pty/Nm (camt.053.001.08). */
function partyName(node: XmlNode | undefined, ns: string): string {
  return textOf(node, ns, "Nm") || textOf(node, ns, "Pty", "Nm");
}

export interface CzechSymbols {
  variableSymbol: string;
  constantSymbol: string;
  specificSymbol: string;
}

const LABELLED = /(?:^|[^A-Za-z])(VS|KS|SS)\s*[:.=]?\s*(\d{1,10})(?!\d)/gi;

function labelled(text: string): Partial<Record<"VS" | "KS" | "SS", string>> {
  const out: Partial<Record<"VS" | "KS" | "SS", string>> = {};
  for (const m of text.matchAll(LABELLED)) {
    const kind = m[1]!.toUpperCase() as "VS" | "KS" | "SS";
    if (!out[kind]) out[kind] = m[2]!;
  }
  return out;
}

/**
 * The Czech payment symbols (variabilní, konstantní, specifický), as Czech banks put them: a structured creditor
 * reference (typed VS/KS/SS, labelled "VS:123", or bare digits = the variable symbol), the end-to-end id
 * ("/VS123/SS456/KS0308", "VS123/SS/KS"), the payer's message ("VS: 123"); last, an end-to-end id of digits only.
 * The first source that gives a symbol wins.
 */
export function czechSymbols(input: { structured: { ref: string; type: string }[]; endToEndId: string; texts: string[] }): CzechSymbols {
  const found: Partial<Record<"VS" | "KS" | "SS", string>> = {};
  const take = (more: Partial<Record<"VS" | "KS" | "SS", string>>) => {
    for (const k of ["VS", "KS", "SS"] as const) if (!found[k] && more[k]) found[k] = more[k];
  };
  for (const s of input.structured) {
    const type = s.type.trim().toUpperCase();
    const ref = s.ref.trim();
    if ((type === "VS" || type === "KS" || type === "SS") && /^\d{1,10}$/.test(ref)) take({ [type]: ref });
    else take(labelled(ref));
  }
  for (const s of input.structured) if (!s.type.trim() && /^\d{1,10}$/.test(s.ref.trim())) take({ VS: s.ref.trim() });
  take(labelled(input.endToEndId));
  for (const t of input.texts) take(labelled(t));
  if (/^\d{1,10}$/.test(input.endToEndId.trim())) take({ VS: input.endToEndId.trim() });
  return { variableSymbol: found.VS ?? "", constantSymbol: found.KS ?? "", specificSymbol: found.SS ?? "" };
}

/** What one TxDtls says (amount and direction only when it gives them). */
interface TxFacts {
  /** The transaction's own reference: the bank's (Refs/AcctSvcrRef), else the payer's TxId */
  ref: string;
  /** The bank's reference of the transaction alone (Refs/AcctSvcrRef) */
  bankRef: string;
  amount: { amount: number; currency: string; cents: number } | null;
  credit: boolean | null;
  endToEndId: string;
  debtorName: string;
  debtorAccount: string;
  creditorName: string;
  creditorAccount: string;
  ustrd: string[];
  structured: { ref: string; type: string }[];
  documentNumbers: string[];
  additional: string;
}

function txFacts(tx: XmlNode, ns: string, what: string): TxFacts {
  const amtNode = child(tx, ns, "Amt") ?? child(tx, ns, "AmtDtls", "TxAmt", "Amt") ?? child(tx, ns, "AmtDtls", "InstdAmt", "Amt");
  const cdtDbt = textOf(tx, ns, "CdtDbtInd");
  const e2e = textOf(tx, ns, "Refs", "EndToEndId");
  const parties = child(tx, ns, "RltdPties");
  const rmt = childrenOf(tx, ns, "RmtInf");
  const strd = rmt.flatMap((r) => childrenOf(r, ns, "Strd"));
  return {
    ref: textOf(tx, ns, "Refs", "AcctSvcrRef") || textOf(tx, ns, "Refs", "TxId"),
    bankRef: textOf(tx, ns, "Refs", "AcctSvcrRef"),
    amount: amtNode ? amountOf(amtNode, `${what}: the amount`) : null,
    credit: cdtDbt ? creditOf(cdtDbt, what) : null,
    endToEndId: e2e.toUpperCase() === "NOTPROVIDED" ? "" : e2e,
    debtorName: partyName(child(parties, ns, "Dbtr"), ns),
    debtorAccount: accountOf(child(parties, ns, "DbtrAcct"), ns),
    creditorName: partyName(child(parties, ns, "Cdtr"), ns),
    creditorAccount: accountOf(child(parties, ns, "CdtrAcct"), ns),
    ustrd: rmt.flatMap((r) => childrenOf(r, ns, "Ustrd")).map((u) => clean(u.text)).filter(Boolean),
    structured: strd
      .flatMap((s) => childrenOf(s, ns, "CdtrRefInf"))
      .map((c) => ({ ref: textOf(c, ns, "Ref"), type: textOf(c, ns, "Tp", "CdOrPrtry", "Prtry") || textOf(c, ns, "Tp", "CdOrPrtry", "Cd") }))
      .filter((c) => c.ref),
    documentNumbers: strd.flatMap((s) => childrenOf(s, ns, "RfrdDocInf")).map((d) => textOf(d, ns, "Nb")).filter(Boolean),
    additional: textOf(tx, ns, "AddtlTxInf"),
  };
}

const uniqueJoin = (parts: string[]) => clip([...new Set(parts.filter(Boolean))].join(" "));

function entryOf(
  base: { bookingDate: string | null; valueDate: string | null; amount: number; currency: string; credit: boolean; reversal: boolean; booked: boolean; additional: string },
  txs: TxFacts[],
): Omit<CamtEntry, "key"> {
  const first = txs[0];
  const credit = first?.credit ?? base.credit;
  const symbols = czechSymbols({
    structured: txs.flatMap((t) => t.structured),
    endToEndId: first?.endToEndId ?? "",
    texts: [...txs.flatMap((t) => t.ustrd), ...txs.map((t) => t.additional), base.additional],
  });
  const ustrd = txs.flatMap((t) => t.ustrd);
  const message = uniqueJoin([...ustrd, ...txs.flatMap((t) => t.documentNumbers)]) || uniqueJoin(txs.map((t) => t.additional)) || base.additional;
  return {
    bookingDate: base.bookingDate,
    valueDate: base.valueDate,
    amount: base.amount,
    currency: base.currency,
    credit,
    reversal: base.reversal,
    booked: base.booked,
    ...symbols,
    endToEndId: clip(txs.map((t) => t.endToEndId).filter(Boolean).join(" ")),
    // Money in: who paid; money out: who was paid.
    counterpartyName: (credit ? first?.debtorName : first?.creditorName) ?? "",
    counterpartyAccount: (credit ? first?.debtorAccount : first?.creditorAccount) ?? "",
    message,
  };
}

const hash = (parts: (string | number | boolean | null)[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);

function readStatement(stmt: XmlNode, ns: string, index: number): CamtStatement {
  const id = textOf(stmt, ns, "Id");
  const acct = child(stmt, ns, "Acct");
  const iban = accountOf(acct, ns);
  if (!iban) throw new Camt053Error(`Statement ${id || index + 1} names no account (Acct/Id)`);
  const out: CamtStatement = {
    id,
    iban,
    currency: textOf(acct, ns, "Ccy").toUpperCase(),
    fromDate: dayOf(child(stmt, ns, "FrToDt", "FrDtTm"), ns, "The statement's first day"),
    toDate: dayOf(child(stmt, ns, "FrToDt", "ToDtTm"), ns, "The statement's last day"),
    entries: [],
  };
  const seen = new Map<string, number>();
  const keyed = (key: string) => {
    // Two movements with the same facts and no bank reference (rare) stay two: the n-th one gets its number.
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  };
  childrenOf(stmt, ns, "Ntry").forEach((ntry, k) => {
    const what = `Entry ${k + 1} of statement ${id || index + 1}`;
    const amtNode = child(ntry, ns, "Amt");
    if (!amtNode) throw new Camt053Error(`${what} has no amount`);
    const amt = amountOf(amtNode, `${what}: the amount`);
    const sts = textOf(ntry, ns, "Sts") || textOf(ntry, ns, "Sts", "Cd") || textOf(ntry, ns, "Sts", "Prtry");
    const base = {
      bookingDate: dayOf(child(ntry, ns, "BookgDt"), ns, `${what}: the booking day`),
      valueDate: dayOf(child(ntry, ns, "ValDt"), ns, `${what}: the value day`),
      amount: amt.amount,
      currency: amt.currency,
      credit: creditOf(textOf(ntry, ns, "CdtDbtInd"), what),
      reversal: textOf(ntry, ns, "RvslInd").toLowerCase() === "true",
      booked: !sts || sts.toUpperCase() === "BOOK",
      additional: textOf(ntry, ns, "AddtlNtryInf"),
    };
    // The entry's key (an entry read again from another file must get the same one, two movements never one):
    // the bank's entry reference (AcctSvcrRef); else, for an entry of one transaction, that transaction's bank
    // reference; else a hash of the movement's facts. Never NtryRef alone: it only numbers the entries within one
    // statement (1, 2, 3 … again every day), so it goes into the hash, never stands for the entry.
    const bankRef = textOf(ntry, ns, "AcctSvcrRef");
    const ntryRef = textOf(ntry, ns, "NtryRef");
    const txs = childrenOf(ntry, ns, "NtryDtls").flatMap((d) => childrenOf(d, ns, "TxDtls"));
    const facts = txs.map((tx, j) => txFacts(tx, ns, `${what}, transaction ${j + 1}`));
    const factsHash = (e: Omit<CamtEntry, "key">, part: (string | number)[] = []) =>
      hash([iban, ntryRef, e.bookingDate, e.valueDate, e.amount, e.currency, e.credit, e.reversal, e.endToEndId, e.counterpartyAccount, e.message, e.variableSymbol, ...part]);

    // Several transactions in one entry (a batch): each its own entry when each gives its amount in the entry's
    // currency and they add up to it; otherwise the entry stays one, with every transaction's message.
    const splittable =
      facts.length > 1 &&
      facts.every((f) => f.amount && f.amount.currency === amt.currency) &&
      facts.reduce((sum, f) => sum + f.amount!.cents, 0) === amt.cents;
    if (splittable) {
      facts.forEach((f, j) => {
        const e = entryOf({ ...base, amount: f.amount!.amount, credit: f.credit ?? base.credit }, [f]);
        const key = bankRef ? `${iban}|${bankRef}|${f.ref || j + 1}` : f.bankRef ? `${iban}|tx:${f.bankRef}` : `${iban}|h:${factsHash(e, [f.ref, j + 1])}`;
        out.entries.push({ key: keyed(key), ...e });
      });
      return;
    }
    const e = entryOf(base, facts);
    const key = bankRef ? `${iban}|${bankRef}` : facts.length === 1 && facts[0]!.bankRef ? `${iban}|tx:${facts[0]!.bankRef}` : `${iban}|h:${factsHash(e)}`;
    out.entries.push({ key: keyed(key), ...e });
  });
  return out;
}

/**
 * The booked entries of a file, each once: pending and information-only entries are not money on the account yet; an
 * entry given twice in the file (the same key) is one.
 */
export function bookedEntriesOnce(file: CamtFile): CamtEntry[] {
  const seen = new Set<string>();
  const out: CamtEntry[] = [];
  for (const e of file.statements.flatMap((s) => s.entries)) {
    if (!e.booked || seen.has(e.key)) continue;
    seen.add(e.key);
    out.push(e);
  }
  return out;
}

/** Reads a CAMT.053 file (its bytes, or text already decoded). Throws Camt053Error with what is wrong. */
export function parseCamt053(content: Uint8Array | string): CamtFile {
  const text = typeof content === "string" ? content : decodeXmlBytes(content);
  if (!text.trim()) throw new Camt053Error("The file is empty");
  const root = new XmlReader(text).read();
  const m = CAMT_NS.exec(root.ns);
  if (root.name !== "Document" || !m) {
    const hint = /camt\.05[24]/.test(root.ns) ? " (this looks like a camt.052 or camt.054 report, not a statement)" : "";
    throw new Camt053Error(`This is not a CAMT.053 bank statement${hint}`);
  }
  const v = Number(m[1]);
  if (v < FIRST_VERSION || v > LAST_VERSION) throw new Camt053Error(`camt.053.001.${m[1]} is not read (camt.053.001.02 to .08 are)`);
  const ns = root.ns;
  const body = child(root, ns, "BkToCstmrStmt");
  if (!body) throw new Camt053Error("This is not a CAMT.053 bank statement (no BkToCstmrStmt)");
  const stmts = childrenOf(body, ns, "Stmt");
  if (!stmts.length) throw new Camt053Error("The file holds no statement (Stmt)");
  return { version: `camt.053.001.${m[1]}`, statements: stmts.map((s, i) => readStatement(s, ns, i)) };
}
