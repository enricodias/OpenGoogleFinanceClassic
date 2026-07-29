import type { MarketGroup } from '../domain/watchlist.js';
import { getJson, type RedisClient, setJson } from './redis-client.js';

export class MarketGroupRepository {
  public constructor(private readonly client: RedisClient) {}

  public async get(userId: string): Promise<MarketGroup[]> {
    const groups = await getJson<MarketGroup[]>(this.client, this.key(userId));

    if (groups === null) {
      return DEFAULT_MARKET_GROUPS;
    }

    return groups;
  }

  public async replace(userId: string, groups: MarketGroup[]): Promise<void> {
    await setJson(this.client, this.key(userId), '$', groups);
  }

  private key(userId: string): string {
    return `market-groups:${userId}`;
  }
}

const DEFAULT_MARKET_GROUPS: MarketGroup[] = [
  {
    id: 'us-markets',
    name: 'US markets',
    instruments: [
      { exchange: 'NYSE Arca', name: 'SPDR S&P 500 ETF Trust', symbol: 'SPY', type: 'ETF' },
      { exchange: 'NYSE Arca', name: 'Invesco QQQ Trust', symbol: 'QQQ', type: 'ETF' },
      { exchange: 'NYSE Arca', name: 'SPDR Dow Jones Industrial Average ETF Trust', symbol: 'DIA', type: 'ETF' },
    ],
  },
  {
    id: 'currencies',
    name: 'Currencies',
    instruments: [
      { exchange: null, name: 'Euro to US Dollar', symbol: 'EUR/USD', type: 'Forex' },
      { exchange: null, name: 'US Dollar to Japanese Yen', symbol: 'USD/JPY', type: 'Forex' },
      { exchange: null, name: 'British Pound to US Dollar', symbol: 'GBP/USD', type: 'Forex' },
    ],
  },
  {
    id: 'crypto',
    name: 'Crypto',
    instruments: [
      { exchange: null, name: 'Bitcoin to US Dollar', symbol: 'BTC/USD', type: 'Crypto' },
      { exchange: null, name: 'Ethereum to US Dollar', symbol: 'ETH/USD', type: 'Crypto' },
    ],
  },
];
