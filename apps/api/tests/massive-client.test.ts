import { afterEach, describe, expect, it, vi } from 'vitest';

import { MassiveClient } from '../src/providers/massive-client.js';

describe('MassiveClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies Massive when access to an endpoint is denied', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));
    const client = new MassiveClient('test-key', 'https://massive.example', 1000);

    await expect(client.getDividends('AAPL')).rejects.toThrow(
      'Massive denied this request. Check that the API key and plan include this endpoint.',
    );
  });

  it('maps dividend results and sorts them by ex-dividend date descending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        {
          cash_amount: 0.24,
          currency: 'USD',
          declaration_date: '2025-01-15',
          distribution_type: 'recurring',
          ex_dividend_date: '2025-02-10',
          frequency: 4,
          pay_date: '2025-02-28',
          ticker: 'AAPL',
        },
        {
          cash_amount: 0.23,
          currency: 'USD',
          declaration_date: '2024-10-15',
          distribution_type: 'recurring',
          ex_dividend_date: '2024-11-08',
          frequency: 4,
          pay_date: '2024-11-25',
          ticker: 'AAPL',
        },
      ],
      status: 'OK',
    }), { status: 200 })));
    const client = new MassiveClient('test-key', 'https://massive.example', 1000);

    const dividends = await client.getDividends('AAPL');

    expect(dividends).toHaveLength(2);
    expect(dividends[0]?.exDividendDate).toBe('2025-02-10');
    expect(dividends[1]?.exDividendDate).toBe('2024-11-08');
    expect(dividends[0]?.cashAmount).toBe(0.24);
  });

  it('maps chart aggregate bars into ascending chart points', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      results: [
        { c: 101, h: 102, l: 99, o: 100, t: 1_700_006_400_000, v: 2000 },
        { c: 100, h: 101, l: 98, o: 99, t: 1_699_920_000_000, v: 1000 },
      ],
      status: 'OK',
    }), { status: 200 })));
    const client = new MassiveClient('test-key', 'https://massive.example', 1000);

    const chart = await client.getChart('AAPL', '1day', 2);

    expect(chart).toHaveLength(2);
    expect(chart[0]?.close).toBe(100);
    expect(chart[1]?.close).toBe(101);
  });
});
