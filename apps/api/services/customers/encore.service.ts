import { Service } from "encore.dev/service";
import { appMeta } from "encore.dev";
import { configureAppEnvironment } from "../../lib/appUrl";

// The registration link a colleague sends a company is built on APP_URL (lib/appUrl). The environment
// is told here too, not only by Trucking: in a process without the Trucking service a missing APP_URL
// would otherwise be taken for local development and the link would point at localhost.
configureAppEnvironment(appMeta().environment);

export default new Service("customers");
