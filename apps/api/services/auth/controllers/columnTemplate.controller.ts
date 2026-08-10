import { api, APIError, Header } from "encore.dev/api";
import { columnTemplateService } from "../services/columnTemplate.service";
import { authService } from "../services/auth.service";

// Plain interface — do not import drizzle $inferSelect types into controllers.
interface ColumnTemplateItem {
  id: string;
  userId: string;
  name: string;
  columns: string[];
}

// NOTE: kept auth:false with manual JWT verification (not gateway auth:true) so the
// generated web client's request shape stays unchanged. Identity is derived from the
// signed JWT, never from the path/body, so this is IDOR-safe. Migrate to auth:true +
// getAuthData() when the Encore client is regenerated.
async function requireUserId(authorization: string | undefined): Promise<string> {
  if (!authorization) {
    throw APIError.unauthenticated("No authorization header");
  }
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : authorization;
  const { userId } = await authService.verifyToken(token);
  return userId;
}

interface ListColumnTemplatesRequest {
  authorization: Header<"Authorization">;
}

interface ListColumnTemplatesResponse {
  templates: ColumnTemplateItem[];
}

export const columnTemplatesList = api(
  { expose: true, auth: false, method: "GET", path: "/column-templates" },
  async (req: ListColumnTemplatesRequest): Promise<ListColumnTemplatesResponse> => {
    const userId = await requireUserId(req.authorization);
    const templates = await columnTemplateService.listByUser(userId);
    return { templates: templates as unknown as ColumnTemplateItem[] };
  },
);

interface UpsertColumnTemplateRequest {
  authorization: Header<"Authorization">;
  name: string;
  columns: string[];
}

interface UpsertColumnTemplateResponse {
  template: ColumnTemplateItem;
}

export const columnTemplatesUpsert = api(
  { expose: true, auth: false, method: "POST", path: "/column-templates" },
  async (req: UpsertColumnTemplateRequest): Promise<UpsertColumnTemplateResponse> => {
    const userId = await requireUserId(req.authorization);
    const name = req.name?.trim();
    if (!name) {
      throw APIError.invalidArgument("name is required");
    }
    const template = await columnTemplateService.upsert(userId, name, req.columns ?? []);
    return { template: template as unknown as ColumnTemplateItem };
  },
);

interface DeleteColumnTemplateRequest {
  authorization: Header<"Authorization">;
  id: string;
}

interface DeleteColumnTemplateResponse {
  ok: boolean;
}

export const columnTemplatesDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/column-templates/:id" },
  async (req: DeleteColumnTemplateRequest): Promise<DeleteColumnTemplateResponse> => {
    const userId = await requireUserId(req.authorization);
    await columnTemplateService.delete(userId, req.id);
    return { ok: true };
  },
);
