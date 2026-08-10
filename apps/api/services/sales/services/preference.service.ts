import { salesPreferenceRepository } from "../repositories/salesPreference.repository";

class PreferenceService {
  async get(prefKey: string, companyId: string) {
    return salesPreferenceRepository.get(prefKey, companyId);
  }

  async set(prefKey: string, companyId: string, value: unknown) {
    await salesPreferenceRepository.set(prefKey, companyId, value);
  }
}

export const preferenceService = new PreferenceService();
