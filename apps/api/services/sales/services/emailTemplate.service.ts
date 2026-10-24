import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import type { EmailTemplate } from "../interfaces/interfaces";
import { salesPreferenceRepository } from "../repositories/salesPreference.repository";

// A user's own email templates for quotations. They are kept with the Sales preferences, under a
// key of the user's own: only that user reads or writes them (prefGet refuses the key to anyone).

/** The key a user's templates are kept under. */
export const EMAIL_TEMPLATES_PREFIX = "email_templates:";
const keyOf = (actor: Actor) => `${EMAIL_TEMPLATES_PREFIX}${actor.userID}`;

export const MAX_TEMPLATES = 50;
const MAX_NAME = 80;
const MAX_SUBJECT = 300;
const MAX_MESSAGE = 5000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A stored template as the dialog reads it; null for anything else (a value of another form is left out). */
function asTemplate(value: unknown): EmailTemplate | null {
  if (!isObject(value)) return null;
  const { id, name, subject, message } = value;
  if (typeof id !== "string" || typeof name !== "string" || typeof subject !== "string" || typeof message !== "string") return null;
  return { id, name, subject, message };
}

/**
 * Why a list of templates cannot be stored, or null when it can: each has an id, a name of its own
 * (no two the same, whatever the case), and a subject and message within their lengths.
 */
export function templatesProblem(templates: unknown): string | null {
  if (!Array.isArray(templates)) return "templates must be a list";
  if (templates.length > MAX_TEMPLATES) return `at most ${MAX_TEMPLATES} templates`;
  const names = new Set<string>();
  for (const value of templates) {
    const t = asTemplate(value);
    if (!t || !t.id.trim()) return "every template needs an id, a name, a subject and a message";
    const name = t.name.trim();
    if (!name) return "every template needs a name";
    if (name.length > MAX_NAME) return `a template's name is at most ${MAX_NAME} characters`;
    if (names.has(name.toLowerCase())) return `there are two templates named "${name}"`;
    names.add(name.toLowerCase());
    if (t.subject.length > MAX_SUBJECT) return `a subject is at most ${MAX_SUBJECT} characters`;
    if (t.message.length > MAX_MESSAGE) return `a message is at most ${MAX_MESSAGE} characters`;
  }
  return null;
}

class EmailTemplateService {
  async list(actor: Actor): Promise<EmailTemplate[]> {
    const stored = await salesPreferenceRepository.get(keyOf(actor), actor.companyID);
    return Array.isArray(stored) ? stored.map(asTemplate).filter((t): t is EmailTemplate => t !== null) : [];
  }

  /** Stores the user's templates in place of what was stored: the list is theirs alone, so it is written whole. */
  async save(actor: Actor, templates: EmailTemplate[]): Promise<EmailTemplate[]> {
    const problem = templatesProblem(templates);
    if (problem) throw APIError.invalidArgument(problem);
    const kept = templates.map(({ id, name, subject, message }) => ({ id, name: name.trim(), subject, message }));
    await salesPreferenceRepository.set(keyOf(actor), actor.companyID, kept);
    return kept;
  }
}

export const emailTemplateService = new EmailTemplateService();
