import { APIError } from "encore.dev/api";
import { companyRepository } from "../repositories/company.repository";
import type { AppModule } from "../interfaces/interfaces";
import { isUuid } from "../../../lib/uuid";

export interface CompanyInfo {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  /** Modules the company's users do not get (superadmins still see them) */
  hiddenModules: AppModule[];
}

export const APP_MODULES: readonly AppModule[] = ["warehouse_concept", "trucking_concept"];

const isAppModule = (v: unknown): v is AppModule => typeof v === "string" && (APP_MODULES as readonly string[]).includes(v);

/** The modules asked for, each once, in the order of APP_MODULES; refuses an unknown one. */
export function cleanHiddenModules(input: unknown): AppModule[] {
  if (!Array.isArray(input)) throw APIError.invalidArgument("hiddenModules must be a list");
  const unknown = input.filter((m) => !isAppModule(m));
  if (unknown.length) throw APIError.invalidArgument(`Unknown module: ${unknown.map(String).join(", ")} (known: ${APP_MODULES.join(", ")})`);
  return APP_MODULES.filter((m) => input.includes(m));
}

const info = (c: { id: string; name: string; slug: string; createdAt: Date | string; hiddenModules: AppModule[] | null }): CompanyInfo => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  hiddenModules: (c.hiddenModules ?? []).filter(isAppModule),
});

class CompanyService {
  async list(): Promise<CompanyInfo[]> {
    const rows = await companyRepository.getAll(1000);
    return rows.map(info);
  }

  /** The registered name of one company; "" when it does not exist. */
  async nameOf(companyId: string): Promise<string> {
    return (await companyRepository.getById(companyId))?.name ?? "";
  }

  /** The modules the company hides; none for a company that does not exist. */
  async hiddenModulesOf(companyId: string): Promise<AppModule[]> {
    if (!isUuid(companyId)) return [];
    return ((await companyRepository.getById(companyId))?.hiddenModules ?? []).filter(isAppModule);
  }

  /** Superadmin: which modules the company's users do not get. */
  async setHiddenModules(companyId: string, hiddenModules: unknown): Promise<CompanyInfo> {
    const modules = cleanHiddenModules(hiddenModules);
    const updated = isUuid(companyId) ? await companyRepository.update(companyId, { hiddenModules: modules }) : null;
    if (!updated) throw APIError.notFound("Company not found");
    return info(updated);
  }
}

export const companyService = new CompanyService();
