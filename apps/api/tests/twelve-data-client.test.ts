import { afterEach, describe, expect, it, vi } from 'vitest';

import { TwelveDataClient } from '../src/providers/twelve-data-client.js';

describe('TwelveDataClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies Twelve Data when access to an endpoint is denied', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
    const client = new TwelveDataClient('test-key', 'https://twelve.example', 1000);

    await expect(client.getQuote('META')).rejects.toThrow(
      'Twelve Data denied this request. Check that the API key and plan include this endpoint.',
    );
  });
});
