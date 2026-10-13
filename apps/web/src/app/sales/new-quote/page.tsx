import { redirect } from "next/navigation";
import { SALES_PAGES } from "../_lib/tabs";

// "Create new quote" used to be a page with one button. Creating a quote is an action of the
// Quotes list now: this keeps old links and bookmarks doing what their name says - the list opens
// its New Quote dialog for ?new=1 and then drops the parameter.
export default function NewQuoteRedirectPage() {
  redirect(`${SALES_PAGES.quotes.path}?new=1`);
}
