import { columnTemplateRepository } from "../repositories/columnTemplate.repository";

class ColumnTemplateService {
  listByUser(userId: string, scope: string) {
    return columnTemplateRepository.listByUser(userId, scope);
  }

  upsert(userId: string, scope: string, name: string, columns: string[]) {
    return columnTemplateRepository.upsert(userId, scope, name, columns);
  }

  delete(userId: string, id: string) {
    return columnTemplateRepository.deleteForUser(userId, id);
  }
}

export const columnTemplateService = new ColumnTemplateService();
