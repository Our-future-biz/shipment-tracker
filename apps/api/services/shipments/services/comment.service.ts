import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";

class CommentService {
  async list(shipmentId: string, companyId: string) {
    return shipmentCommentRepository.listByShipmentId(shipmentId, companyId);
  }

  async create(shipmentId: string, companyId: string, authorId: string, message: string) {
    return shipmentCommentRepository.create({ companyId, shipmentId, authorId, message });
  }

  async delete(id: string, companyId: string) {
    return shipmentCommentRepository.delete(id, companyId);
  }
}

export const commentService = new CommentService();
