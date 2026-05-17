import { hash, verify } from "@node-rs/argon2";
import { APIError } from "encore.dev/api";
import { SignJWT, jwtVerify } from "jose";
import { userRepository } from "../repositories/user.repository";

const JWT_SECRET = new TextEncoder().encode("shipment-tracker-dev-secret-change-in-prod");
const TOKEN_EXPIRY = "24h";

export interface AuthUserInfo {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

class AuthService {
  async login(email: string, password: string): Promise<{ token: string; user: AuthUserInfo }> {
    const found = await userRepository.findByEmail(email.toLowerCase().trim());
    if (!found) {
      throw APIError.unauthenticated("Invalid email or password");
    }
    const valid = await verify(found.passwordHash, password);
    if (!valid) {
      throw APIError.unauthenticated("Invalid email or password");
    }
    const token = await this.#createToken(found.id, found.role);
    return {
      token,
      user: { id: found.id, email: found.email, displayName: found.displayName, role: found.role },
    };
  }

  async register(email: string, password: string, displayName: string, role = "user"): Promise<AuthUserInfo> {
    const passwordHash = await hash(password);
    const created = await userRepository.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      displayName,
      role,
    });
    return { id: created.id, email: created.email, displayName: created.displayName, role: created.role };
  }

  async getUserById(id: string): Promise<AuthUserInfo | null> {
    const found = await userRepository.getById(id);
    if (!found) return null;
    return { id: found.id, email: found.email, displayName: found.displayName, role: found.role };
  }

  async verifyToken(token: string): Promise<{ userId: string; role: string }> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return { userId: payload.sub as string, role: payload.role as string };
    } catch {
      throw APIError.unauthenticated("Invalid or expired token");
    }
  }

  async #createToken(userId: string, role: string): Promise<string> {
    return new SignJWT({ role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .sign(JWT_SECRET);
  }
}

export const authService = new AuthService();
