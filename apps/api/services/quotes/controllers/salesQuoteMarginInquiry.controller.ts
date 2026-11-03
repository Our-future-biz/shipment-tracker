import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { marginInquiryService } from "../services/marginInquiry.service";
import type { QuoteMarginInquiryItem, QuoteMarginInquiryRow } from "../interfaces/interfaces";

// A rep asks a manager to approve a road margin below the floor; the managers answer it from
// Sales → Managers → Quote inquiries (Council Outlay 6, step 3).

interface AskRequest {
  quoteNumber: string;
  /** One of the reasons offered (lib/marginInquiry INQUIRY_REASONS). */
  reason: string & MaxLen<60>;
  note?: string & MaxLen<1000>;
  /** When the customer needs the answer (ISO date-time). */
  needsBy?: string | null;
  competitorPrice?: string & MaxLen<200>;
  volume?: string & MaxLen<200>;
}

export const salesQuoteMarginInquiryAsk = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/margin-inquiry" },
  async ({ quoteNumber, ...input }: AskRequest): Promise<{ inquiry: QuoteMarginInquiryItem }> => ({
    inquiry: await marginInquiryService.ask(getAuthData()!, quoteNumber, input),
  }),
);

/** The newest question of a quote, answered or not; null when it has none. */
export const salesQuoteMarginInquiryGet = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quotes/:quoteNumber/margin-inquiry" },
  async ({ quoteNumber }: { quoteNumber: string }): Promise<{ inquiry: QuoteMarginInquiryItem | null }> => ({
    inquiry: await marginInquiryService.latest(getAuthData()!, quoteNumber),
  }),
);

interface InquiryRef {
  quoteNumber: string;
  inquiryId: string;
}

export const salesQuoteMarginInquiryWithdraw = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/margin-inquiry/withdraw" },
  async ({ quoteNumber, inquiryId }: InquiryRef): Promise<{ inquiry: QuoteMarginInquiryItem }> => ({
    inquiry: await marginInquiryService.withdraw(getAuthData()!, quoteNumber, inquiryId),
  }),
);

interface DecideRequest extends InquiryRef {
  decision: "approve" | "counter" | "reject";
  /** For a counter: the lowest margin in CZK the manager accepts. */
  counterMarginCzk?: number | null;
  comment?: string & MaxLen<1000>;
}

export const salesQuoteMarginInquiryDecide = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/margin-inquiry/decide" },
  async ({ quoteNumber, inquiryId, ...answer }: DecideRequest): Promise<{ inquiry: QuoteMarginInquiryItem }> => ({
    inquiry: await marginInquiryService.decide(getAuthData()!, quoteNumber, inquiryId, answer),
  }),
);

/** The managers' list: what waits, and what was answered in the last 30 days. */
export const salesQuoteMarginInquiryList = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quote-margin-inquiries" },
  async (): Promise<{ inquiries: QuoteMarginInquiryRow[] }> => ({ inquiries: await marginInquiryService.list(getAuthData()!) }),
);

/** The bell: questions the user is told about, and answers to their questions or quotes. */
export const salesQuoteMarginInquiryForMe = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quote-margin-inquiries/for-me" },
  async (): Promise<{ waiting: QuoteMarginInquiryRow[]; answers: QuoteMarginInquiryItem[] }> => marginInquiryService.forMe(getAuthData()!),
);

export const salesQuoteMarginInquirySeen = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quote-margin-inquiries/seen" },
  async ({ ids }: { ids: string[] & MaxLen<200> }): Promise<void> => {
    await marginInquiryService.seen(getAuthData()!, ids);
  },
);
