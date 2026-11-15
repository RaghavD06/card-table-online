import type { AuthProvider, AuthSession } from "./index";

export interface AuthIdentity {
  id: string;
  provider: AuthProvider;
  providerAccountId: string;
  email?: string;
}

export interface AuthBoundary {
  createGuestSession(displayName: string): Promise<AuthSession>;
  authenticate(identity: AuthIdentity): Promise<AuthSession>;
  resolveSession(sessionToken: string): Promise<AuthSession | null>;
}

export interface PasswordAuthBoundary extends AuthBoundary {
  registerEmail(email: string, password: string, displayName: string): Promise<AuthSession>;
  loginEmail(email: string, password: string): Promise<AuthSession>;
  beginGoogleLogin(): { enabled: boolean; authorizationUrl?: string };
}
