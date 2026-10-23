import { api } from "encore.dev/api";
import type { MaxLen, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import { salesQuoteService } from "../services/salesQuote.service";
import type { QuoteWarehouseInquiryItem, SalesQuoteItem } from "../interfaces/interfaces";

// The warehouse inquiry of a Sea LCL quote's pieces of 12.5 t or more ("Inquire Warehouse"):
// Sales asks, a warehouse manager approves with a price per piece or rejects with a reason on the
// Warehouse Concept Managers page, and the answer reaches the one who asked under the bell.

interface WarehouseInquiryAskRequest {
  quoteNumber: string;
  /** Pieces of 12.5 t or more. */
  pieces: number & Min<1>;
  /** The shipment's gross weight, kg. */
  grossWeightKg: number & Min<0>;
  /** What the warehouse should know. */
  note?: string & MaxLen<1000>;
}

// Any user of the company (Sales): the question goes to the warehouse managers.
export const salesQuoteWarehouseInquiryAsk = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/warehouse-inquiry" },
  async ({ quoteNumber, ...request }: WarehouseInquiryAskRequest): Promise<{ quote: SalesQuoteItem }> => {
    return { quote: await salesQuoteService.inquireWarehouse(getAuthData()!, quoteNumber, request) };
  },
);

// The Managers page: the questions waiting and those answered in the last 30 days. Managers only.
export const salesQuoteWarehouseInquiryList = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quote-inquiries" },
  async (): Promise<{ inquiries: QuoteWarehouseInquiryItem[] }> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { inquiries: await salesQuoteService.listWarehouseInquiries(actor) };
  },
);

interface WarehouseInquiryDecideRequest {
  quoteNumber: string;
  /** The inquiry answered (a newer question on the quote is not answered by mistake). */
  inquiryId: string;
  approve: boolean;
  /** Approved: the extra handling per piece, EUR. */
  priceEurPerPiece?: number | null;
  /** Rejected: why (required); approved: optional. */
  comment?: string & MaxLen<1000>;
}

// A warehouse manager approves with a price per piece, or rejects with a reason.
export const salesQuoteWarehouseInquiryDecide = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/warehouse-inquiry/decide" },
  async ({ quoteNumber, ...decision }: WarehouseInquiryDecideRequest): Promise<{ inquiry: QuoteWarehouseInquiryItem }> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return { inquiry: await salesQuoteService.decideWarehouseInquiry(actor, quoteNumber, decision) };
  },
);

// The bell: the answers to the signed-in user's own inquiries not opened yet.
export const salesQuoteWarehouseInquiryAnswers = api(
  { expose: true, auth: true, method: "GET", path: "/sales-quote-inquiries/answers" },
  async (): Promise<{ answers: QuoteWarehouseInquiryItem[] }> => {
    return { answers: await salesQuoteService.myInquiryAnswers(getAuthData()!) };
  },
);

// The one who asked opened the answer: it leaves the bell.
export const salesQuoteWarehouseInquirySeen = api(
  { expose: true, auth: true, method: "POST", path: "/sales-quotes/:quoteNumber/warehouse-inquiry/seen" },
  async ({ quoteNumber, inquiryId }: { quoteNumber: string; inquiryId: string }): Promise<void> => {
    await salesQuoteService.markInquiryAnswerSeen(getAuthData()!, quoteNumber, inquiryId);
  },
);
