import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { ApprovalChat, ApprovalChatUnread } from "../interfaces/registration";
import { approvalChatService } from "../services/approvalChat.service";

// The internal chat on a company in Sales → Managers → Company approval.

export const approvalChatUnread = api(
  { expose: true, auth: true, method: "GET", path: "/customers/approval-chats/unread" },
  async (): Promise<{ chats: ApprovalChatUnread[] }> => ({ chats: await approvalChatService.unread(getAuthData()!) }),
);

export const approvalChatGet = api(
  { expose: true, auth: true, method: "GET", path: "/customers/approval-chats/:threadId" },
  async ({ threadId }: { threadId: string }): Promise<{ chat: ApprovalChat }> => ({ chat: await approvalChatService.get(getAuthData()!, threadId) }),
);

interface ApprovalChatPostRequest {
  threadId: string;
  text: string & MaxLen<2000>;
}

export const approvalChatPost = api(
  { expose: true, auth: true, method: "POST", path: "/customers/approval-chats/:threadId/messages" },
  async ({ threadId, text }: ApprovalChatPostRequest): Promise<{ chat: ApprovalChat }> => ({ chat: await approvalChatService.post(getAuthData()!, threadId, text) }),
);

interface ApprovalChatAddPersonRequest {
  threadId: string;
  userId: string;
}

// Managers and admins only.
export const approvalChatAddPerson = api(
  { expose: true, auth: true, method: "POST", path: "/customers/approval-chats/:threadId/people" },
  async ({ threadId, userId }: ApprovalChatAddPersonRequest): Promise<{ chat: ApprovalChat }> => ({ chat: await approvalChatService.addPerson(getAuthData()!, threadId, userId) }),
);

// Managers and admins only.
export const approvalChatRemovePerson = api(
  { expose: true, auth: true, method: "DELETE", path: "/customers/approval-chats/:threadId/people/:userId" },
  async ({ threadId, userId }: ApprovalChatAddPersonRequest): Promise<{ chat: ApprovalChat }> => ({ chat: await approvalChatService.removePerson(getAuthData()!, threadId, userId) }),
);
