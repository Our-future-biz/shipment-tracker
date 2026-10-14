import { APIError } from "encore.dev/api";
import { customerDocumentRepository } from "../repositories/customerDocument.repository";
import type { NewCustomerDocumentRecord } from "../schemas/customerDocument.schema";
import type { DocumentItem, DocumentType } from "../interfaces/interfaces";
import { toDocumentItem } from "../lib/mappers";
import { customerService } from "./customer.service";

export interface DocumentInput {
  name: string;
  type?: DocumentType;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  fileData?: string; // base64 data URL
}

export interface DocumentFile {
  fileName: string;
  fileType: string;
  fileData: string;
}

class DocumentService {
  async listByCustomer(customerId: string, companyId: string): Promise<DocumentItem[]> {
    return (await customerDocumentRepository.findByCustomer(customerId, companyId)).map(toDocumentItem);
  }

  async create(companyId: string, customerId: string, input: DocumentInput): Promise<DocumentItem> {
    await customerService.requireLive(customerId, companyId);
    const values: Omit<NewCustomerDocumentRecord, "companyId"> = {
      customerId,
      name: input.name,
      type: input.type ?? "Other",
      fileName: input.fileName ?? "",
      fileType: input.fileType ?? "",
      fileSize: input.fileSize ?? 0,
      fileData: input.fileData ?? "",
    };
    const row = await customerDocumentRepository.createForCompany(companyId, values);
    return toDocumentItem(row);
  }

  async getFile(id: string, companyId: string): Promise<DocumentFile> {
    const file = await customerDocumentRepository.getFileData(id, companyId);
    if (!file) throw APIError.notFound("Document not found");
    return file;
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await customerDocumentRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Document not found");
  }
}

export const documentService = new DocumentService();
