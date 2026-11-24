import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The guard's history steps in a stand-in browser: a history of entries, Back delivered a moment
// later as a popstate (as browsers do), and the question answered by the test.

interface Entry {
  state: Record<string, unknown> | null;
  url: string;
}

function standInBrowser() {
  const events = new EventTarget();
  const entries: Entry[] = [
    { state: null, url: "/list" },
    { state: null, url: "/plan" },
  ];
  let at = 1;
  const confirm = vi.fn(() => true);
  const window = {
    history: {
      get state() {
        return entries[at]!.state;
      },
      pushState(state: Record<string, unknown>, _title: string, url: string) {
        entries.splice(at + 1);
        entries.push({ state, url });
        at += 1;
      },
      back() {
        setTimeout(() => {
          if (at === 0) return;
          at -= 1;
          events.dispatchEvent(new Event("popstate"));
        }, 0);
      },
    },
    location: {
      get href() {
        return entries[at]!.url;
      },
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    confirm,
  };
  return {
    window,
    confirm,
    /** The entry the browser shows: its address, and whether it is a guard's marker. */
    current: () => ({ url: entries[at]!.url, marked: !!entries[at]!.state?.__whUnsaved }),
  };
}

/** Until the popstate of a Back and the timers after it have run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("the unsaved-changes guard and the Back button", () => {
  let browser: ReturnType<typeof standInBrowser>;
  let guardScreen: (screen: string) => () => void;

  beforeEach(async () => {
    browser = standInBrowser();
    vi.stubGlobal("window", browser.window);
    vi.stubGlobal("document", new EventTarget());
    // The guard keeps its flags in the module: a fresh one for every test.
    vi.resetModules();
    ({ guardScreen } = await import("./useUnsavedGuard"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks on Back after the screen was saved once and changed again", async () => {
    const saved = guardScreen("plan");
    expect(browser.current()).toEqual({ url: "/plan", marked: true });
    // Saved: the guard takes its marker off again, with a Back of its own.
    saved();
    await settle();
    expect(browser.current()).toEqual({ url: "/plan", marked: false });
    expect(browser.confirm).not.toHaveBeenCalled();

    // Changed again, then the user's Back: it is asked about, not taken for the guard's own.
    guardScreen("plan");
    expect(browser.current().marked).toBe(true);
    browser.confirm.mockReturnValueOnce(false);
    browser.window.history.back();
    await settle();
    expect(browser.confirm).toHaveBeenCalledTimes(1);
    // "Stay": the marker is put back, the page is still the plan's.
    expect(browser.current()).toEqual({ url: "/plan", marked: true });
  });

  it("does not ask about its own Back while another screen is guarded, and asks on the next one", async () => {
    guardScreen("other");
    const saved = guardScreen("plan");
    saved();
    await settle();
    expect(browser.confirm).not.toHaveBeenCalled();
    expect(browser.current().marked).toBe(true);

    browser.window.history.back();
    await settle();
    expect(browser.confirm).toHaveBeenCalledTimes(1);
  });

  it("leaves on Back when the user agrees to lose the changes", async () => {
    guardScreen("plan");
    browser.window.history.back();
    await settle();
    expect(browser.confirm).toHaveBeenCalledTimes(1);
    expect(browser.current()).toEqual({ url: "/list", marked: false });
  });
});
