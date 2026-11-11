"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { API_BASE } from "@/lib/api";
import { actingCompanyId, clearActingCompany, withActingCompany } from "@/lib/actingCompany";
import { dropSessionToken, sessionCheckOutcome, sessionToken, startSession } from "@/lib/auth/pageSession";
import { canSeeConcepts } from "@/lib/concepts";


export interface AuthUser {
  id: string;
  companyId: string;
  email: string;
  displayName: string;
  role: string;
  departmentId: string | null;
  branchId: string | null;
}

/** The company the session works as: the user's own, or the one a superadmin chose (lib/actingCompany). */
export interface WorkingCompany {
  id: string;
  name: string;
  /** A superadmin working as another company than their own. */
  switched: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Known once the session is restored; null right after a sign-in (the user's own company). */
  company: WorkingCompany | null;
  token: string | null;
  isLoading: boolean;
  /** The stored session could not be checked (the server did not answer, or answered with an error of its own); it is kept for a retry. */
  serverUnreachable: boolean;
  /** Checks the stored session again. */
  retrySession: () => void;
  loginError: string | null;
  isLoggingIn: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  company: null,
  token: null,
  isLoading: true,
  serverUnreachable: false,
  retrySession: () => {},
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
  const [company, setCompany] = useState<WorkingCompany | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [serverUnreachable, setServerUnreachable] = useState(false);
  // Counts the tries to restore the session: "Retry" on the unreachable screen asks again.
  const [restoreTry, setRestoreTry] = useState(0);

  // Restore session on mount
  useEffect(() => {
    const savedToken = sessionToken();
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    // Safety timeout — don't hang forever if API is down. It aborts the request, so an answer
    // arriving later can't sign the user in after the unreachable screen was already shown.
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 5000);

    fetch(`${API_BASE}/auth/me`, {
      headers: withActingCompany(new Headers({ Authorization: `Bearer ${savedToken}` })),
      signal: controller.signal,
    })
      .then(async (res) => {
        const outcome = sessionCheckOutcome(res.status);
        // The server refused the token: the session is over, and the login page opens.
        if (outcome === "ended") return dropSessionToken();
        // The server answered with an error of its own (starting up, down): the token is kept.
        if (outcome === "unreachable") return setServerUnreachable(true);
        const data = await res.json();
        // A company chosen to work as that is no longer one (or a user who is no superadmin any
        // more): the server answered the user's own, and the choice is dropped.
        if (actingCompanyId() && !data.company?.switched) clearActingCompany();
        setUser(data.user);
        setCompany(data.company ?? null);
        setToken(savedToken);
      })
      .catch(() => {
        // Aborted by the cleanup below (unmount, or React's dev double-run): not a failed session.
        if (controller.signal.aborted && !timedOut) return;
        // No answer in time, no connection, or an answer that was not the API's: nothing says the
        // session is over, so the token is kept and the user can try again (an API cold start
        // must not sign everybody out).
        setServerUnreachable(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (controller.signal.aborted && !timedOut) return;
        setIsLoading(false);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [restoreTry]);

  const retrySession = useCallback(() => {
    setServerUnreachable(false);
    setIsLoading(true);
    setRestoreTry((n) => n + 1);
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
      // A new session starts in the user's own company, whatever was chosen in this browser before.
      // This page signs its requests with the new token from now on; other tabs are loaded again.
      clearActingCompany();
      startSession(data.token);
      setCompany(null);
      setUser(data.user);
      setToken(data.token);
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
    setCompany(null);
    setToken(null);
    dropSessionToken();
    clearActingCompany();
    // Navigate to login — use window.location for clean state reset
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, company, token, isLoading, serverUnreachable, retrySession, loginError, isLoggingIn, login, logout }}>
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

/** Roles that may change a chosen Customs Office and answer the requests to change one; the server enforces the same. */
export const CUSTOMS_OFFICE_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user may change a chosen Customs Office directly (a regular user asks for it). */
export const useCanChangeCustomsOffice = (): boolean => {
  const { user } = useAuth();
  return !!user && (CUSTOMS_OFFICE_MANAGER_ROLES as readonly string[]).includes(user.role);
};

/** Roles that may delete a document and take back customs' approval of one; the server enforces the same. */
export const DOCUMENT_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user may delete documents and change an approved one directly (a regular user asks for it). */
export const useCanManageDocuments = (): boolean => {
  const { user } = useAuth();
  return !!user && (DOCUMENT_MANAGER_ROLES as readonly string[]).includes(user.role);
};

/** Whether the signed-in user may delete anyone's chat message at any time; the server enforces the same (lib/chatRule). */
export const useCanDeleteAnyChatMessage = (): boolean => {
  const { user } = useAuth();
  return user?.role === "superadmin" || user?.role === "admin";
};

/** Roles that may delete a shipment (it also retires its costs and billing); the server enforces the same. */
export const SHIPMENT_DELETE_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user may delete shipments. */
export const useCanDeleteShipments = (): boolean => {
  const { user } = useAuth();
  return !!user && (SHIPMENT_DELETE_ROLES as readonly string[]).includes(user.role);
};

/** Roles that may add the suppliers under Tariffs (rail operators, first / last mile hauliers, shipping lines), set our hubs, and upload, correct, approve or discard tariffs; the server enforces the same. */
export const TARIFF_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user may manage tariffs (everyone may look at them). */
export const useCanManageTariffs = (): boolean => {
  const { user } = useAuth();
  return !!user && (TARIFF_MANAGER_ROLES as readonly string[]).includes(user.role);
};

/** Roles that may upload, read and delete the company's public holidays; the server enforces the same. */
export const HOLIDAY_MANAGER_ROLES = ["superadmin", "admin", "manager"] as const;

/** Whether the signed-in user may manage public holidays (everyone may look at them). */
export const useCanManageHolidays = (): boolean => {
  const { user } = useAuth();
  return !!user && (HOLIDAY_MANAGER_ROLES as readonly string[]).includes(user.role);
};

/** Whether the signed-in user sees the concept modules (Warehouse Concept, Trucking Concept): superadmins only. */
export const useCanSeeConcepts = (): boolean => {
  const { user } = useAuth();
  return canSeeConcepts(user);
};
