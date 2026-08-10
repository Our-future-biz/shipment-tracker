import { companyRepository } from "../repositories/company.repository";

export interface CompanyInfo {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

class CompanyService {
  async list(): Promise<CompanyInfo[]> {
    const rows = await companyRepository.getAll(1000);
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    }));
  }
}

export const companyService = new CompanyService();
