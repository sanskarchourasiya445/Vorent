import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { AuthUser } from "@warrant/contracts";
import { authService, type PersonaInfo } from "../api/authService";


export interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  personas: PersonaInfo[];
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  switchPersona: (email: string, password?: string) => Promise<void>;
  isAuthModalOpen: boolean;
  authModalTab: "login" | "register";
  openAuthModal: (tab?: "login" | "register") => void;
  closeAuthModal: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children?: React.ReactNode;
  initialUser?: AuthUser | null;
  initialToken?: string | null;
  initialIsLoading?: boolean;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialUser,
  initialToken,
  initialIsLoading,
}) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (initialUser !== undefined) return initialUser;
    return null;
  });
  const [token, setToken] = useState<string | null>(() => {
    if (initialToken !== undefined) return initialToken;
    return authService.getToken();
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (initialIsLoading !== undefined) return initialIsLoading;
    if (initialUser !== undefined) return false;
    return true;
  });
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login");

  // Fetch current user if token exists and load personas
  const initAuth = useCallback(async () => {
    // If an initialUser was explicitly provided (e.g. in tests or SSR), skip automatic remote fetch
    if (initialUser !== undefined && initialUser !== null) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // 1. Load starter personas
      try {
        const personasRes = await authService.getPersonas();
        if (personasRes && Array.isArray(personasRes.personas)) {
          setPersonas(personasRes.personas);
        }
      } catch {
        // Non-blocking if API offline
      }

      // 2. Hydrate session if token exists
      const currentToken = authService.getToken();
      if (currentToken) {
        try {
          const meRes = await authService.getMe();
          if (meRes?.user) {
            setUser(meRes.user);
            setToken(currentToken);
            setIsLoading(false);
            return;
          }
        } catch {
          // Token invalid or expired - clear local state
          await authService.logout();
          setUser(null);
          setToken(null);
        }
      }

      // 3. Unauthenticated state: visitor has no active session
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, [initialUser]);

  useEffect(() => {
    void initAuth();
  }, [initAuth]);

  // Listen for global 401 session expiration events
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setToken(null);
      setAuthModalTab("login");
      setIsAuthModalOpen(true);
      setError("Your session has expired or requires re-authentication. Please sign in.");
    };

    if (typeof window !== "undefined") {
      window.addEventListener("warrant_session_expired", handleSessionExpired);
      return () => window.removeEventListener("warrant_session_expired", handleSessionExpired);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const res = await authService.login({ email, password });
      setUser(res.user);
      setToken(res.token);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to log in";
      setError(msg);
      throw err;
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    setError(null);
    try {
      const res = await authService.register({ email, password, name });
      setUser(res.user);
      setToken(res.token);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to register";
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
    }
  };

  const switchPersona = async (email: string, plainPassword?: string) => {
    setError(null);
    // Find persona password if available in non-production
    const targetPersona = personas.find((p) => p.email.toLowerCase() === email.toLowerCase());
    const pass = plainPassword || targetPersona?.passwordHint || (!import.meta.env.PROD ? "AdminPass123!" : undefined);
    if (!pass) {
      throw new Error(`Password required to authenticate as ${email}.`);
    }
    try {
      const res = await authService.login({ email, password: pass });
      setUser(res.user);
      setToken(res.token);
    } catch (err: any) {
      const msg = err?.data?.error?.message || err?.message || "Failed to switch persona";
      setError(msg);
      throw err;
    }
  };

  const openAuthModal = (tab: "login" | "register" = "login") => {
    setAuthModalTab(tab);
    setError(null);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setError(null);
  };

  const clearError = () => setError(null);

  const value: AuthContextType = {
    user,
    token,
    isAuthenticated: !!user && !!token,
    isLoading,
    error,
    personas,
    login,
    register,
    logout,
    switchPersona,
    isAuthModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

const defaultAuthContext: AuthContextType = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  personas: [],
  isAuthModalOpen: false,
  authModalTab: "login",
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  switchPersona: async () => {},
  openAuthModal: () => {},
  closeAuthModal: () => {},
  clearError: () => {},
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  return context ?? defaultAuthContext;
}
