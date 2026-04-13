import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, TrendingUp, TrendingDown, Star, BarChart2, Activity, RefreshCw } from 'lucide-react';
import cryptoService from '../../services/cryptoService';

const QUOTE_TABS = [
  { id: 'all',  label: 'All' },
  { id: 'ngn',  label: 'NGN' },
  { id: 'usdt', label: 'USDT' },
  { id: 'btc',  label: 'BTC' },
  { id: 'usdc', label: 'USDC' },
  { id: 'eth',  label: 'ETH' },
];

const COIN_COLORS = [
  'from-yellow-400 to-orange-500',
  'from-blue-500 to-indigo-600',
  'from-emerald-400 to-teal-600',
  'from-purple-500 to-pink-600',
  'from-cyan-400 to-blue-500',
  'from-rose-400 to-red-600',
  'from-amber-400 to-yellow-600',
  'from-violet-500 to-purple-700',
];

const CoinBadge = ({ symbol }) => {
  const idx = (symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % COIN_COLORS.length;
  return (
    <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${COIN_COLORS[idx]} flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-sm`}>
      {symbol.slice(0, 3)}
    </div>
  );
};

const Markets = () => {
  const navigate = useNavigate();
  const [markets, setMarkets] = useState([]);
  const [tickers, setTickers] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [quoteFilter, setQuoteFilter] = useState('all');
  const [sortBy, setSortBy] = useState('volume');
  const [sortDir, setSortDir] = useState('desc');
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jaxo_favorite_pairs') || '[]'); } catch { return []; }
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [marketsRes, tickersRes] = await Promise.allSettled([
      cryptoService.getMarkets(),
      cryptoService.get24hTickers(),
    ]);

    if (marketsRes.status === 'fulfilled' && marketsRes.value.success) {
      const raw = marketsRes.value.data?.data || marketsRes.value.data;
      const arr = Array.isArray(raw) ? raw : Object.values(raw || {});
      setMarkets(arr);
    }

    if (tickersRes.status === 'fulfilled' && tickersRes.value.success) {
      const raw = tickersRes.value.data?.data || tickersRes.value.data;
      const map = {};
      Object.entries(raw || {}).forEach(([id, v]) => {
        map[id.toLowerCase()] = v?.ticker || v;
      });
      setTickers(map);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleFavorite = (e, pairId) => {
    e.stopPropagation();
    const next = favorites.includes(pairId)
      ? favorites.filter(f => f !== pairId)
      : [...favorites, pairId];
    setFavorites(next);
    localStorage.setItem('jaxo_favorite_pairs', JSON.stringify(next));
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const rows = markets.map(m => {
    const id = (m.id || m.market || '').toLowerCase();
    const name = (m.name || m.id || '').toUpperCase();
    const t = tickers[id] || {};
    const last = parseFloat(t.last || t.sell || 0);
    const change = parseFloat(t.change || t.price_change_percent || 0);
    const high = parseFloat(t.high || 0);
    const low = parseFloat(t.low || 0);
    const vol = parseFloat(t.vol || t.volume || 0);

    let base = '', quote = '';
    if (name.includes('/')) {
      [base, quote] = name.split('/');
    } else {
      const knownQuotes = ['USDT', 'USDC', 'NGN', 'GHS', 'KES', 'BTC', 'ETH', 'BNB'];
      const q = knownQuotes.find(q => name.endsWith(q));
      quote = q || name.slice(-3);
      base = q ? name.slice(0, -q.length) : name.slice(0, -3);
    }

    return { id, name, base, quote, last, change, high, low, vol };
  });

  const filtered = rows.filter(r => {
    if (showFavoritesOnly && !favorites.includes(r.id)) return false;
    if (quoteFilter !== 'all' && r.quote.toLowerCase() !== quoteFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.base.toLowerCase().includes(q) || r.quote.toLowerCase().includes(q) || r.id.includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let av, bv;
    if (sortBy === 'name') { av = a.base; bv = b.base; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (sortBy === 'change') { av = a.change; bv = b.change; }
    else if (sortBy === 'price') { av = a.last; bv = b.last; }
    else { av = a.vol; bv = b.vol; }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const SortArrow = ({ col }) => {
    if (sortBy !== col) return <span className="ml-1 opacity-30 text-[10px]">⇅</span>;
    return <span className="ml-1 text-primary text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const formatPrice = (price, quote) => {
    if (!price) return '—';
    if (['NGN', 'GHS', 'KES', 'ZAR'].includes(quote))
      return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (price < 0.001) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    if (price < 1000) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatVol = (v) => {
    if (!v) return '—';
    if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
    return v.toFixed(2);
  };

  // Skeleton row
  const SkeletonRow = () => (
    <tr className="border-b border-border animate-pulse">
      <td className="px-4 py-3.5"><div className="w-4 h-4 bg-muted rounded" /></td>
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-20 bg-muted rounded" />
            <div className="h-2.5 w-14 bg-muted rounded" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5"><div className="h-3.5 w-24 bg-muted rounded ml-auto" /></td>
      <td className="px-4 py-3.5"><div className="h-5 w-16 bg-muted rounded-full ml-auto" /></td>
      <td className="px-4 py-3.5 hidden md:table-cell"><div className="h-3.5 w-18 bg-muted rounded ml-auto" /></td>
      <td className="px-4 py-3.5 hidden md:table-cell"><div className="h-3.5 w-18 bg-muted rounded ml-auto" /></td>
      <td className="px-4 py-3.5 hidden lg:table-cell"><div className="h-3.5 w-16 bg-muted rounded ml-auto" /></td>
      <td className="px-4 py-3.5"><div className="h-7 w-16 bg-muted rounded-lg ml-auto" /></td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-card">
      {/* Page header */}
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-center justify-between gap-4 flex-wrap bg-card">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg border border-primary/20">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Markets</h1>
            <p className="text-xs text-muted-foreground">{sorted.length} trading pairs · live data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            title="Refresh"
            className={`p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-primary transition-colors ${refreshing ? 'animate-spin' : ''}`}
          >
            <RefreshCw size={15} />
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search pair…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-muted border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary w-52 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-border overflow-x-auto no-scrollbar bg-card">
        <button
          onClick={() => setShowFavoritesOnly(f => !f)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
            showFavoritesOnly
              ? 'bg-warning/10 border-yellow-300/40 text-yellow-700'
              : 'bg-muted border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Star size={12} className={showFavoritesOnly ? 'fill-yellow-500' : ''} />
          Favorites
        </button>
        <div className="h-4 w-px bg-muted shrink-0" />
        {QUOTE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setQuoteFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
              quoteFilter === tab.id
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="text-left px-4 py-3 w-10" />
              <th
                className="text-left px-3 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('name')}
              >
                Pair <SortArrow col="name" />
              </th>
              <th
                className="text-right px-4 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('price')}
              >
                Price <SortArrow col="price" />
              </th>
              <th
                className="text-right px-4 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('change')}
              >
                24h Change <SortArrow col="change" />
              </th>
              <th className="text-right px-4 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider hidden md:table-cell">
                24h High
              </th>
              <th className="text-right px-4 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider hidden md:table-cell">
                24h Low
              </th>
              <th
                className="text-right px-4 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider hidden lg:table-cell cursor-pointer hover:text-foreground transition-colors"
                onClick={() => handleSort('volume')}
              >
                Volume <SortArrow col="volume" />
              </th>
              <th className="text-right px-4 py-3 text-[11px] text-muted-foreground font-bold uppercase tracking-wider w-28">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
              : sorted.length === 0
              ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <Activity className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No markets found</p>
                  </td>
                </tr>
              )
              : sorted.map(row => (
                <tr
                  key={row.id}
                  className="border-b border-border hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => navigate(`/dashboard/trade/${row.id}`)}
                >
                  {/* Favorite star */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={e => toggleFavorite(e, row.id)}
                      className="text-muted-foreground hover:text-warning transition-colors"
                    >
                      <Star
                        size={14}
                        className={favorites.includes(row.id) ? 'fill-yellow-400 text-yellow-400' : ''}
                      />
                    </button>
                  </td>

                  {/* Pair name */}
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-3">
                      <CoinBadge symbol={row.base} />
                      <div>
                        <span className="text-sm font-bold text-foreground">{row.base}</span>
                        <span className="text-sm text-muted-foreground">/{row.quote}</span>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{row.id}</p>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatPrice(row.last, row.quote)}
                    </span>
                  </td>

                  {/* 24h Change */}
                  <td className="px-4 py-3.5 text-right">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      row.change >= 0
                        ? 'bg-success/10 text-success'
                        : 'bg-danger/10 text-danger'
                    }`}>
                      {row.change >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {row.change >= 0 ? '+' : ''}{row.change.toFixed(2)}%
                    </span>
                  </td>

                  {/* 24h High */}
                  <td className="px-4 py-3.5 text-right hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                    {formatPrice(row.high, row.quote)}
                  </td>

                  {/* 24h Low */}
                  <td className="px-4 py-3.5 text-right hidden md:table-cell text-sm tabular-nums text-muted-foreground">
                    {formatPrice(row.low, row.quote)}
                  </td>

                  {/* Volume */}
                  <td className="px-4 py-3.5 text-right hidden lg:table-cell text-sm tabular-nums text-muted-foreground">
                    {formatVol(row.vol)}
                  </td>

                  {/* Trade button — always visible */}
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/dashboard/trade/${row.id}`); }}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      Trade
                    </button>
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Markets;
