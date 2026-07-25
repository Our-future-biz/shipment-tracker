import { customerDocumentRepository } from "../repositories/customerDocument.repository";

interface DocumentInput {
  name: string;
  type?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileData?: string; // base64 data URL
}

class DocumentService {
  async listByCustomer(customerId: string) {
    return customerDocumentRepository.findByCustomer(customerId);
  }

  async create(customerId: string, input: DocumentInput) {
    return customerDocumentRepository.create({
      customerId,
      name: input.name,
      type: input.type ?? "Other",
      fileName: input.fileName ?? "",
      fileType: input.fileType ?? "",
      fileSize: input.fileSize ?? 0,
      fileData: input.fileData ?? "",
    } as never);
  }

  async getFileData(id: string) {
    return customerDocumentRepository.getFileData(id);
  }

  async softDelete(id: string) {
    return customerDocumentRepository.softDelete(id);
  }
}

export const documentService = new DocumentService();
