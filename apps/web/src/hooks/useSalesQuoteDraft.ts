"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { PROTECTED_KEYS } from "@/app/sales/_lib/types";
import { asData, stripProtected } from "@/app/sales/_lib/salesQuote";
import { quoteProblem, type QuoteProblem } from "@/app/sales/_lib/quoteProblem";
import { invalidateQuoteLists } from "./useSalesQuotes";

// A change is sent once the user has stopped editing for this long.
const AUTOSAVE_DELAY_MS = 700;

// The same client, except that its requests outlive the page (fetch keepalive). Every save is sent
// with it, so one that is on its way when the tab closes still arrives. Browsers take such a
// request only with a small body - 64 KiB for all of a page's together - and refuse a bigger one
// outright, so a quote above the limit is saved the ordinary way.
const keepaliveApi = api.with({ requestInit: { keepalive: true } });
const KEEPALIVE_MAX_BYTES = 60 * 1024;

// One key for the toast about a refused save: a refusal repeated with every change refreshes that
// toast instead of stacking a new one each time.
const SAVE_TOAST_KEY = "quote-save";

type QuoteLoadState =
  | { status: "loading" | "ready" | "notFound" }
  | { status: "error"; problem: QuoteProblem };

interface QuoteSaveState {
  /** saved: the server has every change. unsaved: changes are waiting. saving: a request is in flight. */
  status: "saved" | "unsaved" | "saving";
  /** Why the last save was refused. Stays until a save succeeds or the stored quote is loaded again. */
  problem: QuoteProblem | null;
}

const SAVED: QuoteSaveState = { status: "saved", problem: null };

/**
 * One request to an endpoint that changes what the server owns of a quote: its status, validity
 * or owner. It is handed the version of the document the page is based on, for an endpoint that
 * takes one.
 */
type QuoteAction = (expectedDataVersion: number) => Promise<{ quote: interfaces.SalesQuoteItem }>;

