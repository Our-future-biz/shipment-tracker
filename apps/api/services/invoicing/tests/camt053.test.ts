import { describe, expect, it } from "vitest";
import { bookedEntriesOnce, Camt053Error, czechSymbols, decodeXmlBytes, parseCamt053 } from "../lib/camt053";

// Sample statements written for these tests in the shape Czech banks send (camt.053.001.02 as most do, .001.08 as the
// newer exports): one CZK credit with the symbols in the end-to-end id, a EUR credit with the invoice number in the
// message, a debit, a batch of two transactions in one entry; then the errors a reader must refuse.

const IBAN = "CZ6508000000192000145399";

const V02 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>CAMT053-20261117-0001</MsgId><CreDtTm>2026-11-18T05:12:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>2026-11-17-0145399</Id>
      <ElctrncSeqNb>221</ElctrncSeqNb>
      <CreDtTm>2026-11-18T05:12:00</CreDtTm>
      <FrToDt><FrDtTm>2026-11-17T00:00:00</FrDtTm><ToDtTm>2026-11-17T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CZK</Ccy><Ownr><Nm>CTO Global Logistics s.r.o.</Nm></Ownr></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="CZK">150000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-11-17</Dt></Dt></Bal>
      <Ntry>
        <NtryRef>1</NtryRef>
        <Amt Ccy="CZK">1210.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-17</Dt></BookgDt>
        <ValDt><Dt>2026-11-17</Dt></ValDt>
        <AcctSvcrRef>20261117-48211</AcctSvcrRef>
        <BkTxCd><Prtry><Cd>10000405000</Cd><Issr>CBA</Issr></Prtry></BkTxCd>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>/VS0000000031/SS/KS0308</EndToEndId></Refs>
          <RltdPties>
            <Dbtr><Nm>Gama Elektro a.s.</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>CZ5503000000000123456789</IBAN></Id></DbtrAcct>
          </RltdPties>
          <RmtInf><Ustrd>Platba faktury &amp; dopravy</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
        <AddtlNtryInf>Příchozí úhrada</AddtlNtryInf>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">520.30</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><DtTm>2026-11-17T10:42:00+01:00</DtTm></BookgDt>
        <ValDt><Dt>2026-11-17</Dt></ValDt>
        <AcctSvcrRef>20261117-48212</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
          <AmtDtls><TxAmt><Amt Ccy="EUR">520.30</Amt></TxAmt></AmtDtls>
          <RltdPties><Dbtr><Nm>Spedition Müller GmbH</Nm></Dbtr><DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct></RltdPties>
          <RmtInf><Ustrd>Invoice INV2026CZ00000028-001</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="CZK">8400.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-17</Dt></BookgDt>
        <ValDt><Dt>2026-11-17</Dt></ValDt>
        <AcctSvcrRef>20261117-48213</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>/VS2026114/SS/KS</EndToEndId></Refs>
          <RltdPties><Cdtr><Nm>Autodoprava Novák</Nm></Cdtr><CdtrAcct><Id><Othr><Id>19-2000145399/0800</Id></Othr></Id></CdtrAcct></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="CZK">3000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-11-17</Dt></BookgDt>
        <AcctSvcrRef>20261117-48214</AcctSvcrRef>
        <NtryDtls>
          <Btch><NbOfTxs>2</NbOfTxs></Btch>
          <TxDtls>
            <Refs><AcctSvcrRef>48214-1</AcctSvcrRef><EndToEndId>VS33/SS/KS</EndToEndId></Refs>
            <AmtDtls><TxAmt><Amt Ccy="CZK">1000.00</Amt></TxAmt></AmtDtls>
            <RltdPties><Dbtr><Nm>Beta Trade s.r.o.</Nm></Dbtr></RltdPties>
            <RmtInf><Strd><CdtrRefInf><Ref>VS:0000000033</Ref></CdtrRefInf></Strd></RmtInf>
          </TxDtls>
          <TxDtls>
            <Refs><AcctSvcrRef>48214-2</AcctSvcrRef></Refs>
            <AmtDtls><TxAmt><Amt Ccy="CZK">2000.00</Amt></TxAmt></AmtDtls>
            <RltdPties><Dbtr><Nm>Delta Cargo a.s.</Nm></Dbtr></RltdPties>
            <RmtInf><Ustrd>VS: 34 KS: 0308 SS: 777</Ustrd></RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="CZK">99.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>PDNG</Sts>
        <BookgDt><Dt>2026-11-17</Dt></BookgDt>
        <AcctSvcrRef>20261117-48215</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

