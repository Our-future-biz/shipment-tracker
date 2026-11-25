import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// What the Co-Loading screens wire up, read from their source: what the pure helpers' tests can't show (review of system-25).
const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

describe("the Co-Loading screens' wiring", () => {
  it("reads a decimal comma in every money field as a decimal (DecimalInput), never antd's own reading of it as thousands", () => {
    // antd's own parser reads "2100,50" as 210050 and "85,5" as 855.
    const money = source("ServiceMoneyModal.tsx");
    expect(money).not.toMatch(/<InputNumber\b/);
    expect(money.match(/<DecimalInput\b/g)).toHaveLength(2);
    const whatIf = source("WhatIfCard.tsx");
    expect(whatIf).not.toMatch(/<InputNumber\b/);
    expect(whatIf.match(/<DecimalInput\b/g)).toHaveLength(3);
  });

  it("asks What if I add this for its rate in the currency its sum is made in", () => {
    expect(source("WhatIfCard.tsx")).toMatch(/const currency = boxCurrency\(earnings\.totals\)/);
    expect(source("EarningsTab.tsx")).not.toMatch(/currency=\{mainCurrency\}/);
  });

  it("says a load list the browser could not make in its own words, not as the server not reached", () => {
    const tab = source("SailingShipmentsTab.tsx");
    const makeList = tab.slice(tab.indexOf("const makeList"), tab.indexOf("const message = useMessages()"));
    expect(makeList).toMatch(/could not be made/);
    expect(makeList).not.toMatch(/apiErrorMessage/);
  });

  it("says a failed read on Linked shipments instead of 'nothing to copy' or 'no other sailing to come'", () => {
    const tab = source("SailingShipmentsTab.tsx");
    expect(tab).toMatch(/isError: factsFailed, error: factsError/);
    expect(tab).toMatch(/disabled=\{closed \|\| shipments\.length === 0 \|\| factsLoading \|\| factsFailed\}/);
    expect(tab).toMatch(/isError: siblingsFailed, error: siblingsError/);
    expect(tab).toMatch(/The service's sailings could not be read - \$\{apiErrorMessage\(siblingsError\)\}/);
    // Waiting shipments: a failed read is said, never an empty space.
    expect(source("WaitingShipments.tsx")).not.toMatch(/if \(isLoading \|\| isError\) return null/);
  });

  it("sends one Master Job link at a time: Enter while one is sent sends nothing", () => {
    const card = source("SailingMasterJobCard.tsx");
    expect(card).toMatch(/onPressEnter=\{handleLinkMcz\}/);
    expect(card).toMatch(/const handleLinkMcz = \(\) => \{\s*const number = mcz\.trim\(\);\s*if \(closed \|\| busy \|\| !number\) return;/);
  });

  it("saves the hand-over note with the note it started from, says a refusal in the server's words and keeps what was typed", () => {
    const tab = source("SailingLogTab.tsx");
    expect(tab).toMatch(/const request = noteRequest\(editor\);\s*try \{\s*await note\.mutateAsync\(request\);/);
    expect(tab).toMatch(/message\.error\(apiErrorMessage\(err\)\)/);
    // A read of the log never simply overwrites the box.
    expect(tab).not.toMatch(/useEffect\(\(\) => setText\(stored\)/);
    expect(tab).toMatch(/setEditor\(\(now\) => noteEditorOnRead\(now, stored\)\)/);
    const hooks = readFileSync(join(__dirname, "../../../hooks/useCoLoadingServices.ts"), "utf8");
    expect(hooks).toMatch(/mutationFn: \(input: \{ note: string; expected: string \}\) => api\.shipments\.coLoadingSailingNote\(id, input\)/);
  });

  it("says on the board that a sailing set to Departed leaves it too", () => {
    expect(source("SailingsBoard.tsx")).toMatch(/set to Departed/);
  });
});
