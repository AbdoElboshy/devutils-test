import type { AuthProvider, Unsubscribe } from "./contracts";
import type { AccountSession, User } from "./models";
import { apiFetch } from "./http";

function unavailable(): never {
  throw new Error("Accounts are not configured for this deployment. Public tools remain fully available.");
}

export class AnonymousAuthProvider implements AuthProvider {
  readonly enabled = false;
  async getUser(): Promise<User | null> { return null; }
  async getSession(): Promise<AccountSession | null> { return null; }
  async signUp(_input: { name: string; email: string; password: string; emailRedirectTo: string }): Promise<{ user: User; verificationRequired: boolean }> { return unavailable(); }
  async signInWithPassword(_input: { email: string; password: string; remember: boolean }): Promise<User> { return unavailable(); }
  async signOut(_scope?: "local" | "global" | "others"): Promise<void> { /* no anonymous session */ }
  async requestPasswordReset(_email: string, _redirectTo: string): Promise<void> { return unavailable(); }
  async updatePassword(_password: string): Promise<void> { return unavailable(); }
  async updateEmail(_email: string): Promise<void> { return unavailable(); }
  async updateProfileMetadata(_input: { displayName: string; avatarUrl?: string }): Promise<void> { return unavailable(); }
  async resendVerification(_email: string, _redirectTo: string): Promise<void> { return unavailable(); }
  async deleteAccount(): Promise<void> { return unavailable(); }
  subscribe(listener: (user: User | null) => void): Unsubscribe { listener(null); return () => undefined; }
}

export class HttpAuthProvider implements AuthProvider {
  readonly enabled = true;
  private listeners = new Set<(user: User | null) => void>();
  private channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("devutils-auth") : null;

  constructor() {
    this.channel?.addEventListener("message", () => { void this.getUser().then((user) => this.emit(user)).catch(() => this.emit(null)); });
  }
  private emit(user: User | null) { this.listeners.forEach((listener) => listener(user)); }
  private changed() { this.channel?.postMessage("changed"); }
  private userRequest: Promise<User | null> | null = null;

  async getUser(): Promise<User | null> {
    if (this.userRequest) return this.userRequest;

    const request = apiFetch<{ user: User | null }>(
      "/api/auth/me"
    ).then((result) => result.user);

    this.userRequest = request;
    try {
      return await request;
    } finally {
      if (this.userRequest === request) this.userRequest = null;
    }
  }
  async getSession(): Promise<AccountSession | null> { try { return await apiFetch<AccountSession>("/api/auth/session"); } catch { return null; } }
  async signUp(input: { name: string; email: string; password: string; emailRedirectTo: string }): Promise<{ user: User; verificationRequired: boolean }> {
    const result = await apiFetch<{ user: User | null; verificationRequired: boolean }>("/api/auth/signup", { method: "POST", body: JSON.stringify({ name: input.name, email: input.email, password: input.password }) });
    if (!result.user) return { user: { id: "pending", email: input.email, emailVerified: false, displayName: input.name, avatarUrl: null, planId: "free", createdAt: new Date().toISOString() }, verificationRequired: true };
    this.emit(result.user); this.changed(); return { user: result.user, verificationRequired: result.verificationRequired };
  }
  async signInWithPassword(input: { email: string; password: string; remember: boolean }): Promise<User> { const result = await apiFetch<{ user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }); this.emit(result.user); this.changed(); return result.user; }
  async signOut(scope: "local" | "global" | "others" = "local"): Promise<void> { await apiFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({ scope }) }); if (scope !== "others") this.emit(null); this.changed(); }
  async requestPasswordReset(email: string, _redirectTo: string): Promise<void> { await apiFetch("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }); }
  async updatePassword(password: string): Promise<void> { await apiFetch("/api/auth/password", { method: "POST", body: JSON.stringify({ password }) }); this.emit(null); this.changed(); }
  async updateEmail(email: string): Promise<void> { await apiFetch("/api/auth/email", { method: "POST", body: JSON.stringify({ email }) }); }
  async updateProfileMetadata(input: { displayName: string; avatarUrl?: string }): Promise<void> { await apiFetch("/api/auth/metadata", { method: "POST", body: JSON.stringify(input) }); this.changed(); }
  async resendVerification(email: string, _redirectTo: string): Promise<void> { await apiFetch("/api/auth/resend", { method: "POST", body: JSON.stringify({ email }) }); }
  async deleteAccount(): Promise<void> { await apiFetch("/api/account", { method: "DELETE" }); this.emit(null); this.changed(); }
  subscribe(listener: (user: User | null) => void): Unsubscribe {
    this.listeners.add(listener);
    void this.getUser().then(listener).catch(() => listener(null));
    const focus = () => { if (document.visibilityState === "visible") void this.getUser().then(listener).catch(() => listener(null)); };
    document.addEventListener("visibilitychange", focus);
    return () => { this.listeners.delete(listener); document.removeEventListener("visibilitychange", focus); };
  }
}