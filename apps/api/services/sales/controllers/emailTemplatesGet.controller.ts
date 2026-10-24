import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { emailTemplateService } from "../services/emailTemplate.service";
import type { EmailTemplatesResponse } from "../interfaces/interfaces";

/** The signed-in user's own email templates for quotations. */
export const emailTemplatesGet = api(
  { expose: true, auth: true, method: "GET", path: "/sales-email-templates" },
  async (): Promise<EmailTemplatesResponse> => {
    return { data: await emailTemplateService.list(getAuthData()!) };
  },
);
