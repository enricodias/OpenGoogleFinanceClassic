import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

import type { EncryptedSecret } from '../domain/user.js';

const ALGORITHM = 'aes-256-gcm';

export class SecretCipher {
  public constructor(private readonly encryptionKey: Buffer) {}

  public encrypt(userId: string, providerId: string, value: string): EncryptedSecret {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, initializationVector);
    cipher.setAAD(this.createAdditionalData(userId, providerId));

    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return {
      authenticationTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      initializationVector: initializationVector.toString('base64'),
    };
  }

  public decrypt(userId: string, providerId: string, secret: EncryptedSecret): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(secret.initializationVector, 'base64'),
    );
    decipher.setAAD(this.createAdditionalData(userId, providerId));
    decipher.setAuthTag(Buffer.from(secret.authenticationTag, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(secret.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private createAdditionalData(userId: string, providerId: string): Buffer {
    return Buffer.from(`provider:${userId}:${providerId}`, 'utf8');
  }
}
