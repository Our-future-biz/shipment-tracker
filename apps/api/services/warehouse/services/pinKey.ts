import { secret } from "encore.dev/config";

// Key of the pick-up PIN HMAC. The JWT secret is reused on purpose: it is set in every
// environment already, and a new secret name would block deploys until someone sets it.
const jwtSecret = secret("JWT_SECRET");

export const pickupPinKey = (): string => jwtSecret();
