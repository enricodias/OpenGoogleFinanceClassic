import { type ChangeEvent, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import {
  api,
  ApiError,
  type AuthSession,
  type BackupDocument,
  type CachedResult,
  type ChartPoint,
  type CompanySnapshot,
  type EarningsCalendarEntry,
  type EarningsRecord,
  type HomeData,
  type InstrumentReference,
  type InstrumentSearchResult,
  type MarketGroup,
  type MarketQuote,
  type NewsArticle,
  type RecommendationTrend,
  type Settings,
  type Watchlist,
  type WatchlistSortColumn,
  type WatchlistSortDirection,
} from './api';
import {
  formatCompactNumber,
  formatCurrency,
  formatPercent,
  formatRelativeTime,
} from './format';
import './earnings.css';
import { useInstrumentColorStyle } from './instrument-color';

type View =
  | { kind: 'home' }
  | { instrument: InstrumentReference; kind: 'instrument' };

interface InstrumentData {
  chart: CachedResult<ChartPoint[]> | null;
  earnings: CachedResult<EarningsRecord[]> | null;
  companyProfile: CachedResult<CompanySnapshot> | null;
  upcomingEarnings: CachedResult<EarningsCalendarEntry[]> | null;
  news: CachedResult<NewsArticle[]> | null;
  quote: CachedResult<MarketQuote> | null;
  recommendationTrends: CachedResult<RecommendationTrend[]> | null;
}

const EMPTY_INSTRUMENT_DATA: InstrumentData = {
  chart: null,
  earnings: null,
  companyProfile: null,
  upcomingEarnings: null,
  news: null,
  quote: null,
  recommendationTrends: null,
};

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSession(): Promise<void> {
    try {
      setSession(await api<AuthSession>('/api/auth/session'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  if (session === null) {
    return <LoadingScreen message={error ?? 'Opening your market dashboard…'} />;
  }

  if (!session.authenticated) {
    return <AuthenticationScreen session={session} onAuthenticated={loadSession} />;
  }

  return <FinanceApplication session={session} onSessionChanged={loadSession} />;
}

function AuthenticationScreen({ session, onAuthenticated }: {
  session: AuthSession;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');

    try {
      setPending(true);
      setMessage(null);
      await api(`/api/auth/${mode}`, {
        body: JSON.stringify({ password, username }),
        method: 'POST',
      });
      await onAuthenticated();
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  const registrationAvailable = session.authenticationMode === 'required';

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Personal market dashboard</p>
        <h1>Open Finance Classic</h1>
        <p className="muted">A private, self-hosted space for your watchlists and market research.</p>
        <form className="stack" onSubmit={submit}>
          <label>
            Username
            <input autoComplete="username" minLength={3} name="username" required />
          </label>
          <label>
            Password
            <input autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} name="password" required type="password" />
          </label>
          {message === null ? null : <p className="form-message" role="alert">{message}</p>}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        {registrationAvailable ? (
          <button className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')} type="button">
            {mode === 'login' ? 'Create a new account' : 'I already have an account'}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function FinanceApplication({ session, onSessionChanged }: {
  session: AuthSession;
  onSessionChanged: () => Promise<void>;
}) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [marketGroupsOpen, setMarketGroupsOpen] = useState(false);
  const [createWatchlistOpen, setCreateWatchlistOpen] = useState(false);
  const [renameWatchlistTarget, setRenameWatchlistTarget] = useState<Watchlist | null>(null);
  const [deleteWatchlistTarget, setDeleteWatchlistTarget] = useState<Watchlist | null>(null);
  const [view, setView] = useState<View>({ kind: 'home' });

  async function loadDashboard(): Promise<void> {
    try {
      const [nextHome, nextSettings, nextWatchlists] = await Promise.all([
        api<HomeData>('/api/home'),
        api<Settings>('/api/settings'),
        api<{ selectedWatchlistId: string | null; watchlists: Watchlist[] }>('/api/watchlists'),
      ]);
      setHome(nextHome);
      setSettings(nextSettings);
      setWatchlists(nextWatchlists.watchlists);
      setError(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  useEffect(() => {
    void loadDashboard();
    const intervalId = window.setInterval(
      () => void loadDashboard(),
      (settings?.quoteRefreshIntervalSeconds ?? 120) * 1000,
    );

    return () => window.clearInterval(intervalId);
  }, [settings?.quoteRefreshIntervalSeconds]);

  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    const resolvedTheme = theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      : theme;
    document.documentElement.dataset.theme = resolvedTheme;
  }, [settings?.theme]);

  async function submitCreateWatchlist(name: string): Promise<void> {
    await api<Watchlist>('/api/watchlists', {
      body: JSON.stringify({ name }),
      method: 'POST',
    });
    await loadDashboard();
  }

  async function selectWatchlist(watchlistId: string): Promise<void> {
    try {
      await api<void>('/api/watchlists/selected', {
        body: JSON.stringify({ watchlistId }),
        method: 'PUT',
      });
      await loadDashboard();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function updateWatchlistSort(column: WatchlistSortColumn): Promise<void> {
    const direction: WatchlistSortDirection = column === settings?.watchlistSortColumn && settings.watchlistSortDirection === 'desc'
      ? 'asc'
      : 'desc';

    try {
      await api<void>('/api/settings/watchlist-sort', {
        body: JSON.stringify({ column, direction }),
        method: 'PUT',
      });
      await loadDashboard();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function submitRenameWatchlist(watchlistId: string, name: string): Promise<void> {
    await api<Watchlist>(`/api/watchlists/${watchlistId}`, {
      body: JSON.stringify({ name }),
      method: 'PUT',
    });
    await loadDashboard();
  }

  async function submitDeleteWatchlist(watchlistId: string): Promise<void> {
    await api<void>(`/api/watchlists/${watchlistId}`, { method: 'DELETE' });
    await loadDashboard();
  }

  async function removeWatchlistEntry(watchlistId: string, entryId: string): Promise<void> {
    try {
      await api<void>(`/api/watchlists/${watchlistId}/entries/${entryId}`, { method: 'DELETE' });
      await loadDashboard();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function logout(): Promise<void> {
    await api<void>('/api/auth/logout', { method: 'POST' });
    await onSessionChanged();
  }

  function openInstrument(instrument: InstrumentReference): void {
    setView({ instrument, kind: 'instrument' });
  }

  const configuredProviders = settings?.configuredProviders ?? [];
  const needsTwelveData = !configuredProviders.includes('twelve-data');
  const needsFinnhub = !configuredProviders.includes('finnhub');

  return (
    <main className="application-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ kind: 'home' })} type="button">
          <span className="brand-mark">OF</span>
          <span>Open Finance</span>
        </button>
        <SearchBox onSelect={openInstrument} />
        <div className="topbar-actions">
          <button aria-label="Open settings" className="icon-button" onClick={() => setSettingsOpen(true)} type="button">⚙</button>
          {session.authenticationMode === 'required' ? <button className="text-button" onClick={() => void logout()} type="button">Log out</button> : null}
        </div>
      </header>

      {needsTwelveData ? (
        <section className="setup-banner">
          <span>Connect your Twelve Data key to load quotes, charts, profiles, and earnings.</span>
          <button className="text-button" onClick={() => setSettingsOpen(true)} type="button">Open settings</button>
        </section>
      ) : null}
      {needsFinnhub ? (
        <section className="setup-banner subtle-banner">
          <span>Finnhub is optional and enables market and company news.</span>
          <button className="text-button" onClick={() => setSettingsOpen(true)} type="button">Add key</button>
        </section>
      ) : null}

      {error === null ? null : <p className="page-error" role="alert">{error}</p>}

      {view.kind === 'home' ? (
        <Dashboard
          dateFormat={settings?.dateFormat ?? 'dd/mm/yyyy'}
          home={home}
          onCreateWatchlist={() => setCreateWatchlistOpen(true)}
          onDeleteWatchlist={(watchlist) => setDeleteWatchlistTarget(watchlist)}
          onEditMarketGroups={() => setMarketGroupsOpen(true)}
          onOpenInstrument={openInstrument}
          onRenameWatchlist={(watchlist) => setRenameWatchlistTarget(watchlist)}
          onRemoveWatchlistEntry={removeWatchlistEntry}
          onSelectWatchlist={selectWatchlist}
          onSortWatchlist={updateWatchlistSort}
          sortColumn={settings?.watchlistSortColumn ?? null}
          sortDirection={settings?.watchlistSortDirection ?? 'desc'}
          watchlists={watchlists}
        />
      ) : (
        <InstrumentView
          dateFormat={settings?.dateFormat ?? 'dd/mm/yyyy'}
          instrument={view.instrument}
          onBack={() => setView({ kind: 'home' })}
          onChanged={loadDashboard}
          watchlists={watchlists}
        />
      )}

      {createWatchlistOpen ? (
        <WatchlistModal
          onClose={() => setCreateWatchlistOpen(false)}
          onSubmit={submitCreateWatchlist}
          submitLabel="Create"
          title="Create watchlist"
        />
      ) : null}
      {renameWatchlistTarget !== null ? (
        <WatchlistModal
          initialName={renameWatchlistTarget.name}
          onClose={() => setRenameWatchlistTarget(null)}
          onSubmit={(name) => submitRenameWatchlist(renameWatchlistTarget.id, name)}
          submitLabel="Save"
          title="Rename watchlist"
        />
      ) : null}
      {deleteWatchlistTarget !== null ? (
        <ConfirmModal
          confirmLabel="Delete list"
          danger
          message={`Are you sure you want to delete "${deleteWatchlistTarget.name}"? This action cannot be undone.`}
          onClose={() => setDeleteWatchlistTarget(null)}
          onConfirm={() => submitDeleteWatchlist(deleteWatchlistTarget.id)}
          title="Delete watchlist"
        />
      ) : null}
      {settingsOpen ? (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onUpdated={() => void loadDashboard()}
          settings={settings}
        />
      ) : null}
      {marketGroupsOpen && home !== null ? (
        <MarketGroupsPanel
          groups={home.marketGroups.map((group) => ({
            id: group.id,
            name: group.name,
            instruments: group.quotes.map((quote) => quote.instrument),
          }))}
          onClose={() => setMarketGroupsOpen(false)}
          onUpdated={async () => {
            setMarketGroupsOpen(false);
            await loadDashboard();
          }}
        />
      ) : null}
    </main>
  );
}

function Dashboard({ dateFormat, home, onCreateWatchlist, onDeleteWatchlist, onEditMarketGroups, onOpenInstrument, onRenameWatchlist, onRemoveWatchlistEntry, onSelectWatchlist, onSortWatchlist, sortColumn, sortDirection, watchlists }: {
  dateFormat: Settings['dateFormat'];
  home: HomeData | null;
  onCreateWatchlist: () => void;
  onDeleteWatchlist: (watchlist: Watchlist) => void;
  onEditMarketGroups: () => void;
  onOpenInstrument: (instrument: InstrumentReference) => void;
  onRenameWatchlist: (watchlist: Watchlist) => void;
  onRemoveWatchlistEntry: (watchlistId: string, entryId: string) => Promise<void>;
  onSelectWatchlist: (watchlistId: string) => Promise<void>;
  onSortWatchlist: (column: WatchlistSortColumn) => Promise<void>;
  sortColumn: WatchlistSortColumn | null;
  sortDirection: WatchlistSortDirection;
  watchlists: Watchlist[];
}) {
  if (home === null) {
    return <LoadingScreen message="Loading your market overview…" />;
  }

  const selectedWatchlist = home.selectedWatchlist.watchlist;

  return (
    <>
      <section className="market-overview" aria-label="Market overview">
        <div className="market-overview-heading">
          <p className="eyebrow">Market overview</p>
          <button className="text-button" onClick={onEditMarketGroups} type="button">Customize</button>
        </div>
        <div className="market-strip">
          {home.marketGroups.flatMap((group) => group.quotes).map((tile) => (
            <QuotePill key={`${tile.instrument.exchange ?? 'global'}-${tile.instrument.symbol}`} tile={tile} />
          ))}
        </div>
      </section>
      <div className="page-grid">
        <section className="main-column">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Your lists</p>
              <div className="watchlist-title-row">
                <select
                  aria-label="Selected watchlist"
                  onChange={(event) => void onSelectWatchlist(event.target.value)}
                  value={selectedWatchlist?.id ?? ''}
                >
                  {watchlists.length === 0 ? <option value="">No watchlists</option> : null}
                  {watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}
                </select>
                <button className="text-button" onClick={onCreateWatchlist} type="button">+ New list</button>
                {selectedWatchlist === null ? null : <button className="text-button" onClick={() => onRenameWatchlist(selectedWatchlist)} type="button">Rename</button>}
                {selectedWatchlist === null ? null : <button className="text-button" onClick={() => onDeleteWatchlist(selectedWatchlist)} type="button">Delete</button>}
              </div>
            </div>
          </div>
          {selectedWatchlist === null ? (
            <EmptyWatchlist onCreate={onCreateWatchlist} />
          ) : (
            <WatchlistRows
              onOpenInstrument={onOpenInstrument}
              onRemove={onRemoveWatchlistEntry}
              onSort={onSortWatchlist}
              quotes={home.selectedWatchlist.quotes}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              watchlist={selectedWatchlist}
            />
          )}

          <section className="content-section">
            <div className="section-heading"><h2>Today’s financial news</h2></div>
            <NewsList news={home.news?.data ?? []} />
          </section>
        </section>
        <aside className="side-column">
          <section className="card">
            <h2>Earnings calendar</h2>
            <p className="muted">Upcoming releases</p>
            <EarningsList dateFormat={dateFormat} earnings={home.earningsCalendar?.data ?? []} />
          </section>
        </aside>
      </div>
    </>
  );
}

function EmptyWatchlist({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state">
      <h2>Start your first watchlist</h2>
      <p>Add stocks, ETFs, currencies, or crypto from the search box.</p>
      <button className="primary-button" onClick={onCreate} type="button">Create watchlist</button>
    </div>
  );
}

function TickerBadge({ instrument }: { instrument: Pick<InstrumentReference, 'symbol'> }) {
  return <span className="ticker-badge" style={useInstrumentColorStyle(instrument)}>{instrument.symbol}</span>;
}

function TickerBadgeButton({ instrument, onOpenInstrument }: {
  instrument: InstrumentReference;
  onOpenInstrument: (instrument: InstrumentReference) => void;
}) {
  return (
    <button className="ticker-badge-button" onClick={() => onOpenInstrument(instrument)} type="button">
      <TickerBadge instrument={instrument} />
    </button>
  );
}

function WatchlistRows({ onOpenInstrument, onRemove, onSort, quotes, sortColumn, sortDirection, watchlist }: {
  onOpenInstrument: (instrument: InstrumentReference) => void;
  onRemove: (watchlistId: string, entryId: string) => Promise<void>;
  onSort: (column: WatchlistSortColumn) => Promise<void>;
  quotes: HomeData['selectedWatchlist']['quotes'];
  sortColumn: WatchlistSortColumn | null;
  sortDirection: WatchlistSortDirection;
  watchlist: Watchlist;
}) {
  if (quotes.length === 0) {
    return <div className="empty-state compact"><p>This watchlist is empty. Search for an instrument to add it.</p></div>;
  }

  const sortedQuotes = sortWatchlistQuotes(quotes, sortColumn, sortDirection);

  return (
    <div className="watchlist-rows">
      <WatchlistHeaderRow onSort={onSort} sortColumn={sortColumn} sortDirection={sortDirection} />
      {sortedQuotes.map((tile) => {
        const quote = tile.quote?.data;
        const direction = quote?.percentChange === null || quote?.percentChange === undefined ? 'neutral' : quote.percentChange >= 0 ? 'positive' : 'negative';
        const entry = watchlist.entries.find(({ instrument }) => instrument.symbol === tile.instrument.symbol && instrument.exchange === tile.instrument.exchange);

        return (
          <div className="watchlist-row" key={`${tile.instrument.symbol}-${tile.instrument.exchange ?? ''}`}>
            <TickerBadgeButton instrument={tile.instrument} onOpenInstrument={onOpenInstrument} />
            <button className="instrument-name" onClick={() => onOpenInstrument(tile.instrument)} type="button">{tile.instrument.name}</button>
            <span>{formatCurrency(quote?.lastPrice ?? null, quote?.currency ?? 'USD')}</span>
            <span className={`market-change ${direction}`}>{formatCurrency(quote?.change ?? null, quote?.currency ?? 'USD')}</span>
            <span className={`change-chip ${direction}`}>{formatPercent(quote?.percentChange ?? null)}</span>
            {entry === undefined ? null : <button aria-label={`Remove ${tile.instrument.symbol} from ${watchlist.name}`} className="remove-entry-button" onClick={() => void onRemove(watchlist.id, entry.id)} type="button">×</button>}
          </div>
        );
      })}
    </div>
  );
}

const WATCHLIST_SORT_HEADERS: { column: WatchlistSortColumn; label: string }[] = [
  { column: 'name', label: 'Name' },
  { column: 'price', label: 'Price' },
  { column: 'change', label: 'Change' },
  { column: 'percentChange', label: '% Change' },
];

function WatchlistHeaderRow({ onSort, sortColumn, sortDirection }: {
  onSort: (column: WatchlistSortColumn) => Promise<void>;
  sortColumn: WatchlistSortColumn | null;
  sortDirection: WatchlistSortDirection;
}) {
  return (
    <div className="watchlist-row watchlist-header-row">
      <span aria-hidden="true" />
      {WATCHLIST_SORT_HEADERS.map(({ column, label }) => (
        <button
          className={`watchlist-sort-button${sortColumn === column ? ' active' : ''}`}
          key={column}
          onClick={() => void onSort(column)}
          type="button"
        >
          {label}
          {sortColumn === column ? <span aria-hidden="true" className="sort-arrow">{sortDirection === 'asc' ? '▲' : '▼'}</span> : null}
        </button>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

function sortWatchlistQuotes(
  quotes: HomeData['selectedWatchlist']['quotes'],
  sortColumn: WatchlistSortColumn | null,
  sortDirection: WatchlistSortDirection,
): HomeData['selectedWatchlist']['quotes'] {
  if (sortColumn === null) {
    return quotes;
  }

  const sortedQuotes = [...quotes];

  sortedQuotes.sort((a, b) => {
    if (sortColumn === 'name') {
      return sortDirection === 'asc'
        ? a.instrument.name.localeCompare(b.instrument.name)
        : b.instrument.name.localeCompare(a.instrument.name);
    }

    const field = sortColumn === 'price' ? 'lastPrice' : sortColumn;

    return compareNullableNumbers(a.quote?.data[field] ?? null, b.quote?.data[field] ?? null, sortDirection);
  });

  return sortedQuotes;
}

function compareNullableNumbers(a: number | null, b: number | null, direction: WatchlistSortDirection): number {
  if (a === null && b === null) {
    return 0;
  }

  if (a === null) {
    return 1;
  }

  if (b === null) {
    return -1;
  }

  return direction === 'asc' ? a - b : b - a;
}

function QuotePill({ tile }: { tile: HomeData['marketGroups'][number]['quotes'][number] }) {
  const quote = tile.quote?.data;
  const positive = (quote?.percentChange ?? 0) >= 0;

  return (
    <button className="quote-pill" style={useInstrumentColorStyle(tile.instrument)} type="button">
      <span className={positive ? 'arrow-up' : 'arrow-down'}>{positive ? '↑' : '↓'}</span>
      <span><strong>{tile.instrument.symbol}</strong><small>{formatCurrency(quote?.lastPrice ?? null, quote?.currency ?? 'USD')}</small></span>
      <span className={positive ? 'positive' : 'negative'}>{formatPercent(quote?.percentChange ?? null)}</span>
    </button>
  );
}

function NewsList({ news }: { news: NewsArticle[] }) {
  if (news.length === 0) {
    return <p className="muted">Connect Finnhub to show recent market news.</p>;
  }

  return (
    <div className="news-list">
      {news.map((article) => (
        <a className="news-item" href={article.url} key={article.id} rel="noreferrer" target="_blank">
          <span><small>{article.source} · {formatRelativeTime(article.publishedAt)}</small><strong>{article.headline}</strong></span>
          {article.imageUrl === null ? null : <img alt="" src={article.imageUrl} />}
        </a>
      ))}
    </div>
  );
}

function EarningsList({ dateFormat, earnings }: { dateFormat: Settings['dateFormat']; earnings: EarningsCalendarEntry[] }) {
  if (earnings.length === 0) {
    return <p className="muted">No earnings data available.</p>;
  }

  return (
    <div className="earnings-list">
      {earnings.map((entry) => (
        <div className="earnings-item" key={`${entry.symbol}-${entry.releaseDate}`}>
          <span className="date-box"><small>{formatReleaseDate(entry.releaseDate, dateFormat, 'month')}</small>{formatReleaseDate(entry.releaseDate, dateFormat, 'day')}</span>
          <span><strong>{entry.name}</strong><small>{entry.symbol} · {entry.releaseTime ?? 'Time TBA'}</small></span>
        </div>
      ))}
    </div>
  );
}

function SearchBox({ onSelect }: { onSelect: (instrument: InstrumentReference) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InstrumentSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void api<CachedResult<InstrumentSearchResult[]>>(`/api/market/search?q=${encodeURIComponent(query)}`)
        .then((response) => {
          setResults(response.data.slice(0, 7));
          setError(null);
        })
        .catch((requestError) => {
          setError(errorMessage(requestError));
          setResults([]);
        });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  return (
    <div className="search-box">
      <label className="search-input">
        <span aria-hidden="true">⌕</span>
        <input onChange={(event) => setQuery(event.target.value)} placeholder="Search stocks, ETFs, currencies and crypto" value={query} />
      </label>
      {error === null && results.length === 0 ? null : (
        <div className="search-results">
          {error === null ? null : <p className="form-message">{error}</p>}
          {results.map((result) => (
            <button
              key={`${result.exchange ?? 'global'}-${result.symbol}`}
              onClick={() => {
                onSelect(result);
                setQuery('');
              }}
              type="button"
            >
              <TickerBadge instrument={result} />
              <span><strong>{result.name}</strong><small>{result.exchange ?? result.type ?? 'Market data'}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistModal({ initialName = '', title, submitLabel = 'Create', onClose, onSubmit }: {
  initialName?: string;
  title: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Watchlist name is required.');
      return;
    }

    try {
      setPending(true);
      setError(null);
      await onSubmit(trimmed);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="dialog-backdrop centered" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-label={title} className="modal-dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <form className="modal-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Watchlist name
            <input
              autoFocus
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              placeholder="Watchlist name"
              required
              type="text"
              value={name}
            />
          </label>
          {error === null ? null : <p className="form-message" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="secondary-button" disabled={pending} onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={pending} type="submit">{pending ? 'Saving…' : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmModal({
  confirmLabel = 'Confirm',
  danger = false,
  message,
  onClose,
  onConfirm,
  title,
}: {
  confirmLabel?: string;
  danger?: boolean;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleConfirm(): Promise<void> {
    try {
      setPending(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="dialog-backdrop centered" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div aria-label={title} className="modal-dialog" role="dialog" aria-modal="true">
        <div className="dialog-header">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <div className="modal-body">
          <p className="muted">{message}</p>
          {error === null ? null : <p className="form-message" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="secondary-button" disabled={pending} onClick={onClose} type="button">Cancel</button>
            <button
              className={`primary-button ${danger ? 'danger-button-primary' : ''}`}
              disabled={pending}
              onClick={() => void handleConfirm()}
              type="button"
            >
              {pending ? 'Processing…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPanel({ onClose, onUpdated, settings }: {
  onClose: () => void;
  onUpdated: () => void;
  settings: Settings | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configuredProviders = settings?.configuredProviders ?? [];

  async function saveProvider(event: FormEvent<HTMLFormElement>, providerId: 'finnhub' | 'logo-dev' | 'twelve-data'): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const apiKey = String(form.get('apiKey') ?? '');

    try {
      setPending(true);
      setMessage(null);
      await api(`/api/settings/providers/${providerId}`, {
        body: JSON.stringify({ apiKey }),
        method: 'PUT',
      });
      formElement.reset();
      onUpdated();
      setMessage(`${providerId === 'twelve-data' ? 'Twelve Data' : providerId === 'logo-dev' ? 'Logo.dev' : 'Finnhub'} key saved.`);
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  async function updateTheme(theme: Settings['theme']): Promise<void> {
    try {
      await api<void>('/api/settings/theme', {
        body: JSON.stringify({ theme }),
        method: 'PUT',
      });
      onUpdated();
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    }
  }

  async function updateDateFormat(dateFormat: Settings['dateFormat']): Promise<void> {
    try {
      setPending(true);
      setMessage(null);
      await api<void>('/api/settings/date-format', {
        body: JSON.stringify({ dateFormat }),
        method: 'PUT',
      });
      onUpdated();
      setMessage('Date format saved.');
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  async function updateQuoteRefreshIntervalSeconds(seconds: number): Promise<void> {
    try {
      setPending(true);
      setMessage(null);
      await api<void>('/api/settings/quote-refresh-interval', {
        body: JSON.stringify({ seconds }),
        method: 'PUT',
      });
      onUpdated();
      setMessage('Quote refresh interval saved.');
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  async function downloadBackup(): Promise<void> {
    try {
      setMessage(null);
      const backup = await api<BackupDocument>('/api/backup');
      const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = `open-finance-classic-${backup.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Backup downloaded. Store it securely.');
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    }
  }

  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  function handleRestoreFileSelect(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file !== undefined) {
      setRestoreFile(file);
    }
    event.target.value = '';
  }

  async function performRestore(file: File): Promise<void> {
    try {
      setPending(true);
      setMessage(null);
      const backup = JSON.parse(await file.text()) as unknown;
      await api<void>('/api/backup/restore', {
        body: JSON.stringify(backup),
        method: 'POST',
      });
      await onUpdated();
      setMessage('Backup restored successfully.');
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <aside aria-label="Settings" className="settings-panel">
        <div className="dialog-header"><h2>Settings</h2><button className="icon-button" onClick={onClose} type="button">×</button></div>
        <section className="stack">
          <h3>Appearance</h3>
          <div className="theme-options">
            {(['light', 'dark', 'system'] as const).map((theme) => (
              <button className={settings?.theme === theme ? 'selected' : ''} key={theme} onClick={() => void updateTheme(theme)} type="button">{theme}</button>
            ))}
          </div>
        </section>
        <section className="stack">
          <h3>Quote refresh interval</h3>
          <p className="muted">Choose how often the dashboard requests fresh quotes. Longer intervals help stay within free API limits.</p>
          <label className="settings-select">Refresh every
            <select aria-label="Quote refresh interval" disabled={pending} onChange={(event) => void updateQuoteRefreshIntervalSeconds(Number(event.target.value))} value={settings?.quoteRefreshIntervalSeconds ?? 120}>
              <option value={60}>60 seconds</option>
              <option value={120}>120 seconds</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
            </select>
          </label>
        </section>
        <section className="stack">
          <h3>Date format</h3>
          <label className="settings-select">Display dates as
            <select aria-label="Date format" disabled={pending} onChange={(event) => void updateDateFormat(event.target.value as Settings['dateFormat'])} value={settings?.dateFormat ?? 'dd/mm/yyyy'}>
              <option value="dd/mm/yyyy">DD/MM/YYYY</option>
              <option value="mm/dd/yyyy">MM/DD/YYYY</option>
            </select>
          </label>
        </section>
        <section className="stack">
          <h3>Twelve Data</h3>
          <p className="muted">Required for quotes, charts, company profiles, and earnings.</p>
          <p className="provider-status">{configuredProviders.includes('twelve-data') ? 'Connected' : 'Not connected'}</p>
          <form className="inline-form" onSubmit={(event) => void saveProvider(event, 'twelve-data')}>
            <input aria-label="Twelve Data API key" name="apiKey" placeholder="Paste API key" required type="password" />
            <button className="secondary-button" disabled={pending} type="submit">Save</button>
          </form>
        </section>
        <section className="stack">
          <h3>Finnhub</h3>
          <p className="muted">Optional. Enables market and company news.</p>
          <p className="provider-status">{configuredProviders.includes('finnhub') ? 'Connected' : 'Not connected'}</p>
          <form className="inline-form" onSubmit={(event) => void saveProvider(event, 'finnhub')}>
            <input aria-label="Finnhub API key" name="apiKey" placeholder="Paste API key" required type="password" />
            <button className="secondary-button" disabled={pending} type="submit">Save</button>
          </form>
        </section>
        <section className="stack">
          <h3>Logo.dev</h3>
          <p className="muted">Optional. Enables per-stock brand colors instead of a default color.</p>
          <p className="provider-status">{configuredProviders.includes('logo-dev') ? 'Connected' : 'Not connected'}</p>
          <form className="inline-form" onSubmit={(event) => void saveProvider(event, 'logo-dev')}>
            <input aria-label="Logo.dev API key" name="apiKey" placeholder="Paste secret API key" required type="password" />
            <button className="secondary-button" disabled={pending} type="submit">Save</button>
          </form>
        </section>
        <section className="stack">
          <h3>Backup and restore</h3>
          <p className="muted">Exports include provider API keys in plain text so you can move your complete account. Keep backup files private.</p>
          <button className="secondary-button" onClick={() => void downloadBackup()} type="button">Download backup</button>
          <label className="restore-input">
            Restore backup
            <input accept="application/json,.json" disabled={pending} onChange={handleRestoreFileSelect} type="file" />
          </label>
        </section>
        {message === null ? null : <p className="form-message" role="status">{message}</p>}
      </aside>
      {restoreFile !== null ? (
        <ConfirmModal
          confirmLabel="Restore"
          danger
          message="Restore this backup? It will replace all current watchlists, settings, and provider keys."
          onClose={() => setRestoreFile(null)}
          onConfirm={() => performRestore(restoreFile)}
          title="Restore backup"
        />
      ) : null}
    </div>
  );
}

function MarketGroupsPanel({ groups: initialGroups, onClose, onUpdated }: {
  groups: MarketGroup[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [groups, setGroups] = useState<MarketGroup[]>(() => structuredClone(initialGroups));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function updateGroup(groupIndex: number, patch: Partial<MarketGroup>): void {
    setGroups((current) => current.map((group, index) => index === groupIndex ? { ...group, ...patch } : group));
  }

  function updateInstrument(groupIndex: number, instrumentIndex: number, patch: Partial<InstrumentReference>): void {
    setGroups((current) => current.map((group, index) => {
      if (index !== groupIndex) {
        return group;
      }

      return {
        ...group,
        instruments: group.instruments.map((instrument, itemIndex) => itemIndex === instrumentIndex ? { ...instrument, ...patch } : instrument),
      };
    }));
  }

  function addGroup(): void {
    setGroups((current) => [...current, {
      id: `group-${Date.now()}`,
      instruments: [{ exchange: null, name: 'New instrument', symbol: 'SYMBOL', type: null }],
      name: 'New group',
    }]);
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    try {
      setPending(true);
      setMessage(null);
      await api<void>('/api/market-groups', {
        body: JSON.stringify({ groups }),
        method: 'PUT',
      });
      await onUpdated();
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <aside aria-label="Customize market overview" className="settings-panel market-groups-panel">
        <div className="dialog-header"><h2>Customize market overview</h2><button className="icon-button" onClick={onClose} type="button">×</button></div>
        <p className="muted">Choose the groups and quotes shown at the top of your dashboard. Add symbols supported by your market-data provider.</p>
        <form className="stack" onSubmit={(event) => void save(event)}>
          {groups.map((group, groupIndex) => (
            <section className="market-group-editor" key={group.id}>
              <div className="market-group-editor-heading">
                <label>Group name<input onChange={(event) => updateGroup(groupIndex, { name: event.target.value })} required value={group.name} /></label>
                <button disabled={groups.length === 1} className="text-button danger-button" onClick={() => setGroups((current) => current.filter((_, index) => index !== groupIndex))} type="button">Remove group</button>
              </div>
              <div className="market-instrument-list">
                {group.instruments.map((instrument, instrumentIndex) => (
                  <div className="market-instrument-editor" key={`${group.id}-${instrumentIndex}`}>
                    <label>Symbol<input onChange={(event) => updateInstrument(groupIndex, instrumentIndex, { symbol: event.target.value.toUpperCase() })} required value={instrument.symbol} /></label>
                    <label>Name<input onChange={(event) => updateInstrument(groupIndex, instrumentIndex, { name: event.target.value })} required value={instrument.name} /></label>
                    <label>Exchange <span className="muted">(optional)</span><input onChange={(event) => updateInstrument(groupIndex, instrumentIndex, { exchange: event.target.value || null })} value={instrument.exchange ?? ''} /></label>
                    <button aria-label={`Remove ${instrument.symbol}`} disabled={group.instruments.length === 1} className="icon-button" onClick={() => updateGroup(groupIndex, { instruments: group.instruments.filter((_, index) => index !== instrumentIndex) })} type="button">×</button>
                  </div>
                ))}
              </div>
              <button disabled={group.instruments.length === 12} className="text-button" onClick={() => updateGroup(groupIndex, { instruments: [...group.instruments, { exchange: null, name: 'New instrument', symbol: 'SYMBOL', type: null }] })} type="button">+ Add quote</button>
            </section>
          ))}
          <button disabled={groups.length === 6} className="secondary-button" onClick={addGroup} type="button">Add group</button>
          {message === null ? null : <p className="form-message" role="alert">{message}</p>}
          <button className="primary-button" disabled={pending} type="submit">{pending ? 'Saving…' : 'Save market overview'}</button>
        </form>
      </aside>
    </div>
  );
}

function InstrumentView({ dateFormat, instrument, onBack, onChanged, watchlists }: {
  dateFormat: Settings['dateFormat'];
  instrument: InstrumentReference;
  onBack: () => void;
  onChanged: () => Promise<void>;
  watchlists: Watchlist[];
}) {
  const [range, setRange] = useState('1D');
  const [data, setData] = useState<InstrumentData>(EMPTY_INSTRUMENT_DATA);
  const [error, setError] = useState<string | null>(null);
  const [watchlistId, setWatchlistId] = useState(watchlists[0]?.id ?? '');
  const [addedWatchlistIds, setAddedWatchlistIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAddedWatchlistIds(new Set());
  }, [instrument.exchange, instrument.symbol]);

  useEffect(() => {
    const details = chartRange(range);

    async function loadInstrument(): Promise<void> {
      try {
        const results = await Promise.allSettled([
          api<CachedResult<MarketQuote>>(`/api/market/quote?symbol=${encodeURIComponent(instrument.symbol)}`),
          api<CachedResult<ChartPoint[]>>(`/api/market/chart?symbol=${encodeURIComponent(instrument.symbol)}&interval=${details.interval}&outputsize=${details.outputsize}`),
          api<CachedResult<CompanySnapshot>>(`/api/market/company-profile?symbol=${encodeURIComponent(instrument.symbol)}`),
          api<CachedResult<EarningsRecord[]>>(`/api/market/earnings?symbol=${encodeURIComponent(instrument.symbol)}`),
          api<CachedResult<EarningsCalendarEntry[]>>(`/api/market/earnings-calendar?symbol=${encodeURIComponent(instrument.symbol)}&from=${daysAgo(31)}&to=${daysFromToday(90)}`),
          api<CachedResult<NewsArticle[]>>(`/api/market/company-news?symbol=${encodeURIComponent(instrument.symbol)}`),
          api<CachedResult<RecommendationTrend[]>>(`/api/market/recommendation-trends?symbol=${encodeURIComponent(instrument.symbol)}`),
        ]);
        setData({
          chart: resultValue(results[1]),
          companyProfile: resultValue(results[2]),
          earnings: resultValue(results[3]),
          news: resultValue(results[5]),
          quote: resultValue(results[0]),
          recommendationTrends: resultValue(results[6]),
          upcomingEarnings: resultValue(results[4]),
        });
        const rejectedResult = results.find((result) => result.status === 'rejected');
        setError(rejectedResult === undefined ? null : errorMessage(rejectedResult.reason));
      } catch (requestError) {
        setError(errorMessage(requestError));
      }
    }

    void loadInstrument();
  }, [instrument.symbol, range]);

  async function addToWatchlist(): Promise<void> {
    if (watchlistId.length === 0) {
      setError('Create a watchlist before adding an instrument.');
      return;
    }

    try {
      await api(`/api/watchlists/${watchlistId}/entries`, {
        body: JSON.stringify({
          exchange: instrument.exchange,
          name: data.quote?.data.name ?? instrument.name,
          symbol: instrument.symbol,
          type: instrument.type,
        }),
        method: 'POST',
      });
      setAddedWatchlistIds((current) => new Set(current).add(watchlistId));
      await onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  const quote = data.quote?.data;
  const companyProfile = data.companyProfile?.data;
  const positive = (quote?.percentChange ?? 0) >= 0;
  const selectedWatchlist = watchlists.find((watchlist) => watchlist.id === watchlistId);
  const isAdded = addedWatchlistIds.has(watchlistId) || selectedWatchlist?.entries.some((entry) => (
    entry.instrument.symbol === instrument.symbol && entry.instrument.exchange === instrument.exchange
  )) === true;

  return (
    <section className="instrument-page">
      <button className="back-button" onClick={onBack} type="button">← Back to overview</button>
      <div className="instrument-header">
        <div><p className="eyebrow">{instrument.symbol} · {quote?.exchange ?? instrument.exchange ?? 'Market'}</p><h1>{quote?.name ?? instrument.name}</h1></div>
        <div className="watchlist-add"><select aria-label="Add to watchlist" onChange={(event) => setWatchlistId(event.target.value)} value={watchlistId}>{watchlists.map((watchlist) => <option key={watchlist.id} value={watchlist.id}>{watchlist.name}</option>)}</select>{isAdded ? <button aria-label="Already added to selected watchlist" className="secondary-button added-button" disabled type="button">✓ Added</button> : <button className="secondary-button" onClick={() => void addToWatchlist()} type="button">+ Add</button>}</div>
      </div>
      {error === null ? null : <p className="page-error">{error}</p>}
      <div className="instrument-grid">
        <section className="quote-chart-panel">
          <div className="quote-summary"><strong>{formatCurrency(quote?.lastPrice ?? null, quote?.currency ?? 'USD')}</strong><span className={positive ? 'positive' : 'negative'}>{formatPercent(quote?.percentChange ?? null)} · {formatCurrency(quote?.change ?? null, quote?.currency ?? 'USD')} today</span><small>{quote?.isMarketOpen ? 'Market open' : 'Latest available price'}</small></div>
          <div className="range-controls">{Object.keys(RANGE_OPTIONS).map((item) => <button className={range === item ? 'selected' : ''} key={item} onClick={() => setRange(item)} type="button">{item}</button>)}</div>
          <LineChart currency={quote?.currency ?? 'USD'} positive={positive} previousClose={quote?.previousClose ?? null} points={data.chart?.data ?? []} range={range} />
        </section>
        <aside className="card quote-facts">
          <h2>Quote details</h2>
          <Fact label="Previous close" value={formatCurrency(quote?.previousClose ?? null, quote?.currency ?? 'USD')} />
          <Fact label="Day range" value={`${formatCurrency(quote?.dayLow ?? null, quote?.currency ?? 'USD')} – ${formatCurrency(quote?.dayHigh ?? null, quote?.currency ?? 'USD')}`} />
          <Fact label="52-week range" value={`${formatCurrency(quote?.week52Low ?? null, quote?.currency ?? 'USD')} – ${formatCurrency(quote?.week52High ?? null, quote?.currency ?? 'USD')}`} />
          <Fact label="Market cap" value={formatCompactNumber(companyProfile?.marketCapitalization ?? quote?.marketCapitalization ?? null)} />
          <Fact label="Volume" value={formatCompactNumber(quote?.volume ?? null)} />
          <Fact label="Exchange" value={quote?.exchange ?? '—'} />
          <Fact label="Website" value={companyProfile?.website === null || companyProfile?.website === undefined ? '—' : <a href={companyProfile.website} rel="noreferrer" target="_blank">{companyProfile.website}</a>} />
        </aside>
      </div>
      <div className="details-grid">
        <section className="card"><h2>In the news</h2><NewsList news={data.news?.data ?? []} /></section>
        <div className="details-side">
          <section className="card"><h2>Earnings</h2><UpcomingEarnings dateFormat={dateFormat} earnings={data.upcomingEarnings?.data ?? []} /><EarningsHistory calendar={data.upcomingEarnings?.data ?? []} dateFormat={dateFormat} earnings={data.earnings?.data ?? []} /></section>
          <section className="card recommendation-section"><h2>Analyst recommendations</h2><RecommendationTrendChart trends={data.recommendationTrends?.data ?? []} /></section>
        </div>
      </div>
    </section>
  );
}

const DEFAULT_RANGE = { interval: '5min', outputsize: 90 };

const RANGE_OPTIONS: Record<string, { interval: string; outputsize: number }> = {
  '1D': DEFAULT_RANGE,
  '5D': { interval: '30min', outputsize: 120 },
  '1M': { interval: '1h', outputsize: 180 },
  '6M': { interval: '1day', outputsize: 180 },
  '1Y': { interval: '1day', outputsize: 365 },
  '5Y': { interval: '1week', outputsize: 260 },
};

function chartRange(range: string): { interval: string; outputsize: number } {
  return RANGE_OPTIONS[range] ?? DEFAULT_RANGE;
}

function UpcomingEarnings({ dateFormat, earnings }: { dateFormat: Settings['dateFormat']; earnings: EarningsCalendarEntry[] }) {
  const nextRelease = earnings.filter((entry) => entry.releaseDate >= today()).sort((left, right) => left.releaseDate.localeCompare(right.releaseDate))[0];

  if (nextRelease === undefined) {
    return null;
  }

  return <div className="upcoming-earnings"><small>Upcoming release</small><strong>{formatReleaseDate(nextRelease.releaseDate, dateFormat)}{nextRelease.releaseTime === null ? '' : ` · ${nextRelease.releaseTime}`}</strong></div>;
}

function EarningsHistory({ calendar, dateFormat, earnings }: { calendar: EarningsCalendarEntry[]; dateFormat: Settings['dateFormat']; earnings: EarningsRecord[] }) {
  if (earnings.length === 0) {
    return <p className="muted">No earnings history available.</p>;
  }

  const calendarByPeriod = new Map(calendar.flatMap((entry) => {
    const key = fiscalPeriodKey(entry.year, entry.quarter);

    return key === null ? [] : [[key, entry] as const];
  }));

  return <div className="earnings-history">{earnings.slice(0, 5).map((entry) => {
    const key = fiscalPeriodKey(entry.year, entry.quarter);
    const calendarEntry = key === null ? undefined : calendarByPeriod.get(key);
    const date = calendarEntry?.releaseDate ?? entry.releaseDate;
    const dateLabel = calendarEntry === undefined ? 'Period ended' : 'Released';

    return <div className="earnings-history-item" key={entry.releaseDate}><span><small>{dateLabel}</small>{formatReleaseDate(date, dateFormat)}</span><EarningsMetric actual={entry.actualEarningsPerShare} estimate={entry.estimatedEarningsPerShare} label="EPS / Est." formatter={formatEarningsPerShare} /><EarningsMetric actual={calendarEntry?.actualRevenue ?? entry.actualRevenue} estimate={calendarEntry?.estimatedRevenue ?? entry.estimatedRevenue} label="Revenue / Est." formatter={formatRevenue} /></div>;
  })}</div>;
}

function fiscalPeriodKey(year: number | null | undefined, quarter: number | null | undefined): string | null {
  if (!isFiniteNumber(year) || !isFiniteNumber(quarter)) {
    return null;
  }

  return `${year}-${quarter}`;
}

function EarningsMetric({ actual, estimate, formatter, label }: { actual: number | null | undefined; estimate: number | null | undefined; formatter: (value: number | null | undefined) => string; label: string }) {
  const surprise = earningsSurprise(actual, estimate);

  return <div className="earnings-metric"><small>{label}</small><strong>{formatter(actual)} / {formatter(estimate)}</strong>{surprise === null ? null : <span className={surprise.positive ? 'positive' : 'negative'}>{surprise.positive ? '↑' : '↓'} {surprise.text} {surprise.positive ? 'beat' : 'miss'}</span>}</div>;
}

function earningsSurprise(actual: number | null | undefined, estimate: number | null | undefined): { positive: boolean; text: string } | null {
  if (!isFiniteNumber(actual) || !isFiniteNumber(estimate) || estimate === 0) {
    return null;
  }

  const percent = ((actual - estimate) / Math.abs(estimate)) * 100;
  return { positive: percent >= 0, text: `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%` };
}

function formatEarningsPerShare(value: number | null | undefined): string {
  return !isFiniteNumber(value) ? '—' : `$${value.toFixed(2)}`;
}

function formatRevenue(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return '—';
  }

  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  return `${(value / 1_000_000).toFixed(2)}M`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatReleaseDate(value: string, format: Settings['dateFormat'], part?: 'day' | 'month'): string {
  const [year = '', month = '', day = ''] = value.split('-');

  if (part === 'day') {
    return format === 'dd/mm/yyyy' ? day : month;
  }

  if (part === 'month') {
    return format === 'dd/mm/yyyy' ? month : day;
  }

  return format === 'dd/mm/yyyy' ? `${day}/${month}/${year}` : `${month}/${day}/${year}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const RECOMMENDATION_SEGMENTS = [
  { key: 'strongBuy', label: 'Strong buy' },
  { key: 'buy', label: 'Buy' },
  { key: 'hold', label: 'Hold' },
  { key: 'sell', label: 'Sell' },
  { key: 'strongSell', label: 'Strong sell' },
] as const;

function RecommendationTrendChart({ trends }: { trends: RecommendationTrend[] }) {
  const visibleTrends = trends.slice(-4).reverse();

  if (visibleTrends.length === 0) {
    return <p className="muted">No analyst recommendation data available.</p>;
  }

  const current = visibleTrends[0]!;
  const total = recommendationTotal(current);
  const historicalMaximum = Math.max(...visibleTrends.flatMap((trend) => RECOMMENDATION_SEGMENTS.map(({ key }) => trend[key])), 1);

  return (
    <div className="recommendation-chart">
      <div className="recommendation-current">
        <RecommendationDonut total={total} trend={current} />
        <div className="recommendation-breakdown">
          {RECOMMENDATION_SEGMENTS.map(({ key, label }) => <div key={key}><span><i className={`recommendation-dot recommendation-${key}`} />{label}</span><strong>{current[key]}</strong></div>)}
        </div>
      </div>
      <div className="recommendation-history">
        <h3>Historical breakdown</h3>
        <div className="recommendation-history-table" role="table">
          <div className="recommendation-history-header" role="row"><span role="columnheader" />{visibleTrends.map((trend, index) => <strong key={trend.period} role="columnheader" title={formatRecommendationPeriod(trend.period)}>{index === 0 ? 'Current' : `${index} month${index === 1 ? '' : 's'} ago`}</strong>)}</div>
          {RECOMMENDATION_SEGMENTS.map(({ key, label }) => {
            return <div className="recommendation-history-row" key={key} role="row"><span role="rowheader">{label}</span>{visibleTrends.map((trend) => <div className="recommendation-history-cell" key={trend.period} role="cell"><span aria-label={`${formatRecommendationPeriod(trend.period)}: ${label}, ${trend[key]} analyst rating${trend[key] === 1 ? '' : 's'}`} className={`recommendation-history-bar recommendation-${key}${trend[key] === 0 ? ' recommendation-history-zero' : ''}`} style={trend[key] === 0 ? undefined : { width: `${(trend[key] / historicalMaximum) * 100}%` }} title={`${formatRecommendationPeriod(trend.period)} — ${label}: ${trend[key]}`}>{trend[key]}</span></div>)}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

function RecommendationDonut({ total, trend }: { total: number; trend: RecommendationTrend }) {
  const circumference = 2 * Math.PI * 47;
  let offset = 0;

  return <div className="recommendation-donut" aria-label={`${total} analyst ratings for ${formatRecommendationPeriod(trend.period)}`} role="img">
    <svg aria-hidden="true" viewBox="0 0 120 120">
      <circle className="recommendation-donut-track" cx="60" cy="60" fill="none" r="47" />
      {RECOMMENDATION_SEGMENTS.map(({ key }) => {
        const length = total === 0 ? 0 : (trend[key] / total) * circumference;
        const segment = <circle className={`recommendation-donut-segment recommendation-${key}`} cx="60" cy="60" fill="none" key={key} r="47" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />;
        offset += length;
        return segment;
      })}
    </svg>
    <span><strong>{total}</strong><small>Ratings</small></span>
  </div>;
}

function recommendationTotal(trend: RecommendationTrend): number {
  return trend.buy + trend.hold + trend.sell + trend.strongBuy + trend.strongSell;
}

function formatRecommendationPeriod(period: string): string {
  const date = new Date(`${period}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return period;
  }

  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return <div className="fact"><span>{label}</span><strong>{value}</strong></div>;
}

function LineChart({
  currency,
  points,
  positive,
  previousClose,
  range,
}: {
  currency: string;
  points: ChartPoint[];
  positive: boolean;
  previousClose: number | null;
  range: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const PADDING = { top: 12, right: 8, bottom: 32, left: 62 };
  const VIEW_W = 800;
  const VIEW_H = 300;
  const plotW = VIEW_W - PADDING.left - PADDING.right;
  const plotH = VIEW_H - PADDING.top - PADDING.bottom;

  // Hover handlers — must be declared before any early returns (Rules of Hooks)
  const handleMouseMove = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const mouseX = (event.clientX - rect.left) * scaleX;
    const plotX = mouseX - PADDING.left;
    const fraction = Math.max(0, Math.min(1, plotX / plotW));
    const index = Math.round(fraction * (points.length - 1));
    setHoverIndex(index);
  }, [points.length, plotW]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
  }, []);

  if (points.length < 2) {
    return <div className="chart-empty">Chart data is unavailable for this range.</div>;
  }

  const values = points.map((p) => p.close);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const valuePad = (rawMax - rawMin) * 0.08 || rawMax * 0.02 || 1;
  const minimum = rawMin - valuePad;
  const maximum = rawMax + valuePad;
  const difference = maximum - minimum;

  function toX(index: number): number {
    return PADDING.left + (index / (values.length - 1)) * plotW;
  }

  function toY(value: number): number {
    return PADDING.top + plotH - ((value - minimum) / difference) * plotH;
  }

  // Build SVG path strings
  const linePath = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(2)},${toY(v).toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${toX(values.length - 1).toFixed(2)},${(PADDING.top + plotH).toFixed(2)} L${PADDING.left.toFixed(2)},${(PADDING.top + plotH).toFixed(2)} Z`;

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => minimum + (i / 4) * difference);

  // X-axis labels — pick ~6 evenly spaced points
  const xTickCount = Math.min(6, points.length);
  const xTicks = Array.from({ length: xTickCount }, (_, i) => {
    const index = Math.round(i * (points.length - 1) / (xTickCount - 1));
    return { index, timestamp: points[index]?.timestamp ?? '' };
  });

  // Format x-axis label based on selected range
  function formatXLabel(timestamp: string): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (range === '1D') {
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    if (range === '5D' || range === '1M') {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  // Previous close reference line
  const prevCloseY = previousClose !== null ? toY(previousClose) : null;

  // Hover point data
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? toX(hoverIndex) : null;
  const hoverY = hoverIndex !== null ? toY(values[hoverIndex]!) : null;

  const tooltipWidth = 130;
  const tooltipLeft = hoverX !== null && hoverX + tooltipWidth + 8 > VIEW_W - PADDING.right
    ? (hoverX ?? 0) - tooltipWidth - 8
    : (hoverX ?? 0) + 8;

  const colorClass = positive ? 'chart-positive' : 'chart-negative';
  const strokeColor = positive ? '#1a7f3c' : '#c5221f';
  const gradientId = positive ? 'grad-positive' : 'grad-negative';
  const gradientColor = positive ? '#188038' : '#c5221f';

  return (
    <div className="line-chart-container">
      <svg
        aria-label="Interactive price chart"
        className="line-chart"
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        preserveAspectRatio="none"
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        <defs>
          <linearGradient gradientUnits="userSpaceOnUse" id={gradientId} x1="0" x2="0" y1={PADDING.top} y2={PADDING.top + plotH}>
            <stop offset="0%" stopColor={gradientColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={gradientColor} stopOpacity="0.01" />
          </linearGradient>
          <clipPath id="chart-clip">
            <rect height={plotH} width={plotW} x={PADDING.left} y={PADDING.top} />
          </clipPath>
        </defs>

        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line className="chart-grid" x1={PADDING.left} x2={VIEW_W - PADDING.right} y1={y} y2={y} />
              <text className="chart-axis-label" textAnchor="end" x={PADDING.left - 8} y={y + 4}>
                {tick.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </text>
            </g>
          );
        })}

        {/* X-axis time labels */}
        {xTicks.map(({ index, timestamp }) => (
          <text className="chart-axis-label" key={index} textAnchor="middle" x={toX(index)} y={VIEW_H - 8}>
            {formatXLabel(timestamp)}
          </text>
        ))}

        {/* Previous close dashed reference line */}
        {prevCloseY !== null && prevCloseY >= PADDING.top && prevCloseY <= PADDING.top + plotH && (
          <>
            <line className="chart-prev-close" x1={PADDING.left} x2={VIEW_W - PADDING.right} y1={prevCloseY} y2={prevCloseY} />
            <text className="chart-prev-close-label" textAnchor="end" x={VIEW_W - PADDING.right} y={prevCloseY - 5}>
              Prev close
            </text>
          </>
        )}

        {/* Gradient area fill */}
        <path clipPath="url(#chart-clip)" d={areaPath} fill={`url(#${gradientId})`} stroke="none" />

        {/* Main price line */}
        <path className={colorClass} clipPath="url(#chart-clip)" d={linePath} fill="none" vectorEffect="non-scaling-stroke" />

        {/* Hover overlay */}
        {hoverX !== null && hoverY !== null && (
          <>
            {/* Vertical crosshair */}
            <line className="chart-crosshair" x1={hoverX} x2={hoverX} y1={PADDING.top} y2={PADDING.top + plotH} />

            {/* Dot on the line */}
            <circle cx={hoverX} cy={hoverY} fill={strokeColor} r="5" stroke="var(--surface, #fff)" strokeWidth="2" />

            {/* Tooltip */}
            <g>
              <rect
                fill="var(--surface, #fff)"
                height="46"
                rx="6"
                stroke="var(--border, #dde2df)"
                strokeWidth="1"
                width={tooltipWidth}
                x={tooltipLeft}
                y={PADDING.top + 8}
              />
              <text className="chart-tooltip-price" textAnchor="middle" x={tooltipLeft + tooltipWidth / 2} y={PADDING.top + 28}>
                {hoverPoint ? new Intl.NumberFormat(undefined, { currency, maximumFractionDigits: 2, minimumFractionDigits: 2, style: 'currency' }).format(hoverPoint.close) : ''}
              </text>
              <text className="chart-tooltip-time" textAnchor="middle" x={tooltipLeft + tooltipWidth / 2} y={PADDING.top + 44}>
                {hoverPoint ? formatXLabel(hoverPoint.timestamp) : ''}
              </text>
            </g>
          </>
        )}
      </svg>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return <main className="loading-screen"><span className="loading-dot" /><p>{message}</p></main>;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function resultValue<T>(result: PromiseSettledResult<T> | undefined): T | null {
  if (result?.status === 'fulfilled') {
    return result.value;
  }

  return null;
}
