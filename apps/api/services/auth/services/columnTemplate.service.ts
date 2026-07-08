import { columnTemplateRepository } from "../repositories/columnTemplate.repository";

class ColumnTemplateService {
  listByUser(userId: string) {
    return columnTemplateRepository.listByUser(userId);
  }

  upsert(userId: string, name: string, columns: string[]) {
    return columnTemplateRepository.upsert(userId, name, columns);
  }

  delete(userId: string, id: string) {
    return columnTemplateRepository.deleteForUser(userId, id);
  }
}

export const columnTemplateService = new ColumnTemplateService();
