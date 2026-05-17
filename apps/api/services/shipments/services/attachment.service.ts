import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";

class AttachmentService {
  async list(shipmentId: string) {
    return shipmentAttachmentRepository.listByShipmentId(shipmentId);
  }

  async create(shipmentId: string, fileName: string, fileSize: number, fileType: string, storageKey: string) {
    return shipmentAttachmentRepository.create({ shipmentId, fileName, fileSize, fileType, storageKey });
  }

  async delete(id: string) {
    return shipmentAttachmentRepository.delete(id);
  }
}

export const attachmentService = new AttachmentService();
