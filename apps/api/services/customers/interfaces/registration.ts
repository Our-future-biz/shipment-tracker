import type { CustomerRole } from "./interfaces";

/** What the registration form calls the terms and where they are read. */
export interface RegistrationSettings {
  termsName: string;
  termsUrl: string;
}

/** A link that can still be used, as the desk sees it. The URL itself can't be told again. */
export interface RegistrationLinkItem {
  id: string;
  label: string;
  roles: CustomerRole[];
  createdBy: string;
  createdByUserId: string;
  /** ISO. */
  createdAt: string;
  /** ISO. */
  expiresAt: string;
}

/** What the public form needs to show. Nothing about who created the link or for whom. */
export interface PublicRegistrationForm {
  termsName: string;
  termsUrl: string;
}

export interface ApprovalChatMessage {
  id: string;
  /** "" for what the system says itself. */
  author: string;
  isSystem: boolean;
  mine: boolean;
  text: string;
  /** ISO. */
  at: string;
}

export interface ApprovalChatPerson {
  userId: string;
  name: string;
  /** The one whose link or request this is. */
  isRequester: boolean;
}

export interface ApprovalChat {
  threadId: string;
  companyName: string;
  messages: ApprovalChatMessage[];
  people: ApprovalChatPerson[];
  /** Managers bring others in. */
  canAddPeople: boolean;
}

export interface ApprovalChatUnread {
  threadId: string;
  companyName: string;
  /** 0 when the user was just added to a chat nobody has written in. */
  unread: number;
  /** ISO. */
  latestAt: string;
}
