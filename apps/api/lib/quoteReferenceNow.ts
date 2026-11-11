import { quotes } from "~encore/clients";

/**
 * What a copy of a quote's reference should say now, for a quote-renamed event (`from` → `to`): the
 * live quote's reference as Sales has it, asked of the quotes service, so an event delivered late or
 * out of order never sets an older one; `to` when no live quote is under it any more. Throws when
 * Sales does not answer, so the event is delivered again.
 */
export async function quoteReferenceNow(companyId: string, from: string, to: string): Promise<string> {
  const { quoteNumber } = await quotes._internalQuoteReferenceNow({ reference: from }, { authData: { userID: "", companyID: companyId, role: "user" } });
  return quoteNumber ?? to;
}
