// The message a request to change a Customs Office posts to the shipment's chat, tagging everyone
// who can answer it, so it reaches their notifications (a chat @mention). Built here, on the server,
// from the company's users, so who is tagged is never what a browser says. Pure; comment.service
// posts it.

import { canChangeCustomsOffice } from "./customsOffice";

export interface NoticeUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface CustomsOfficeNotice {
  message: string;
  tagged: NoticeUser[];
}

/** The managers are tagged, but not the one asking: nobody is told what they just did themselves. */
export function customsOfficeRequestNotice(
  request: { fromOffice: string; toOffice: string; reason: string },
  users: readonly NoticeUser[],
  askedBy: string,
): CustomsOfficeNotice {
  const tagged = users.filter((u) => canChangeCustomsOffice(u.role) && u.id !== askedBy);
  const lines = [
    "Change of Customs Office requested, waiting for a manager's approval.",
    `From: ${request.fromOffice}`,
    `To: ${request.toOffice}`,
    `Reason: ${request.reason}`,
  ];
  // Written as the chat writes a tag: "@" and the name the @ list shows.
  if (tagged.length) lines.push(tagged.map((u) => `@${u.displayName || u.email}`).join(" "));
  return { message: lines.join("\n"), tagged };
}
