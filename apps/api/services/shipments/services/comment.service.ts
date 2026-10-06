import { auth } from "~encore/clients";
import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";

class CommentService {
  async list(shipmentId: string, companyId: string) {
    const [comments, names] = await Promise.all([shipmentCommentRepository.listByShipmentId(shipmentId, companyId), userNames()]);
    return comments.map((c) => ({ ...c, authorName: names.get(c.authorId) ?? "" }));
  }

  async unreadCounts(companyId: string, userId: string) {
    return shipmentCommentRepository.unreadCounts(companyId, userId);
  }

  async markRead(shipmentId: string, companyId: string, userId: string) {
    await shipmentCommentRepository.markRead(companyId, userId, shipmentId);
  }

  async create(shipmentId: string, companyId: string, authorId: string, message: string) {
    return shipmentCommentRepository.create({ companyId, shipmentId, authorId, message });
  }

  async delete(id: string, companyId: string) {
    return shipmentCommentRepository.delete(id, companyId);
  }
}

// Display names of everyone in the company, so a message shows who wrote it.
async function userNames(): Promise<Map<string, string>> {
  try {
    const { users } = await auth.usersList();
    return new Map(users.map((u) => [u.id, u.displayName || u.email]));
  } catch {
    return new Map();
  }
}

export const commentService = new CommentService();