// Loads one sales quote and owns its edited copy while the quote page is open. The page reads and
// writes the quote through this hook only, so every rule of safe saving lives here: nothing is
// sent before the user changes something, one request at a time, each save names the version it
// is based on, and a refused save is never hidden. Status, validity, owner and history are not
// part of what is edited: the server owns them, the page changes them with `act` and shows them
// from `quote`.
export function useSalesQuoteDraft(ref: string) {
  const queryClient = useQueryClient();
  // antd's message API itself rather than useToast(): it is the same object on every render,
  // which the leave effect below needs - it must run when the page is left, not on each render -
  // and it lets a toast be replaced and taken down by its key.
  const { message } = App.useApp();

  const [load, setLoad] = useState<QuoteLoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState<SalesQuoteData>({});
  // The quote as the server last returned it. Null until it is loaded.
  const [quote, setQuote] = useState<interfaces.SalesQuoteItem | null>(null);
  const [save, setSave] = useState<QuoteSaveState>(SAVED);
  const [savedAt, setSavedAt] = useState("");

  // The working copy behind the rendered state. The autosave timer, the unload handlers and a
  // request that finishes after the page was left need the latest values, not those of a past render.
  const session = useRef({
    draft: {} as SalesQuoteData,
    // dataVersion of the stored document the draft is based on, sent with every save as
    // expectedDataVersion. Null while no quote is loaded.
    version: null as number | null,
    // Each change by the user bumps `revision`; the draft counts as unsaved until the server has
    // acknowledged that revision. Loading alone never bumps it, so opening a quote sends nothing.
    revision: 0,
    savedRevision: 0,
    save: SAVED,
    timer: null as ReturnType<typeof setTimeout> | null,
    // The save that is waiting for its turn or running; a save asked for meanwhile joins it.
    inFlight: null as Promise<QuoteSaveState> | null,
    // The last request about this quote that was asked for; the next one starts when it is done.
    queue: Promise.resolve() as Promise<unknown>,
    // The draft is being given up (discard): a save that is running finishes its request and
    // sends nothing after it.
    discarding: false,
    mounted: false,
  });

  const show = useCallback(
    (next: QuoteSaveState) => {
      // The toast about a refused save must not outlast the refusal.
      if (session.current.save.problem && !next.problem) message.destroy(SAVE_TOAST_KEY);
      session.current.save = next;
      setSave(next);
    },
    [message],
  );

  // The form is filled from this request only, never from a remembered copy: that copy can be
  // older than the stored quote, and saving it back would undo somebody's newer change.
  useEffect(() => {
    // Loaded already and the effect merely runs again (Fast Refresh while the app runs in dev
    // mode): fetching again would replace the draft and drop what the user is typing.
    if (session.current.version !== null) return;
    let cancelled = false;
    api.quotes.salesQuoteGet(ref).then(
      (res) => {
        if (cancelled) return;
        const s = session.current;
        s.draft = asData(res.quote.data);
        s.version = res.quote.dataVersion;
        queryClient.setQueryData(["sales-quote", ref], res);
        setDraft(s.draft);
        setQuote(res.quote);
        setSavedAt(res.quote.updatedAt);
        setLoad({ status: "ready" });
      },
      (err) => {
        if (cancelled) return;
        const problem = quoteProblem(err);
        setLoad(problem.kind === "notFound" ? { status: "notFound" } : { status: "error", problem });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ref, attempt, queryClient]);

  // Saves and lifecycle actions go out one at a time, in the order they were asked for: each is
  // decided by the server on what the one before it left, and may move the version the next one
  // has to name.
  const enqueue = useCallback(<T>(request: () => Promise<T>): Promise<T> => {
    const s = session.current;
    const done = s.queue.then(request);
    s.queue = done.catch(() => undefined);
    return done;
  }, []);

  const stopTimer = useCallback(() => {
    const s = session.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
  }, []);

  // What an answer of the server says about the quote is taken over: the quote itself, and into
  // the draft the keys only the server writes - status, dates, validity, owner, history - so the
  // page and the printed quotation show what is stored, also after a colleague changed it. The
  // draft is not edited by that: nothing is marked unsaved, and what the user typed stays.
  const adopt = useCallback(
    (stored: interfaces.SalesQuoteItem) => {
      const s = session.current;
      const data = asData(stored.data);
      const next = stripProtected(s.draft);
      for (const key of PROTECTED_KEYS) {
        if (key in data) Object.assign(next, { [key]: data[key] });
      }
      s.draft = next;
      setDraft(next);
      setQuote(stored);
      setSavedAt(stored.updatedAt);
      queryClient.setQueryData(["sales-quote", ref], { quote: stored });
      invalidateQuoteLists(queryClient);
    },
    [ref, queryClient],
  );

  // Sends the draft until the server has the latest change or refuses one.
  const send = useCallback(async () => {
    const s = session.current;
    // After a conflict nothing more is sent - only loading the stored quote again ends it.
    while (s.version !== null && !s.discarding && s.revision !== s.savedRevision && s.save.problem?.kind !== "conflict") {
      const revision = s.revision;
      show({ ...s.save, status: "saving" });
      try {
        const body = { data: s.draft, expectedDataVersion: s.version };
        // Measured in bytes, as the browser counts: a Czech letter takes two.
        const outlivesPage = new Blob([JSON.stringify(body)]).size <= KEEPALIVE_MAX_BYTES;
        const res = await (outlivesPage ? keepaliveApi : api).quotes.salesQuoteSave(ref, body);
        s.version = res.quote.dataVersion;
        s.savedRevision = revision;
        adopt(res.quote);
        show({ status: s.revision === revision ? "saved" : "unsaved", problem: null });
      } catch (err) {
        const problem = quoteProblem(err);
        // The remembered copy is now known to be older than the stored quote.
        if (problem.kind === "conflict") queryClient.removeQueries({ queryKey: ["sales-quote", ref] });
        show({ status: "unsaved", problem });
        break;
      }
      // Edited again during the request: the autosave timer will send that. Without a timer
      // (Save was pressed, the page is being left) it goes out right away.
      if (s.timer) break;
    }
    return s.save;
  }, [ref, queryClient, show, adopt]);

  // Saves what is waiting. Only one save waits or runs: a call made meanwhile joins it, and it
  // then sends whatever changed since.
  const flush = useCallback(() => {
    const s = session.current;
    stopTimer();
    s.inFlight ??= enqueue(send).finally(() => {
      s.inFlight = null;
    });
    return s.inFlight;
  }, [enqueue, send, stopTimer]);

  // A refused save is told as a toast too. The header and the banner that show it are at the top of
  // the page, out of sight for somebody working further down, who would go on typing into a quote
  // that is no longer saved. After a conflict nothing more is sent, so every further change is
  // answered this way. Not once the page was left: the leave effect below has its own words then.
  // Nor a refusal the page no longer shows: the draft was dropped while the request was on its
  // way (discard), and a toast raised after that would outlast the refusal - over a quote that
  // is being deleted.
  const announce = useCallback(
    (result: QuoteSaveState) => {
      const s = session.current;
      if (result.problem && s.save.problem === result.problem && s.mounted) {
        message.error({ key: SAVE_TOAST_KEY, content: `${ref} is not being saved - ${result.problem.reason}`, duration: 8 });
      }
      return result;
    },
    [ref, message],
  );

  // The one way the page edits the quote. Call it for changes made by the user only: every call
  // marks the quote as edited and leads to a save.
  const change = useCallback(
    (patch: Partial<SalesQuoteData>) => {
      const s = session.current;
      // No loaded quote, no draft - an empty or half-loaded form must never reach the server.
      if (s.version === null) return;
      s.draft = { ...s.draft, ...patch };
      s.revision += 1;
      setDraft(s.draft);
      if (s.save.status === "saved") show({ ...s.save, status: "unsaved" });
      stopTimer();
      s.timer = setTimeout(() => flush().then(announce), AUTOSAVE_DELAY_MS);
    },
    [flush, show, announce, stopTimer],
  );

  // Saves what is waiting right now and resolves with the outcome, for the Save and Retry buttons.
  // A refusal is announced here as for autosave, which leaves the caller only success to report.
  const saveNow = useCallback(() => flush().then(announce), [flush, announce]);

  // The one way the page changes what the server owns of the quote: `run` asks the endpoint for
  // it. What was typed is saved first, so the server decides on the quote the user is looking at,
  // and a save that is refused stops the action. Resolves with why the quote was not changed -
  // a sentence that finishes "QCZ… - …", the server's own when it refused - or with null when it
  // was. Typing may go on meanwhile: it is saved afterwards, on top of what the action left.
  //
  // `versioned` says that `run` sends the version it is handed, as a change of status does. Only
  // then is the answer known to be about the document this page is based on, and only then does
  // the page follow the version in it. An endpoint that takes no version (validity, owner) may
  // answer with a document a colleague has saved meanwhile: following that version would let the
  // next save from here overwrite theirs, so the page keeps its own and that save is refused.
  const act = useCallback(
    (run: QuoteAction, { versioned = false } = {}) =>
      enqueue(async (): Promise<string | null> => {
        const s = session.current;
        stopTimer();
        const saved = await send();
        // Being loaded again ("Load latest version"): there is no quote on the page to act on.
        if (s.version === null) return "the quote is being loaded again";
        if (saved.problem) return `not done, because your changes could not be saved first: ${saved.problem.reason}`;
        try {
          const { quote: stored } = await run(s.version);
          if (versioned) {
            s.version = stored.dataVersion;
            // A quote that is sent has the rates it converts with stored by the server, where it
            // had none. They are part of the document from now on; a rate typed meanwhile wins.
            const { rates } = asData(stored.data);
            if (rates) s.draft = { ...s.draft, rates: { ...rates, ...s.draft.rates } };
          }
          adopt(stored);
          return null;
        } catch (err) {
          const problem = quoteProblem(err);
          // The stored document is newer than this page: as after a refused save, nothing more
          // is sent from here until it is loaded again.
          if (problem.kind === "conflict") {
            queryClient.removeQueries({ queryKey: ["sales-quote", ref] });
            show({ status: s.revision === s.savedRevision ? "saved" : "unsaved", problem });
          }
          // The server judged the quote as it is stored now and said no: the status, validity or
          // owner this page shows, and what it offers, may be what was just contradicted. They are
          // read again - like the answer of an action that names no version, without touching the
          // version this page is based on. If that fails too, the page stays as it is.
          if (problem.kind === "failed") {
            await api.quotes.salesQuoteGet(ref).then(
              ({ quote: stored }) => adopt(stored),
              () => undefined,
            );
          }
          return problem.reason;
        }
      }),
    [ref, queryClient, enqueue, send, adopt, show, stopTimer],
  );

  // Lets go of the local draft: what was changed and not saved yet is no longer waiting, and the
  // page is without a quote it could change or save until one is loaded.
  const drop = useCallback(() => {
    const s = session.current;
    stopTimer();
    s.version = null;
    s.savedRevision = s.revision;
    s.discarding = false;
    show(SAVED);
  }, [show, stopTimer]);

  // Reads the stored quote again and drops the local draft: "Load latest version" after a
  // conflict, Retry after a failed load.
  const reload = useCallback(() => {
    drop();
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  }, [drop]);

  // Gives up what was changed and not saved yet without sending it, for a quote that is about to
  // be deleted: saving into it first would be for nothing, and a save the server refuses - the
  // quote was changed elsewhere - must not keep it from being deleted. From then on nothing is
  // sent from this page, not by the timer and not when it is left, and typing changes nothing;
  // only `reload` gives the page a quote again. A request that is already on its way still
  // arrives: the draft is dropped in its turn after it, and this resolves then, so what the
  // caller asks of the server next is decided on what that request left.
  const discard = useCallback(() => {
    session.current.discarding = true;
    return enqueue(async () => drop());
  }, [enqueue, drop]);

  useEffect(() => {
    const s = session.current;
    s.mounted = true;
    // Reload or tab close while the server does not have every change: the browser asks first...
    const warn = (e: BeforeUnloadEvent) => {
      if (s.revision !== s.savedRevision) e.preventDefault();
    };
    // ...and what is still waiting goes out; like every save, in a request that survives the page.
    // A change made while a request is running cannot follow in time - it has to name the version
    // that request may still be creating - so it has only the prompt above to protect it.
    const sendWhileClosing = () => {
      flush();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", sendWhileClosing);
    return () => {
      s.mounted = false;
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", sendWhileClosing);
      // Leaving for another page of the app: what is waiting is sent now. The page is gone by the
      // time the answer arrives, so a refusal can only be reported as a toast.
      flush().then(({ problem }) => {
        if (problem && !s.mounted) {
          message.error({ key: SAVE_TOAST_KEY, content: `${ref}: your last changes were not saved - ${problem.reason}`, duration: 8 });
        }
      });
    };
  }, [ref, flush, message]);

  return { draft, quote, change, act, load, reload, discard, save, savedAt, saveNow };
}