const V08 = `<?xml version="1.0" encoding="UTF-8"?>
<c:Document xmlns:c="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <c:BkToCstmrStmt>
    <c:GrpHdr><c:MsgId>M1</c:MsgId><c:CreDtTm>2026-11-18T06:00:00+01:00</c:CreDtTm></c:GrpHdr>
    <c:Stmt>
      <c:Id>S-0811</c:Id>
      <c:FrToDt><c:FrDtTm>2026-11-16T00:00:00+01:00</c:FrDtTm><c:ToDtTm>2026-11-16T23:59:59+01:00</c:ToDtTm></c:FrToDt>
      <c:Acct><c:Id><c:IBAN>${IBAN}</c:IBAN></c:Id><c:Ccy>CZK</c:Ccy></c:Acct>
      <c:Ntry>
        <c:Amt Ccy="CZK">5000.5</c:Amt>
        <c:CdtDbtInd>CRDT</c:CdtDbtInd>
        <c:Sts><c:Cd>BOOK</c:Cd></c:Sts>
        <c:BookgDt><c:Dt>2026-11-16</c:Dt></c:BookgDt>
        <c:ValDt><c:Dt>2026-11-16</c:Dt></c:ValDt>
        <c:AcctSvcrRef>X-77</c:AcctSvcrRef>
        <c:NtryDtls><c:TxDtls>
          <c:Amt Ccy="CZK">5000.5</c:Amt>
          <c:CdtDbtInd>CRDT</c:CdtDbtInd>
          <c:RltdPties><c:Dbtr><c:Pty><c:Nm>Omega Freight</c:Nm></c:Pty></c:Dbtr></c:RltdPties>
          <c:RmtInf>
            <c:Strd>
              <c:RfrdDocInf><c:Nb>INV2026CZ00000040-002</c:Nb></c:RfrdDocInf>
              <c:CdtrRefInf><c:Tp><c:CdOrPrtry><c:Prtry>VS</c:Prtry></c:CdOrPrtry></c:Tp><c:Ref>40</c:Ref></c:CdtrRefInf>
            </c:Strd>
          </c:RmtInf>
        </c:TxDtls></c:NtryDtls>
      </c:Ntry>
    </c:Stmt>
  </c:BkToCstmrStmt>
</c:Document>`;

describe("parseCamt053 — camt.053.001.02", () => {
  const file = parseCamt053(Buffer.from(V02, "utf8"));
  const stmt = file.statements[0]!;
  const entries = stmt.entries;

  it("reads the statement: its id, account, currency and days", () => {
    expect(file.version).toBe("camt.053.001.02");
    expect(file.statements).toHaveLength(1);
    expect(stmt).toMatchObject({ id: "2026-11-17-0145399", iban: IBAN, currency: "CZK", fromDate: "2026-11-17", toDate: "2026-11-17" });
  });

  it("a CZK credit with VS, SS and KS in the end-to-end id", () => {
    expect(entries[0]).toMatchObject({
      key: `${IBAN}|20261117-48211`,
      bookingDate: "2026-11-17",
      valueDate: "2026-11-17",
      amount: 1210,
      currency: "CZK",
      credit: true,
      reversal: false,
      booked: true,
      variableSymbol: "0000000031",
      constantSymbol: "0308",
      specificSymbol: "",
      endToEndId: "/VS0000000031/SS/KS0308",
      counterpartyName: "Gama Elektro a.s.",
      counterpartyAccount: "CZ5503000000000123456789",
      message: "Platba faktury & dopravy",
    });
  });

  it("a EUR credit with the invoice number in the message, the day of a DtTm booking, NOTPROVIDED dropped", () => {
    expect(entries[1]).toMatchObject({
      amount: 520.3,
      currency: "EUR",
      credit: true,
      bookingDate: "2026-11-17",
      endToEndId: "",
      variableSymbol: "",
      counterpartyName: "Spedition Müller GmbH",
      message: "Invoice INV2026CZ00000028-001",
    });
  });

  it("a debit names who was paid", () => {
    expect(entries[2]).toMatchObject({ credit: false, amount: 8400, counterpartyName: "Autodoprava Novák", counterpartyAccount: "19-2000145399/0800", variableSymbol: "2026114" });
  });

  it("a batch entry of two transactions becomes two entries, each with its own amount, payer and symbols", () => {
    const batch = entries.filter((e) => e.key.startsWith(`${IBAN}|20261117-48214|`));
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({ key: `${IBAN}|20261117-48214|48214-1`, amount: 1000, variableSymbol: "0000000033", counterpartyName: "Beta Trade s.r.o." });
    expect(batch[1]).toMatchObject({ key: `${IBAN}|20261117-48214|48214-2`, amount: 2000, variableSymbol: "34", constantSymbol: "0308", specificSymbol: "777", counterpartyName: "Delta Cargo a.s." });
  });

  it("a pending entry is read but marked not booked", () => {
    expect(entries.at(-1)).toMatchObject({ amount: 99, booked: false });
    expect(entries).toHaveLength(6);
  });

  it("the same file read again gives the same keys (an entry once)", () => {
    expect(parseCamt053(V02).statements[0]!.entries.map((e) => e.key)).toEqual(entries.map((e) => e.key));
  });
});

