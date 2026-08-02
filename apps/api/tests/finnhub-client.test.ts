import { afterEach, describe, expect, it, vi } from 'vitest';

import { FinnhubClient } from '../src/providers/finnhub-client.js';

describe('FinnhubClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns market capitalization and website from Company Profile 2', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      marketCapitalization: 1754300,
      name: 'Meta Platforms, Inc.',
      weburl: 'https://about.meta.com',
    }))));
    const client = new FinnhubClient('test-key', 'https://finnhub.example/api/v1', 1000);

    await expect(client.getCompanyProfile('META')).resolves.toEqual({
      marketCapitalization: 1754300,
      website: 'https://about.meta.com',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://finnhub.example/api/v1/stock/profile2?symbol=META&token=test-key',
      }),
      expect.any(Object),
    );
  });
});
