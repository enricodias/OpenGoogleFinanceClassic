export type ProviderErrorKind = 'invalid-credential' | 'not-found' | 'rate-limited' | 'unavailable';

export class ProviderError extends Error {
  public constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
  ) {
    super(message);
  }
}
