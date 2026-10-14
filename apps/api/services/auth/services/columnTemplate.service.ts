import { APIError } from "encore.dev/api";
import { columnTemplateRepository } from "../repositories/columnTemplate.repository";
import type { ColumnTemplateRecord } from "../schemas/columnTemplate.schema";
import type { ColumnTemplateItem } from "../interfaces/interfaces";

// Templates belong to the screen they were saved on; without a scope it is the Shipments grid.
const DEFAULT_SCOPE = "shipments";

const scopeOf = (scope: string | undefined) => scope?.trim() || DEFAULT_SCOPE;

const toItem = (r: ColumnTemplateRecord): ColumnTemplateItem => ({
  id: r.id,
  userId: r.userId,
  name: r.name,
  columns: r.columns,
});

class ColumnTemplateService {
  async list(companyId: string, userId: string, scope: string | undefined): Promise<ColumnTemplateItem[]> {
    const rows = await columnTemplateRepository.listForUser(companyId, userId, scopeOf(scope));
    return rows.map(toItem);
  }

  async upsert(companyId: string, userId: string, scope: string | undefined, name: string, columns: string[]): Promise<ColumnTemplateItem> {
    const trimmed = name.trim();
    if (!trimmed) throw APIError.invalidArgument("name is required");
    return toItem(await columnTemplateRepository.upsert(companyId, userId, scopeOf(scope), trimmed, columns));
  }

  async delete(companyId: string, userId: string, id: string): Promise<void> {
    const row = await columnTemplateRepository.softDeleteForUser(companyId, userId, id);
    if (!row) throw APIError.notFound("Template not found");
  }
}

export const columnTemplateService = new ColumnTemplateService();
