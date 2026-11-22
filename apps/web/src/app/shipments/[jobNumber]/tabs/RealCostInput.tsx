"use client";

import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { amountInBox } from "@/lib/money";
import { amountLeft, amountLoaded, amountRefused, type AmountBoxStep, type ShownAmount } from "./amountBox";

interface RealCostInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "value" | "onChange" | "onFocus" | "onBlur"> {
  /** Its part of the line's real cost as last loaded ("" for none). */
  stored: string;
  /** Told the stored value the box shows whenever that changes, and null once the box is gone: the line's saves go on it. */
  onShown: (drawn: string | null) => void;
  /** Saves what was typed; refused (or dropped), the box shows the line's stored value again. */
  onSave: (typed: string) => Promise<unknown>;
}

/** A step of the box (amountBox): its text written where there is one, and the stored value it shows told on a change. */
const take = (el: HTMLInputElement | null, box: ShownAmount, step: AmountBoxStep, onShown: (drawn: string) => void) => {
  if (el && step.write !== null) el.value = step.write;
  if (step.drawn === box.drawn) return;
  box.drawn = step.drawn;
  onShown(step.drawn);
};

/**
 * A Qty or Real Cost box of a buying line (review of system-22). Uncontrolled, as the cost tables' other amount boxes,
 * but it follows its line: a real cost loaded again is written into it while nobody types there - no remount, which
 * would take the focus from a box of another line being typed in as its line is reloaded - and it tells the line what
 * it shows (amountBox ShownAmount), which the line's saves send as was-values (mock test run F1).
 */
export function RealCostInput({ stored, onShown, onSave, ...input }: RealCostInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // Drawn once: what it shows afterwards is written by the steps below, as a defaultValue no longer reaches a box once
  // its text was written or typed.
  const [initial] = useState(() => amountInBox(stored));
  const box = useRef<ShownAmount>({ drawn: stored, focusText: null, saving: 0 });
  // The latest props, for a save answered a render or more later, and whether the box is still there by then.
  const latest = useRef({ stored, onShown, mounted: false });
  useLayoutEffect(() => {
    latest.current.stored = stored;
    latest.current.onShown = onShown;
  });

  useLayoutEffect(() => {
    const l = latest.current;
    l.mounted = true;
    l.onShown(box.current.drawn);
    return () => {
      l.mounted = false;
      l.onShown(null);
    };
  }, []);

  // The line loaded (again): shown at once when nobody is typing here.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) take(el, box.current, amountLoaded(box.current, el.value, stored), latest.current.onShown);
  }, [stored]);

  return (
    <input
      {...input}
      ref={ref}
      defaultValue={initial}
      onFocus={(e) => {
        box.current.focusText = e.currentTarget.value;
      }}
      onBlur={(e) => {
        const el = e.currentTarget;
        const b = box.current;
        const l = latest.current;
        const left = amountLeft(b, el.value, l.stored);
        b.focusText = null;
        take(el, b, left, l.onShown);
        if (left.save === null) return;
        b.saving += 1;
        void onSave(left.save).then(
          () => {
            b.saving -= 1;
            // The last own save answered: once the reload it waited for is drawn, a value that came while it ran
            // and was held back (another's, written over it on a line that is not billed) shows.
            if (b.saving === 0) {
              setTimeout(() => {
                const now = ref.current;
                if (now && l.mounted && b.saving === 0) take(now, b, amountLoaded(b, now.value, l.stored), l.onShown);
              }, 0);
            }
          },
          () => {
            b.saving -= 1;
            const refused = amountRefused(l.stored);
            if (!l.mounted) return;
            take(el, b, refused, l.onShown);
            // Back in the box meanwhile: what it shows now is what the user goes on from.
            if (b.focusText !== null) b.focusText = refused.write;
          },
        );
      }}
    />
  );
}
