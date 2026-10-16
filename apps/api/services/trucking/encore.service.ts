import { Service } from "encore.dev/service";
import { appMeta } from "encore.dev";
import { resolveAppUrl } from "../../lib/appUrl";

// Trucking: road transport by subcontracted hauliers. Phase 1 holds the trucking settings
// (service levels, vehicle types, chargeable-weight factors, margin floor, transport-order texts)
// and each haulier's trucking profile (insurance, licence, VAT checks, block, preferred lanes).

// The haulier's order link and the portal's set-password link are built on APP_URL: outside local
// development and tests the service refuses to start without it (no link may point at localhost).
resolveAppUrl(process.env.APP_URL, appMeta().environment);

export default new Service("trucking");
