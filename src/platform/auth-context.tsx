import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { platform } from "./index";
import type { User } from "./models";

type AuthContextValue = {
  enabled: boolean;
  loading: boolean;
  user: User | null;
  refresh(): Promise<void>;
  signOut(scope?: "local" | "global" | "others"): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function PlatformAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(platform.auth.enabled);

  useEffect(() => platform.auth.subscribe((next) => { setUser(next); setLoading(false); }), []);

  const value = useMemo<AuthContextValue>(() => ({
    enabled: platform.auth.enabled,
    loading,
    user,
    refresh: async () => { setLoading(true); try { setUser(await platform.auth.getUser()); } finally { setLoading(false); } },
    signOut: async (scope = "local") => { await platform.auth.signOut(scope); if (scope !== "others") setUser(null); },
  }), [loading, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside PlatformAuthProvider.");
  return value;
}