export interface User {
  createdAt: string;
  id: string;
  passwordHash: string | null;
  updatedAt: string;
  username: string;
}

export interface UserSettings {
  dateFormat: DateFormat;
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

export type DateFormat = 'dd/mm/yyyy' | 'mm/dd/yyyy';
