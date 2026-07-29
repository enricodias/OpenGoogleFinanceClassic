export interface User {
  createdAt: string;
  id: string;
  passwordHash: string | null;
  updatedAt: string;
  username: string;
}

export interface UserSettings {
  providerCredentials: Record<string, EncryptedSecret>;
  quoteRefreshIntervalSeconds: number;
  selectedWatchlistId: string | null;
  theme: ThemePreference;
  userId: string;
}

export interface EncryptedSecret {
  authenticationTag: string;
  ciphertext: string;
  initializationVector: string;
}

export interface Session {
  createdAt: string;
  id: string;
  userId: string;
}

export type ThemePreference = 'dark' | 'light' | 'system';
