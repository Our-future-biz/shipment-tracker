import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { emailTemplateService } from "../services/emailTemplate.service";
import type { EmailTemplate, EmailTemplatesResponse } from "../interfaces/interfaces";

interface EmailTemplatesSetRequest {
  templates: EmailTemplate[];
}

/**
 * Stores the signed-in user's email templates in place of theirs. Refused for a list that is too
 * long, a template without a name, two of the same name, or a text that is too long.
 */
export const emailTemplatesSet = api(
  { expose: true, auth: true, method: "PUT", path: "/sales-email-templates" },
  async (req: EmailTemplatesSetRequest): Promise<EmailTemplatesResponse> => {
    return { data: await emailTemplateService.save(getAuthData()!, req.templates) };
  },
);
