import { Service } from "encore.dev/service";
import { appMeta } from "encore.dev";
import log from "encore.dev/log";
import { appUrlProblem, configureAppEnvironment, resolveAppUrl } from "../../lib/appUrl";

// Trucking: road transport by subcontracted hauliers. Phase 1 holds the trucking settings
// (service levels, vehicle types, chargeable-weight factors, margin floor, transport-order texts)
// and each haulier's trucking profile (insurance, licence, VAT checks, block, preferred lanes).

// The haulier's order link and the portal's set-password link are built on APP_URL. A missing or
// unusable value never stops the service (Encore Cloud has no plain env vars): links fall back to
// the production web app and the reason is logged once here.
const env = appMeta().environment;
configureAppEnvironment(env);
const problem = appUrlProblem(process.env.APP_URL, env);
if (problem) log.warn("trucking: APP_URL unusable, links use the fallback", { problem, fallback: resolveAppUrl(undefined, env) });

export default new Service("trucking");
