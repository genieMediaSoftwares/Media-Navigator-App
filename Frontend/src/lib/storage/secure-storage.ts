import * as SecureStore from 'expo-secure-store';

// All keys persisted in the device keychain/keystore. Add new keys here.
export const SecureStorageKey = {
  AuthToken: 'auth_token',
} as const;

export type SecureStorageKey = (typeof SecureStorageKey)[keyof typeof SecureStorageKey];

export function getSecureItem(key: SecureStorageKey): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export function setSecureItem(key: SecureStorageKey, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value);
}

export function deleteSecureItem(key: SecureStorageKey): Promise<void> {
  return SecureStore.deleteItemAsync(key);
}
