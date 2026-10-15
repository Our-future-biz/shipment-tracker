import { Service } from "encore.dev/service";

// Trucking: road transport by subcontracted hauliers. Phase 1 holds the trucking settings
// (service levels, vehicle types, chargeable-weight factors, margin floor, transport-order texts)
// and each haulier's trucking profile (insurance, licence, VAT checks, block, preferred lanes).
export default new Service("trucking");
