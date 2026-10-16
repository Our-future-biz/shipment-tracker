"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { isModuleEnabled, type AppModule } from "@/lib/modules";


export interface AuthUser {
  id: string;
  companyId: string;
  email: string;
  displayName: string;
  role: string;
  departmentId: string | null;
  branchId: string | null;
  /** Modules the user's company has hidden (always none for a superadmin). */
  hiddenModules?: AppModule[];
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  loginError: string | null;
  isLoggingIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  loginError: null,
  isLoggingIn: false,
  login: async () => {},
  logout: () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("auth_token");
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    // Safety timeout — don't hang forever if API is down
    const timeout = setTimeout(() => {
      setIsLoading(false);
      localStorage.removeItem("auth_token");
    }, 5000);

    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${savedToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid session");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        setToken(savedToken);
      })
      .catch(() => {
        localStorage.removeItem("auth_token");
      })
      .finally(() => {
        clearTimeout(timeout);
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoginError(null);
    setIsLoggingIn(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Invalid email or password");
      }
      const data = await res.json();
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem("auth_token", data.token);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setLoginError(msg);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
    // Navigate to login — use window.location for clean state reset
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, loginError, isLoggingIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

/** Roles that may change a customer's commercial fields (sales owner, credit, label, terms, risk); the server enforces the same. */
export const CUSTOMER_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user may change a customer's commercial fields. */
export const useCanManageCustomers = (): boolean => {
  const { user } = useAuth();
  return !!user && (CUSTOMER_MANAGER_ROLES as readonly string[]).includes(user.role);
};

/** Whether a module is on for the signed-in user's company (a superadmin sees every module). */
export const useModules = () => {
  const { user } = useAuth();
  return { isEnabled: (module: AppModule) => isModuleEnabled(user, module) };
};
