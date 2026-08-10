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
  async listByCustomer(customerId: string, companyId: string) {
    return customerDocumentRepository.findByCustomer(customerId, companyId);
  }

  async create(companyId: string, customerId: string, input: DocumentInput) {
    return customerDocumentRepository.createForCompany(companyId, {
      customerId,
      name: input.name,
      type: input.type ?? "Other",
      fileName: input.fileName ?? "",
      fileType: input.fileType ?? "",
      fileSize: input.fileSize ?? 0,
      fileData: input.fileData ?? "",
    } as never);
  }

  async getFileData(id: string, companyId: string) {
    return customerDocumentRepository.getFileData(id, companyId);
  }

  async softDelete(id: string, companyId: string) {
    return customerDocumentRepository.softDeleteForCompany(id, companyId);
  }
}

export const documentService = new DocumentService();