describe("parseCamt053 — camt.053.001.08 with a prefixed namespace", () => {
  it("reads Sts/Cd, TxDtls/Amt, Dbtr/Pty/Nm, a typed VS and the document number", () => {
    const file = parseCamt053(V08);
    expect(file.version).toBe("camt.053.001.08");
    const [e] = file.statements[0]!.entries;
    expect(file.statements[0]).toMatchObject({ id: "S-0811", fromDate: "2026-11-16", toDate: "2026-11-16" });
    expect(e).toMatchObject({ key: `${IBAN}|X-77`, amount: 5000.5, credit: true, booked: true, variableSymbol: "40", counterpartyName: "Omega Freight", message: "INV2026CZ00000040-002" });
  });
});

describe("parseCamt053 — entry keys", () => {
  // Two daily statements in one file; the bank numbers its entries 1, 2, 3 … again each day (NtryRef) and gives no
  // AcctSvcrRef: each payment is its own entry, never one kept and the other dropped as "read before".
  const stmt = (day: string, amount: string, payer: string, vs: string) => `
    <Stmt>
      <Id>${day}</Id>
      <FrToDt><FrDtTm>${day}T00:00:00</FrDtTm><ToDtTm>${day}T23:59:59</ToDtTm></FrToDt>
      <Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CZK</Ccy></Acct>
      <Ntry>
        <NtryRef>1</NtryRef>
        <Amt Ccy="CZK">${amount}</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>${day}</Dt></BookgDt>
        <NtryDtls><TxDtls>
          <Refs><EndToEndId>/VS${vs}/SS/KS</EndToEndId></Refs>
          <RltdPties><Dbtr><Nm>${payer}</Nm></Dbtr></RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>`;
  const file = (...stmts: string[]) =>
    `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>M</MsgId></GrpHdr>${stmts.join("")}</BkToCstmrStmt></Document>`;

  it("two daily statements, both with NtryRef 1 and different payments, give two entries", () => {
    const parsed = parseCamt053(file(stmt("2026-11-16", "1000.00", "Alfa s.r.o.", "31"), stmt("2026-11-17", "2500.00", "Beta a.s.", "32")));
    const [a, b] = parsed.statements.map((s) => s.entries[0]!);
    expect(a!.key).not.toBe(b!.key);
    expect(a!.key).not.toBe(`${IBAN}|1`);
    const once = bookedEntriesOnce(parsed);
    expect(once.map((e) => [e.amount, e.variableSymbol])).toEqual([
      [1000, "31"],
      [2500, "32"],
    ]);
  });

  it("the same day read again from another file gets the same key; the same statement twice in a file is one", () => {
    const day = stmt("2026-11-16", "1000.00", "Alfa s.r.o.", "31");
    const once = parseCamt053(file(day)).statements[0]!.entries[0]!.key;
    expect(parseCamt053(file(stmt("2026-11-15", "10.00", "X", "1"), day)).statements[1]!.entries[0]!.key).toBe(once);
    expect(bookedEntriesOnce(parseCamt053(file(day, day)))).toHaveLength(1);
  });

  it("the same movement numbered otherwise in another file (a daily NtryRef 1, a monthly NtryRef 7) gets the same key", () => {
    const daily = stmt("2026-11-16", "1000.00", "Alfa s.r.o.", "31");
    const monthly = daily.replace("<NtryRef>1</NtryRef>", "<NtryRef>7</NtryRef>").replace("<Id>2026-11-16</Id>", "<Id>2026-11</Id>");
    expect(parseCamt053(file(monthly)).statements[0]!.entries[0]!.key).toBe(parseCamt053(file(daily)).statements[0]!.entries[0]!.key);
  });

  it("two identical movements of one statement stay two, and keep their keys in another file", () => {
    const twice = (ref: string) => stmt("2026-11-16", "1000.00", "Alfa s.r.o.", "31").replace(/<Ntry>[\s\S]*<\/Ntry>/, (n) => `${n}${n.replace("<NtryRef>1</NtryRef>", `<NtryRef>${ref}</NtryRef>`)}`);
    const keys = (xml: string) => parseCamt053(file(xml)).statements[0]!.entries.map((e) => e.key);
    const daily = keys(twice("2"));
    expect(new Set(daily).size).toBe(2);
    expect(keys(twice("9").replaceAll("<NtryRef>1</NtryRef>", "<NtryRef>8</NtryRef>"))).toEqual(daily);
  });

  it("a batch kept whole keeps the entry's direction, though a transaction the other way comes first", () => {
    const xml = file(`
      <Stmt>
        <Id>S</Id>
        <FrToDt><FrDtTm>2026-11-16T00:00:00</FrDtTm><ToDtTm>2026-11-16T23:59:59</ToDtTm></FrToDt>
        <Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CZK</Ccy></Acct>
        <Ntry>
          <Amt Ccy="CZK">985.00</Amt>
          <CdtDbtInd>CRDT</CdtDbtInd>
          <Sts>BOOK</Sts>
          <BookgDt><Dt>2026-11-16</Dt></BookgDt>
          <NtryDtls>
            <TxDtls><Amt Ccy="CZK">15.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><AddtlTxInf>Poplatek</AddtlTxInf></TxDtls>
            <TxDtls><Refs><EndToEndId>/VS28/SS/KS</EndToEndId></Refs><Amt Ccy="CZK">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></TxDtls>
          </NtryDtls>
        </Ntry>
      </Stmt>`);
    expect(parseCamt053(xml).statements[0]!.entries).toEqual([expect.objectContaining({ amount: 985, credit: true })]);
  });

  it("a reversal written as 1 (xs:boolean) is a reversal", () => {
    const entry = (ind: string) =>
      parseCamt053(file(stmt("2026-11-16", "1000.00", "Alfa s.r.o.", "31").replace("<Sts>BOOK</Sts>", `<RvslInd>${ind}</RvslInd><Sts>BOOK</Sts>`))).statements[0]!.entries[0]!;
    expect(entry("1").reversal).toBe(true);
    expect(entry("true").reversal).toBe(true);
    expect(entry("0").reversal).toBe(false);
  });

  it("a single transaction's own bank reference is the key when the entry has none", () => {
    const xml = file(stmt("2026-11-16", "1000.00", "Alfa s.r.o.", "31").replace("<Refs>", "<Refs><AcctSvcrRef>T-9</AcctSvcrRef>"));
    expect(parseCamt053(xml).statements[0]!.entries[0]!.key).toBe(`${IBAN}|tx:T-9`);
  });
});

