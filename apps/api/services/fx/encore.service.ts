import { Service } from "encore.dev/service";

// Exchange rates: the official ČNB daily fixing (imported and stored, never fetched
// while a page waits), the company ROE % and period averages for reports.
export default new Service("fx");
