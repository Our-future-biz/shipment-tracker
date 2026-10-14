import { api, Query } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { columnTemplateService } from "../services/columnTemplate.service";
import type { ColumnTemplateItem } from "../interfaces/interfaces";

interface ListColumnTemplatesRequest {
  scope?: Query<string>;
}

interface ListColumnTemplatesResponse {
  templates: ColumnTemplateItem[];
}

export const columnTemplatesList = api(
  { expose: true, auth: true, method: "GET", path: "/column-templates" },
  async (req: ListColumnTemplatesRequest): Promise<ListColumnTemplatesResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { templates: await columnTemplateService.list(companyID, userID, req.scope) };
  },
);

interface UpsertColumnTemplateRequest {
  scope?: string & MaxLen<50>;
  name: string & MinLen<1> & MaxLen<100>;
  columns: string[] & MaxLen<500>;
}

interface UpsertColumnTemplateResponse {
  template: ColumnTemplateItem;
}

export const columnTemplatesUpsert = api(
  { expose: true, auth: true, method: "POST", path: "/column-templates" },
  async (req: UpsertColumnTemplateRequest): Promise<UpsertColumnTemplateResponse> => {
    const { companyID, userID } = getAuthData()!;
    return { template: await columnTemplateService.upsert(companyID, userID, req.scope, req.name, req.columns) };
  },
);

interface DeleteColumnTemplateRequest {
  id: string;
}

interface DeleteColumnTemplateResponse {
  ok: boolean;
}

export const columnTemplatesDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/column-templates/:id" },
  async (req: DeleteColumnTemplateRequest): Promise<DeleteColumnTemplateResponse> => {
    const { companyID, userID } = getAuthData()!;
    await columnTemplateService.delete(companyID, userID, req.id);
    return { ok: true };
  },
);
