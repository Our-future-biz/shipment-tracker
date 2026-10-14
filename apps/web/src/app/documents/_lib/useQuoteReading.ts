"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { invalidateQuoteLists, useSalesQuotes } from "@/hooks/useSalesQuotes";
import { quoteProblem } from "@/app/sales/_lib/quoteProblem";
import { asData, type SalesQuote } from "@/app/sales/_lib/salesQuote";
import type { TargetMode } from "./extraction";
import { EMPTY_QUOTE_REVIEW, quoteAfterReading, quoteReadingPatch, quoteReviewRows, type QuoteReview } from "./quoteReading";
import { salesQuoteKeys } from "@/hooks/salesQueryKeys";

/** What is read: an uploaded file or pasted text. */
export type QuoteSource = { fileBase64: string; fileName: string } | { text: string };

export type QuoteReading = ReturnType<typeof useQuoteReading>;

const counted = (n: number) => `${n} field${n !== 1 ? "s" : ""}`;

// Reading a document into a Sales quote. A new quote is created by the server, which assigns its
// reference; an existing one is saved the way the quote page saves it - the whole document, naming
// the version the review was built on - so a quote changed meanwhile is never overwritten, and a
// refused write is always told.
export function useQuoteReading() {
  const queryClient = useQueryClient();
  const { createQuote } = useSalesQuotes();
  const [mode, setMode] = useState<TargetMode>("new");
  const [picked, setPicked] = useState<SalesQuote | null>(null);
  // What the reader returned, kept for comparing again with a quote that changed.
  const [extracted, setExtracted] = useState<Record<string, string>>({});
  // The stored quote the review compares with and the write is based on; null for a new quote.
  const [base, setBase] = useState<interfaces.SalesQuoteItem | null>(null);
  const [review, setReview] = useState<QuoteReview>(EMPTY_QUOTE_REVIEW);
  const [problem, setProblem] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState<{ quoteNumber: string; created: boolean; count: number } | null>(null);
  // A second click while a write is on its way is ignored.
  const busy = useRef(false);

  // Reads the document, then - for an existing quote - the quote as it is stored now: never the
  // picker's copy, which has no version and may be old. Throws the sentence to show on the upload step.
  const read = async (source: QuoteSource) => {
    setProblem(null);
    setWritten(null);
    const result =
      "text" in source
        ? await api.extraction.extractText({ text: source.text, destination: "quote" })
        : await api.extraction.extractQuote(source);
    let stored: interfaces.SalesQuoteItem | null = null;
    if (mode === "existing" && picked) {
      try {
        stored = (await api.quotes.salesQuoteGet(picked.quoteNumber)).quote;
      } catch (err) {
        throw new Error(`Could not read ${picked.quoteNumber} - ${quoteProblem(err).reason}.`);
      }
    }
    const next = quoteReviewRows(result.extracted, stored ? asData(stored.data) : null);
    if (next.fields.length === 0) {
      if (!stored || (next.alreadyThere === 0 && next.notes.length === 0)) throw new Error("No request details were found in this document.");
      throw new Error(
        next.notes.length > 0
          ? `Nothing to add to ${stored.quoteNumber}. ${next.notes.join(" ")}`
          : `Nothing to add to ${stored.quoteNumber} - what this document states is already on the quote.`,
      );
    }
    setExtracted(result.extracted);
    setBase(stored);
    setReview(next);
  };

  // While a write is on its way the rows stay as they were sent: a refusal compares them again.
  const toggle = (index: number) => {
    if (busy.current) return;
    setReview((prev) => ({ ...prev, fields: prev.fields.map((f, i) => (i === index ? { ...f, approved: !f.approved } : f)) }));
  };
  const edit = (index: number, value: string) => {
    if (busy.current) return;
    setReview((prev) => ({ ...prev, fields: prev.fields.map((f, i) => (i === index ? { ...f, extractedValue: value } : f)) }));
  };

  // Why a write was refused, as the sentence to show. A quote that was changed meanwhile is read
  // again and compared again: nothing is overwritten and nothing is sent a second time by itself.
  const refusal = async (err: unknown): Promise<string> => {
    const { kind, reason } = quoteProblem(err);
    if (!base) return `The quote was not created - ${reason}.`;
    const ref = base.quoteNumber;
    if (kind !== "conflict") return `Nothing was written to ${ref} - ${reason}.`;
    // The remembered copy is now known to be older than the stored quote.
    queryClient.removeQueries({ queryKey: salesQuoteKeys.one(ref) });
    try {
      const { quote } = await api.quotes.salesQuoteGet(ref);
      const next = quoteReviewRows(extracted, asData(quote.data), review.fields);
      setBase(quote);
      setReview(next);
      const changed = `${ref} was changed by someone else or in another tab since this document was read. Nothing was written.`;
      return next.fields.length === 0
        ? `${changed} After that change nothing from this document is left to add.`
        : `${changed} The existing values below are up to date now - check the ticks and write again.`;
    } catch (again) {
      return `${ref} was changed by someone else or in another tab, and it could not be read again - ${quoteProblem(again).reason}. Nothing was written. Go back and extract again.`;
    }
  };

  // Writes the ticked rows. Resolves true once the server has confirmed the write.
  const write = async (): Promise<boolean> => {
    if (busy.current) return false;
    const { patch, problems } = quoteReadingPatch(review.fields);
    const count = Object.keys(patch).length;
    if (problems.length > 0) {
      setProblem(`Not written. ${problems.join(". ")}. Correct it or untick it.`);
      return false;
    }
    if (count === 0) return false;
    busy.current = true;
    setWriting(true);
    setProblem(null);
    try {
      if (!base) {
        const quoteNumber = await createQuote(quoteAfterReading({}, patch));
        setWritten({ quoteNumber, created: true, count });
        return true;
      }
      const { quote } = await api.quotes.salesQuoteSave(base.quoteNumber, {
        data: quoteAfterReading(asData(base.data), patch),
        expectedDataVersion: base.dataVersion,
      });
      // As the quote page does after a save (adopt in useSalesQuoteDraft).
      queryClient.setQueryData(salesQuoteKeys.one(quote.quoteNumber), { quote });
      invalidateQuoteLists(queryClient);
      setWritten({ quoteNumber: quote.quoteNumber, created: false, count });
      return true;
    } catch (err) {
      setProblem(await refusal(err));
      return false;
    } finally {
      busy.current = false;
      setWriting(false);
    }
  };

  const reset = () => {
    setMode("new");
    setPicked(null);
    setExtracted({});
    setBase(null);
    setReview(EMPTY_QUOTE_REVIEW);
    setProblem(null);
    setWritten(null);
  };

  return {
    mode,
    setMode,
    picked,
    setPicked,
    /** A target is chosen: a new quote, or a picked one. */
    ready: mode === "new" || picked !== null,
    base,
    review,
    problem,
    writing,
    written,
    doneTitle: !written ? "" : written.created ? `New quote ${written.quoteNumber} created` : `${counted(written.count)} written to ${written.quoteNumber}`,
    read,
    toggle,
    edit,
    write,
    reset,
  };
}
