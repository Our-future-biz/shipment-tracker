// The call options of an internal call made for a company with no signed-in user behind it (a
// Pub/Sub handler, a cron). The internal endpoints called this way read only the company, so it
// names the company and no user, with the least role.
export const asCompany = (companyId: string) => ({ authData: { userID: "", companyID: companyId, role: "user" } });
