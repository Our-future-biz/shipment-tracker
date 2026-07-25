import { salesPreferenceRepository } from "../repositories/salesPreference.repository";

class PreferenceService {
  async get(prefKey: string) {
    return salesPreferenceRepository.get(prefKey);
  }

  async set(prefKey: string, value: unknown) {
    await salesPreferenceRepository.set(prefKey, value);
  }
}

export const preferenceService = new PreferenceService();
