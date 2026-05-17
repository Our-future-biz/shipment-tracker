import { shipmentCommentRepository } from "../repositories/shipmentComment.repository";

class CommentService {
  async list(shipmentId: string) {
    return shipmentCommentRepository.listByShipmentId(shipmentId);
  }

  async create(shipmentId: string, authorId: string, message: string) {
    return shipmentCommentRepository.create({ shipmentId, authorId, message });
  }

  async delete(id: string) {
    return shipmentCommentRepository.delete(id);
  }
}

export const commentService = new CommentService();
