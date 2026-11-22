import { describe, expect, it, vi } from "vitest";
import { amountLeft } from "./amountBox";
import { RealCostSaveDropped, realCostQueue, realCostSaves, shownRealCost, type RealCost, type RealCostWas } from "./realCostQueue";

// A billed line as the server holds it, refusing a save whose was-values are not the line as it is now
// (the server's "changed meanwhile by someone else", mock test run F1).
const CHANGED = new Error("changed meanwhile");
const serverLine = (start: RealCost) => {
  const line = { ...start };
  const sent: RealCostWas[] = [];
  const save = (change: Partial<RealCost>) => async (was: RealCostWas) => {
    sent.push(was);
    await Promise.resolve();
    if (was.realQtyWas !== (line.realQty ?? "") || was.realAmountWas !== (line.realAmount ?? "") || was.realCurrencyWas !== line.realCurrency) throw CHANGED;
    Object.assign(line, change);
    return { ...line };
  };
  return { line, sent, save };
};
const drawn: RealCost = { realQty: null, realAmount: "1000.00", realCurrency: "CZK" };
const opts = (onChanged = vi.fn()) => ({ changedMeanwhile: (e: unknown) => e === CHANGED, onChanged });

describe("realCostQueue (mock test run F1)", () => {
  it("passes one's own amount then currency, the currency sent on the amount just saved (M2)", async () => {
    const server = serverLine(drawn);
    const run = realCostQueue();
    const amount = run("l1", { drawn, save: server.save({ realAmount: "1450.00" }), ...opts() });
    // The currency picked while the amount still saves, on the row as it was drawn then.
    const currency = run("l1", { drawn, save: server.save({ realCurrency: "EUR" }), ...opts() });
    await expect(amount).resolves.toMatchObject({ realAmount: "1450.00" });
    await expect(currency).resolves.toMatchObject({ realAmount: "1450.00", realCurrency: "EUR" });
    expect(server.sent).toEqual([
      { realQtyWas: "", realAmountWas: "1000.00", realCurrencyWas: "CZK" },
      { realQtyWas: "", realAmountWas: "1450.00", realCurrencyWas: "CZK" },
    ]);
  });

  it("passes one's own retype while the first save still runs (1450, then 1405)", async () => {
    const server = serverLine(drawn);
    const run = realCostQueue();
    const first = run("l1", { drawn, save: server.save({ realAmount: "1450.00" }), ...opts() });
    const retype = run("l1", { drawn, save: server.save({ realAmount: "1405.00" }), ...opts() });
    await first;
    await expect(retype).resolves.toMatchObject({ realAmount: "1405.00" });
    expect(server.line.realAmount).toBe("1405.00");
  });

  it("sends all three was-values with every save, the currency's too (M1)", async () => {
    const server = serverLine({ realQty: "2.00", realAmount: "1000.00", realCurrency: "CZK" });
    const run = realCostQueue();
    await run("l1", { drawn: { ...server.line }, save: server.save({ realCurrency: "EUR" }), ...opts() });
    expect(server.sent).toEqual([{ realQtyWas: "2.00", realAmountWas: "1000.00", realCurrencyWas: "CZK" }]);
  });

  it("refuses a save after someone else's change, drops the rest of the row's queue and reloads once", async () => {
    const server = serverLine(drawn);
    // B saved 1200 after A's page drew 1000.
    server.line.realAmount = "1200.00";
    const run = realCostQueue();
    const onChanged = vi.fn();
    const amount = run("l1", { drawn, save: server.save({ realAmount: "1100.00" }), ...opts(onChanged) });
    const currencySave = vi.fn(server.save({ realCurrency: "EUR" }));
    const currency = run("l1", { drawn, save: currencySave, ...opts(onChanged) });
    await expect(amount).rejects.toBe(CHANGED);
    await expect(currency).rejects.toBeInstanceOf(RealCostSaveDropped);
    expect(currencySave).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(server.line).toEqual({ realQty: null, realAmount: "1200.00", realCurrency: "CZK" });
    // Idle again, a new save starts from the row as drawn after the reload.
    const reloaded = { ...server.line };
    await expect(run("l1", { drawn: reloaded, save: server.save({ realCurrency: "EUR" }), ...opts() })).resolves.toMatchObject({ realAmount: "1200.00", realCurrency: "EUR" });
  });

  it("refuses an own queued save when someone else's change lands between the two, and drops the rest", async () => {
    const server = serverLine(drawn);
    const run = realCostQueue();
    const onChanged = vi.fn();
    // B's 1300 lands right after A's first save is written, before A's queued currency runs.
    const first = run("l1", { drawn, save: (was) => server.save({ realAmount: "1450.00" })(was).then((saved) => ((server.line.realAmount = "1300.00"), saved)), ...opts(onChanged) });
    const second = run("l1", { drawn, save: server.save({ realCurrency: "EUR" }), ...opts(onChanged) });
    const thirdSave = vi.fn(server.save({ realQty: "2.00" }));
    const third = run("l1", { drawn, save: thirdSave, ...opts(onChanged) });
    await first;
    await expect(second).rejects.toBe(CHANGED);
    await expect(third).rejects.toBeInstanceOf(RealCostSaveDropped);
    expect(thirdSave).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(server.line).toEqual({ realQty: null, realAmount: "1300.00", realCurrency: "CZK" });
  });

  it("goes on after a save refused for another reason, on the line as the last save that went in left it", async () => {
    const server = serverLine(drawn);
    const run = realCostQueue();
    const onChanged = vi.fn();
    const bad = run("l1", { drawn, save: async () => { throw new Error("must be a number"); }, ...opts(onChanged) });
    const good = run("l1", { drawn, save: server.save({ realAmount: "1405.00" }), ...opts(onChanged) });
    await expect(bad).rejects.toThrow("must be a number");
    await expect(good).resolves.toMatchObject({ realAmount: "1405.00" });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("keeps rows apart", async () => {
    const a = serverLine(drawn);
    const b = serverLine(drawn);
    b.line.realAmount = "1200.00";
    const run = realCostQueue();
    const refused = run("b", { drawn, save: b.save({ realAmount: "1100.00" }), ...opts() });
    const other = run("a", { drawn, save: a.save({ realCurrency: "EUR" }), ...opts() });
    await expect(refused).rejects.toBe(CHANGED);
    await expect(other).resolves.toMatchObject({ realCurrency: "EUR" });
  });

  it("sends a second save of 1000 when 1000 is retyped while the 1450 typed over it still saves (review of system-22)", async () => {
    const server = serverLine(drawn);
    const run = realCostQueue();
    const first = amountLeft({ drawn: "1000.00", focusText: "1,000.00", saving: 0 }, "1450", "1000.00");
    const saving = run("l1", { drawn, save: server.save({ realAmount: "1450.00" }), ...opts() });
    // Back in the box while that save runs: the row still reads 1000, the box shows 1450.
    const second = amountLeft({ drawn: "1000.00", focusText: "1,450.00", saving: 1 }, "1000", "1000.00");
    expect([first.save, second.save]).toEqual(["1450", "1000"]);
    const retyped = run("l1", { drawn, save: server.save({ realAmount: "1000.00" }), ...opts() });
    await saving;
    await expect(retyped).resolves.toMatchObject({ realAmount: "1000.00" });
    expect(server.line.realAmount).toBe("1000.00");
    expect(server.sent[1]).toEqual({ realQtyWas: "", realAmountWas: "1450.00", realCurrencyWas: "CZK" });
  });
});

describe("the was-values of a real-cost save: what the boxes show (review of system-22)", () => {
  it("are the shown snapshot, not the newest row: someone else's 1200 loaded while 1100 was typed is refused", async () => {
    const server = serverLine(drawn);
    // B saved 1200, and A's page loaded it while A typed in the box, which still shows the 1000 A began on.
    server.line.realAmount = "1200.00";
    const newest: RealCost = { ...server.line };
    const run = realCostQueue();
    const onChanged = vi.fn();
    const saving = run("l1", { drawn: shownRealCost(newest, { realAmount: "1000.00" }), save: server.save({ realAmount: "1100.00" }), ...opts(onChanged) });
    await expect(saving).rejects.toBe(CHANGED);
    expect(server.sent).toEqual([{ realQtyWas: "", realAmountWas: "1000.00", realCurrencyWas: "CZK" }]);
    expect(server.line.realAmount).toBe("1200.00");
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("take a part no box shows from the row, and the currency from the row (its picker shows the row's)", () => {
    const row: RealCost = { realQty: "2.00", realAmount: "1200.00", realCurrency: "EUR" };
    expect(shownRealCost(row, { realQty: "1.00" })).toEqual({ realQty: "1.00", realAmount: "1200.00", realCurrency: "EUR" });
    expect(shownRealCost(row, undefined)).toEqual(row);
  });
});

describe("realCostSaves: the job page's one real-cost queue (review of system-22)", () => {
  it("is shared by a Costs tab left mid-save and the one opened again: the next save waits and goes on its answer", async () => {
    const server = serverLine(drawn);
    // The tab is left while its 1450 saves…
    const left = realCostSaves("shared-l1", { drawn, save: server.save({ realAmount: "1450.00" }), ...opts() });
    // …and opened again, drawn from the cached row from before that save: the user's currency is no change meanwhile.
    const onChanged = vi.fn();
    const reopened = realCostSaves("shared-l1", { drawn: { ...drawn }, save: server.save({ realCurrency: "EUR" }), ...opts(onChanged) });
    await left;
    await expect(reopened).resolves.toMatchObject({ realAmount: "1450.00", realCurrency: "EUR" });
    expect(server.sent[1]).toEqual({ realQtyWas: "", realAmountWas: "1450.00", realCurrencyWas: "CZK" });
    expect(onChanged).not.toHaveBeenCalled();
  });
});
