import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { userEmailOf } from "../../../lib/companyUsers";
import { storedEmail } from "../../../lib/personPick";
import { canManageSales } from "../../../lib/salesPolicy";
import { isUuid } from "../../../lib/uuid";
import type { ApprovalChat, ApprovalChatUnread } from "../interfaces/registration";
import { companyRegistrationRepository as repository } from "../repositories/companyRegistration.repository";

// The internal chat on a company in Sales → Managers → Company approval. Every manager is in it; so is the
// one who asked (who added the supplier, or created the registration link), and whoever a manager adds -
// a sales representative to get in touch with the company, for example.

interface Actor {
  companyID: string;
  userID: string;
  role: string;
}

const MAX_TEXT = 2000;
const notFound = () => APIError.notFound("This chat does not exist");

class ApprovalChatService {
  /** The thread, once the user is known to be in it. The one who asked is made a member on the way. */
  private async open(actor: Actor, threadId: string) {
    if (!isUuid(threadId)) throw notFound();
    const thread = await repository.thread(actor.companyID, threadId);
    if (!thread) throw notFound();
    if (thread.requesterUserId) await repository.addMember(actor.companyID, threadId, thread.requesterUserId, null);
    if (!canManageSales(actor.role) && !(await repository.isMember(actor.companyID, threadId, actor.userID))) throw APIError.permissionDenied("You are not in this chat");
    return thread;
  }

  async get(actor: Actor, threadId: string, now = new Date()): Promise<ApprovalChat> {
    const thread = await this.open(actor, threadId);
    const [messages, members] = await Promise.all([repository.messages(actor.companyID, threadId), repository.members(actor.companyID, threadId)]);
    const { users } = members.length ? await auth.userLookup({ ids: members.map((m) => m.userId) }) : { users: [] };
    const nameOf = new Map(users.map((u) => [u.id, storedEmail(u.email)]));
    // Opening the chat is reading it.
    await repository.markRead(actor.companyID, threadId, actor.userID, now);
    return {
      threadId,
      companyName: thread.companyName,
      messages: messages.map((m) => ({ id: m.id, author: m.author, isSystem: m.authorUserId === null, mine: m.authorUserId === actor.userID, text: m.text, at: m.createdAt.toISOString() })),
      people: members.map((m) => ({ userId: m.userId, name: nameOf.get(m.userId) ?? "", isRequester: m.userId === thread.requesterUserId })),
      canAddPeople: canManageSales(actor.role),
    };
  }

  async post(actor: Actor, threadId: string, text: string, now = new Date()): Promise<ApprovalChat> {
    await this.open(actor, threadId);
    const written = text.trim();
    if (!written) throw APIError.invalidArgument("Write a message first");
    if (written.length > MAX_TEXT) throw APIError.invalidArgument(`A message can have at most ${MAX_TEXT} characters`);
    await repository.addMessage({ companyId: actor.companyID, threadId, authorUserId: actor.userID, author: await userEmailOf(actor.userID), text: written });
    return this.get(actor, threadId, now);
  }

  /** A manager brings a colleague in, who is told by their bell. */
  async addPerson(actor: Actor, threadId: string, userId: string, now = new Date()): Promise<ApprovalChat> {
    if (!canManageSales(actor.role)) throw APIError.permissionDenied("Only a manager can add people to this chat");
    await this.open(actor, threadId);
    if (!isUuid(userId)) throw APIError.invalidArgument("Choose a colleague");
    const { users } = await auth.usersList();
    if (!users.some((u) => u.id === userId)) throw APIError.invalidArgument("Choose a colleague of this company");
    await repository.addMember(actor.companyID, threadId, userId, actor.userID);
    return this.get(actor, threadId, now);
  }

  /** A manager takes a colleague out again. The one who asked stays: it is their link or request. */
  async removePerson(actor: Actor, threadId: string, userId: string, now = new Date()): Promise<ApprovalChat> {
    if (!canManageSales(actor.role)) throw APIError.permissionDenied("Only a manager can remove people from this chat");
    const thread = await this.open(actor, threadId);
    if (userId === thread.requesterUserId) throw APIError.failedPrecondition("The one who created the link or asked for the approval stays in this chat");
    if (!isUuid(userId) || !(await repository.removeMember(actor.companyID, threadId, userId))) throw APIError.failedPrecondition("This colleague is no longer in the chat");
    return this.get(actor, threadId, now);
  }

  async unread(actor: Actor): Promise<ApprovalChatUnread[]> {
    const rows = await repository.unread(actor.companyID, actor.userID, canManageSales(actor.role));
    const named = await Promise.all(rows.map(async (r) => ({ ...r, thread: await repository.thread(actor.companyID, r.threadId) })));
    return named.flatMap((r) => (r.thread ? [{ threadId: r.threadId, companyName: r.thread.companyName, unread: r.unread, latestAt: r.latestAt.toISOString() }] : []));
  }
}

export const approvalChatService = new ApprovalChatService();
