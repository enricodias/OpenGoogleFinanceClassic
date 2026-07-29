import { describe, expect, it } from 'vitest';

import { SecretCipher } from '../src/security/secret-cipher.js';

describe('SecretCipher', () => {
  it('encrypts credentials with user and provider-bound additional data', () => {
    const cipher = new SecretCipher(Buffer.alloc(32, 7));
    const encrypted = cipher.encrypt('user-a', 'twelve-data', 'secret-key');

    expect(cipher.decrypt('user-a', 'twelve-data', encrypted)).toBe('secret-key');
    expect(() => cipher.decrypt('user-b', 'twelve-data', encrypted)).toThrow();
    expect(() => cipher.decrypt('user-a', 'finnhub', encrypted)).toThrow();
  });
});
