/** A buying line's real cost as the server holds it: what each real-cost save sends it was (mock test run F1). */
export interface RealCost {
  realQty: string | null;
  realAmount: string | null;
  realCurrency: string;
}

/** The real cost a save was typed on, as the server reads it: "" for no quantity or amount. */
export interface RealCostWas {
  realQtyWas: string;
  realAmountWas: string;
  realCurrencyWas: string;
}

export const realCostWas = (c: RealCost): RealCostWas => ({
  realQtyWas: c.realQty ?? "",
  realAmountWas: c.realAmount ?? "",
  realCurrencyWas: c.realCurrency,
});

/** A real-cost save that never ran: one before it on the same line was refused as changed meanwhile. */
export class RealCostSaveDropped extends Error {
  constructor() {
    super("Not saved: this line's real cost was changed meanwhile");
    this.name = "RealCostSaveDropped";
  }
}

interface Line {
  tail: Promise<unknown>;
  /** The real cost as the line's last own save left it (from its answer), else as the row was drawn. */
  known: RealCost;
  waiting: number;
  dropped: boolean;
}

export interface RealCostSave<T extends RealCost> {
  /** The row as drawn when the save was asked for: used only when no own save of the line is still running. */
  drawn: RealCost;
  /** What else the save waits for (the line's invoice number save). */
  after?: Promise<unknown>;
  /** The save itself, handed all three was-values as the line is when it runs; answers the line as saved. */
  save: (was: RealCostWas) => Promise<T>;
  /** Whether a refusal is the server's "changed meanwhile by someone else". */
  changedMeanwhile: (err: unknown) => boolean;
  /** Called once when it is: the costs are loaded again. */
  onChanged: () => void;
}

/**
 * A line's real cost saves (Qty, Real Cost, Cur) one after another (mock council S1-06), each sending all three
 * was-values (mock test run F1, M1): a currency picked after an amount someone else changed is refused too, not
 * written beside their amount. The was-values are read when the save runs, from what the line's previous own save
 * answered - not the row as last drawn - so one's own second save queued behind the first (1450 retyped to 1405, a
 * currency picked twice) is not refused as changed meanwhile (mock test run F1, M2). Once one is refused as changed
 * meanwhile, the line's saves still waiting are dropped (rejected with RealCostSaveDropped) and the costs reloaded.
 */
export const realCostQueue = () => {
  const lines = new Map<string, Line>();
  return <T extends RealCost>(id: string, { drawn, after, save, changedMeanwhile, onChanged }: RealCostSave<T>): Promise<T> => {
    let line = lines.get(id);
    if (!line) {
      line = { tail: Promise.resolve(), known: drawn, waiting: 0, dropped: false };
      lines.set(id, line);
    }
    const l = line;
    l.waiting += 1;
    const saving = Promise.all([l.tail, after]).then(async () => {
      if (l.dropped) throw new RealCostSaveDropped();
      try {
        const saved = await save(realCostWas(l.known));
        l.known = { realQty: saved.realQty, realAmount: saved.realAmount, realCurrency: saved.realCurrency };
        return saved;
      } catch (err) {
        if (changedMeanwhile(err)) {
          l.dropped = true;
          onChanged();
        }
        throw err;
      }
    });
    l.tail = saving.catch(() => undefined);
    // Idle again: the next save starts from the row as drawn then, which shows others' changes loaded meanwhile.
    void l.tail.then(() => {
      l.waiting -= 1;
      if (l.waiting === 0 && lines.get(id) === l) lines.delete(id);
    });
    return saving;
  };
};