describe("parseCamt053 — refusals", () => {
  const refused = (xml: string) => {
    try {
      parseCamt053(xml);
    } catch (err) {
      expect(err).toBeInstanceOf(Camt053Error);
      return (err as Error).message;
    }
    throw new Error("not refused");
  };

  it("malformed XML says what and where", () => {
    expect(refused(V02.replace("</Stmt>", "</Stmnt>"))).toMatch(/^The file is not well-formed XML \(line \d+\): <\/Stmnt> closes <Stmt>/);
    expect(refused(`<?xml version="1.0"?>\n<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt>`)).toMatch(/not well-formed XML \(line 2\).*not closed/);
    expect(refused(V02.replace("faktury &amp; dopravy", "faktury & dopravy"))).toMatch(/bare '&'/);
    expect(refused(V02.replace('Ccy="CZK">1210.00', "Ccy=CZK>1210.00"))).toMatch(/not in quotes/);
    expect(refused(`${V02}<x/>`)).toMatch(/content after the root element/);
    expect(refused("")).toBe("The file is empty");
  });

  it("an element with very many attributes is refused, and fast", () => {
    const attrs = Array.from({ length: 50_000 }, (_, k) => ` a${k}="x"`).join("");
    const started = Date.now();
    expect(refused(`<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"${attrs}/>`)).toMatch(/has more than 64 attributes/);
    expect(Date.now() - started).toBeLessThan(500);
    expect(refused(V02.replace('<Amt Ccy="CZK">1210.00', '<Amt Ccy="CZK" Ccy="EUR">1210.00'))).toMatch(/attribute Ccy given twice/);
  });

  it("a file of absurdly many elements is refused", () => {
    const many = "<a/>".repeat(500_001);
    expect(refused(`<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">${many}</Document>`)).toMatch(/more than 500000 elements/);
  });

  it("a DOCTYPE (entities of its own) is refused", () => {
    expect(refused(`<?xml version="1.0"?><!DOCTYPE d [<!ENTITY a "aaaa">]><Document/>`)).toMatch(/DOCTYPE is not allowed/);
  });

  it("another message, another version, no namespace", () => {
    expect(refused(V02.replaceAll("camt.053.001.02", "camt.054.001.02"))).toMatch(/not a CAMT.053 bank statement \(this looks like a camt.052 or camt.054/);
    expect(refused(V02.replaceAll("camt.053.001.02", "camt.053.001.09"))).toBe("camt.053.001.09 is not read (camt.053.001.02 to .08 are)");
    expect(refused(V02.replace(' xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"', ""))).toBe("This is not a CAMT.053 bank statement");
    expect(refused(`<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt/></Document>`)).toBe("The file holds no statement (Stmt)");
  });

  it("an amount it can't trust: more than cents, no currency, not a number; a direction that is neither", () => {
    expect(refused(V02.replace(">1210.00<", ">1210.005<"))).toMatch(/1210.005 has more than 2 decimals/);
    expect(refused(V02.replace('<Amt Ccy="CZK">1210.00</Amt>', "<Amt>1210.00</Amt>"))).toMatch(/has no currency/);
    expect(refused(V02.replace(">1210.00<", ">1 210,00<"))).toMatch(/is not an amount/);
    expect(refused(V02.replace("<CdtDbtInd>CRDT</CdtDbtInd>\n        <Sts>", "<CdtDbtInd>CR</CdtDbtInd>\n        <Sts>"))).toMatch(/^Entry 1 of .* says "CR" where CRDT or DBIT belongs/);
    expect(refused(V02.replace("<Dt>2026-11-17</Dt></BookgDt>", "<Dt>2026-02-30</Dt></BookgDt>"))).toMatch(/is not a real day/);
  });
});

describe("decodeXmlBytes", () => {
  it("UTF-8 with a BOM, windows-1250 as declared, broken UTF-8 refused", () => {
    expect(decodeXmlBytes(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("<a>ř</a>")]))).toBe("<a>ř</a>");
    // "Příchozí" in windows-1250: ř = 0xF8, í = 0xED
    const cp1250 = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="windows-1250"?><a>P'), Buffer.from([0xf8, 0xed]), Buffer.from("chozí</a>", "latin1")]);
    expect(decodeXmlBytes(cp1250)).toContain("Příchozí");
    expect(() => decodeXmlBytes(Buffer.from([0x3c, 0x61, 0x3e, 0xc3, 0x28]))).toThrow("The file is not valid UTF-8 text");
    expect(() => decodeXmlBytes(Buffer.from('<?xml version="1.0" encoding="EBCDIC"?><a/>'))).toThrow(/encoding ebcdic is not read/);
  });
});

describe("czechSymbols", () => {
  it("takes the first source that gives each symbol", () => {
    expect(czechSymbols({ structured: [{ ref: "123", type: "" }], endToEndId: "/VS999/SS/KS0308", texts: [] })).toEqual({ variableSymbol: "123", constantSymbol: "0308", specificSymbol: "" });
    expect(czechSymbols({ structured: [], endToEndId: "VS123/SS/KS", texts: ["VS:555"] }).variableSymbol).toBe("123");
    expect(czechSymbols({ structured: [], endToEndId: "", texts: ["faktura, vs 0028"] }).variableSymbol).toBe("0028");
    expect(czechSymbols({ structured: [], endToEndId: "28", texts: [] }).variableSymbol).toBe("28");
  });

  it("never reads a symbol out of a word or a longer number", () => {
    expect(czechSymbols({ structured: [], endToEndId: "OBVS123", texts: ["VS12345678901"] }).variableSymbol).toBe("");
    expect(czechSymbols({ structured: [{ ref: "RF18539007547034", type: "" }], endToEndId: "", texts: [] }).variableSymbol).toBe("");
  });
});
