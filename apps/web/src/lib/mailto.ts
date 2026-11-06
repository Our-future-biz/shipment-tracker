import { splitAddresses } from "@/app/sales/_lib/emailAddresses";

export interface MailtoParts {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  message?: string;
}

// A message as a mailto: link (RFC 6068). Every value is percent-encoded - a space as %20,
// because a "+" would arrive as a plus sign - line breaks travel as CRLF, and the "@" of an
// address stays readable, as mail programs expect it. Several addresses go comma-separated.
// What is empty is left out.
export function mailtoLink({ to = "", cc = "", bcc = "", subject = "", message = "" }: MailtoParts): string {
  const address = (value: string) => splitAddresses(value).map((a) => encodeURIComponent(a).replace(/%40/g, "@")).join(",");
  const headers = [
    cc.trim() && `cc=${address(cc)}`,
    bcc.trim() && `bcc=${address(bcc)}`,
    subject && `subject=${encodeURIComponent(subject)}`,
    message && `body=${encodeURIComponent(message.replace(/\r\n|\r|\n/g, "\r\n"))}`,
  ].filter(Boolean);
  return `mailto:${address(to)}${headers.length ? `?${headers.join("&")}` : ""}`;
}

// A mailto: link's link attributes. In a new tab: an email program takes it over from there, and
// webmail opens beside the page instead of replacing it.
export const MAILTO_LINK_TARGET = { target: "_blank", rel: "noreferrer" } as const;

// Follows a mailto: link without a click on it. The browser may refuse once the click that led here
// is too long ago, so the page has to offer the link itself as well.
export function openMailto(href: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.target = MAILTO_LINK_TARGET.target;
  link.rel = MAILTO_LINK_TARGET.rel;
  link.click();
}
