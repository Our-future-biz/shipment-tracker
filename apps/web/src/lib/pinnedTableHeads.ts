// Plain tables (<table> with a <thead>, not antd's) keep their column titles in view while their
// rows scroll, the same as the antd grids (components/Table.tsx). CSS `position: sticky` cannot do it
// for most of them: a table that scrolls sideways sits in a box with `overflow-x: auto`, and such a
// box stops a sticky head. So the head is moved down by hand (a CSS transform) as far as the rows
// have scrolled past the top, and no further than the table's own end. The titles stay in the same
// table as the rows, so the columns always line up, and sideways scrolling moves them together.

/** How far to move the head down: as far as the table's top has gone above the line the titles stop at. */
export function headOffset(tableTop: number, tableHeight: number, headHeight: number, stopAt: number): number {
  const past = stopAt - tableTop;
  if (past <= 0) return 0;
  // The titles leave with the last row: never below the table's own end.
  return Math.max(0, Math.min(past, tableHeight - headHeight));
}

/** A box scrolls up and down when its overflow lets it and it holds more than it shows. */
export function scrollsVertically(overflowY: string, scrollHeight: number, clientHeight: number): boolean {
  return (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && scrollHeight > clientHeight + 1;
}

const PINNED = "table-head-pinned";

/** The line, from the window's top, that the table's titles stop at: the top of the box its rows scroll in. */
function stopLine(table: HTMLTableElement): number {
  for (let el = table.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (scrollsVertically(cs.overflowY, el.scrollHeight, el.clientHeight)) {
      return el.getBoundingClientRect().top + (parseFloat(cs.borderTopWidth) || 0);
    }
  }
  // The window scrolls it: under the top bar on a page (AppShell sets the line), at 0 elsewhere.
  return parseFloat(getComputedStyle(table).getPropertyValue("--table-sticky-top")) || 0;
}

/** A plain table whose head this moves: antd's tables pin their own, and so do heads already made sticky. */
function headToPin(table: HTMLTableElement): HTMLTableSectionElement | null {
  const head = table.tHead;
  if (!head || table.closest(".ant-table")) return null;
  // A head made sticky to the top on purpose (in a box with its own scrolling) already stays in view;
  // one sticky only to the left (a first column kept in view sideways) still needs moving down.
  const cell = head.querySelector("th, td");
  if (cell) {
    const cs = getComputedStyle(cell);
    if (cs.position === "sticky" && cs.top !== "auto") return null;
  }
  return head;
}

function place(table: HTMLTableElement): void {
  const head = headToPin(table);
  if (!head) return;
  const box = table.getBoundingClientRect();
  const offset = box.height ? headOffset(box.top, box.height, head.getBoundingClientRect().height, stopLine(table)) : 0;
  if (offset > 0) {
    head.style.transform = `translateY(${offset}px)`;
    head.classList.add(PINNED);
  } else if (head.classList.contains(PINNED)) {
    head.style.transform = "";
    head.classList.remove(PINNED);
  }
}

/**
 * Keeps every plain table's titles in view while it scrolls: on each scroll of the page or of any
 * box in it, on resizing, and when the page changes. Returns the function that stops it.
 */
export function pinTableHeads(): () => void {
  let frame = 0;
  const update = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      document.querySelectorAll<HTMLTableElement>("table").forEach(place);
    });
  };
  // Scroll events do not bubble: caught on the way down, every scrolling box is heard.
  document.addEventListener("scroll", update, { capture: true, passive: true });
  window.addEventListener("resize", update, { passive: true });
  const changes = new MutationObserver(update);
  changes.observe(document.body, { childList: true, subtree: true });
  update();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    document.removeEventListener("scroll", update, { capture: true });
    window.removeEventListener("resize", update);
    changes.disconnect();
  };
}
