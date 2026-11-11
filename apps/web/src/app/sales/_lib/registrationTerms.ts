// What a company accepts on the registration form it gets by link (Sales Settings → Registration
// terms): what the terms are called, and where they are read.
export interface RegistrationTerms {
  termsName: string;
  termsUrl: string;
}

/**
 * The form of the registration terms: what is stored, with what the user changed on top. Nothing
 * can be saved before the stored terms are read (`stored` undefined): the form would send blanks,
 * and the server stores a blank name as the default "Terms and Conditions", over the company's own.
 */
export function registrationTermsForm(stored: RegistrationTerms | undefined, edits: Partial<RegistrationTerms>) {
  const termsName = edits.termsName ?? stored?.termsName ?? "";
  const termsUrl = edits.termsUrl ?? stored?.termsUrl ?? "";
  const changed = edits.termsName !== undefined || edits.termsUrl !== undefined;
  return { termsName, termsUrl, canSave: !!stored && changed && !!termsUrl.trim() };
}
