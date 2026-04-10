import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, Clock,
  AlertCircle, CheckCircle2, X, Star, Search
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import TradingViewChart from './TradingViewChart';
import OrderBook from './OrderBook';
import TradeHistory from './TradeHistory';
import TradingForm from './TradingForm';
import CryptoDepositWithdraw from './CryptoDepositWithdraw';

// ── Helpers ─────────────────────────────────────────────────────────────────
const QUOTE_TABS = ['Favorites', 'NGN', 'USDT', 'GHS', 'CNGN'];
const KNOWN_QUOTES = ['USDT', 'USDC', 'NGN', 'GHS', 'KES', 'BTC', 'ETH', 'BNB', 'CNGN'];

const splitPair = (id) => {
  const s = (id || '').toUpperCase();
  const q = KNOWN_QUOTES.find(q => s.endsWith(q) && s.length > q.length);
  return q ? { base: s.slice(0, -q.length), quote: q } : { base: s.slice(0, -3), quote: s.slice(-3) };
};

const fmt = (n, dec = 2) => {
  const v = parseFloat(n);
  if (!v && v !== 0) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const fmtPrice = (p, quote) => {
  const v = parseFloat(p);
  if (!v) return '—';
  if (['NGN', 'GHS', 'KES'].includes(quote)) return fmt(v, v < 10 ? 4 : 2);
  if (v < 0.001) return v.toFixed(8);
  if (v < 1) return v.toFixed(6);
  if (v < 1000) return v.toFixed(4);
  return fmt(v, 2);
};

// ── Main Component ──────────────────────────────────────────────────────────
const TradeDashboard = ({ wallets = [], initialMarket = 'usdtngn' }) => {
  const navigate = useNavigate();
  const [market, setMarket] = useState(initialMarket);
  const [ticker, setTicker] = useState(null);
  const [allTickers, setAllTickers] = useState({});
  const [orderBook, setOrderBook] = useState({ asks: [], bids: [] });
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [availableMarkets, setAvailableMarkets] = useState([]);
  const [userOrders, setUserOrders] = useState([]);
  const [lastPriceDir, setLastPriceDir] = useState(null);

  // Market list sidebar state
  const [pairSearch, setPairSearch] = useState('');
  const [pairTab, setPairTab] = useState('NGN');
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jaxo_favorite_pairs') || '[]'); } catch { return []; }
  });

  // Bottom tabs
  const [bottomTab, setBottomTab] = useState('open_orders');
  // Right panel tabs
  const [rightTab, setRightTab] = useState('trade'); // trade | deposit_withdraw

  const { base: baseAsset, quote: quoteAsset } = splitPair(market);

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    cryptoService.getMarkets().then(res => {
      if (res.success) {
        const d = res.data?.data || res.data;
        setAvailableMarkets(Array.isArray(d) ? d : Object.values(d || {}));
      }
    });
  }, []);

  const fetchMarketData = useCallback(async () => {
    try {
      const [tickerRes, bookRes, tradeRes, ordersRes] = await Promise.allSettled([
        cryptoService.get24hTickers(),
        cryptoService.getOrderBook(market, 50),
        cryptoService.getMarketTrades(market, 50),
        cryptoService.getUserOrders({ market, status: 'wait' }),
      ]);

      if (tickerRes.status === 'fulfilled' && tickerRes.value.success) {
        const raw = tickerRes.value.data?.data || tickerRes.value.data;
        const mapped = {};
        Object.entries(raw || {}).forEach(([k, v]) => { mapped[k.toLowerCase()] = v; });
        setAllTickers(mapped);
        const mt = mapped[market.toLowerCase()];
        if (mt) {
          const t = mt.ticker || mt;
          if (ticker && t.last !== ticker.last) {
            setLastPriceDir(parseFloat(t.last) > parseFloat(ticker.last) ? 'up' : 'down');
          }
          setTicker(t);
        }
      }

      if (bookRes.status === 'fulfilled' && bookRes.value.success) {
        const d = bookRes.value.data?.data || bookRes.value.data;
        setOrderBook({ asks: d.asks || [], bids: d.bids || [] });
      }

      if (tradeRes.status === 'fulfilled' && tradeRes.value.success) {
        const d = tradeRes.value.data;
        setTrades(Array.isArray(d) ? d.slice(0, 50) : (d?.data || []));
      }

      if (ordersRes.status === 'fulfilled' && ordersRes.value.success) {
        const d = ordersRes.value.data?.data || ordersRes.value.data;
        setUserOrders(Array.isArray(d) ? d : []);
      }
    } catch {} finally { setLoading(false); }
  }, [market, ticker]);

  useEffect(() => {
    setLoading(true);
    fetchMarketData();
    const iv = setInterval(fetchMarketData, 4000);
    return () => clearInterval(iv);
  }, [market]);

  // ── Market sidebar logic ───────────────────────────────────────────────────
  const toggleFavorite = (e, id) => {
    e.stopPropagation();
    const next = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem('jaxo_favorite_pairs', JSON.stringify(next));
  };

  const marketRows = useMemo(() => {
    return availableMarkets.map(m => {
      const id = (m.id || '').toLowerCase();
      const { base, quote } = splitPair(id);
      const td = allTickers[id];
      const t = td?.ticker || td || {};
      const last = parseFloat(t.last || 0);
      const open = parseFloat(t.open || last);
      const change = open > 0 ? ((last - open) / open) * 100 : 0;
      return { id, base, quote, last, change };
    });
  }, [availableMarkets, allTickers]);

  const filteredPairs = useMemo(() => {
    let rows = marketRows;
    if (pairTab === 'Favorites') rows = rows.filter(r => favorites.includes(r.id));
    else rows = rows.filter(r => r.quote === pairTab);
    if (pairSearch) {
      const q = pairSearch.toLowerCase();
      rows = rows.filter(r => r.base.toLowerCase().includes(q) || r.id.includes(q));
    }
    return rows.sort((a, b) => b.last - a.last);
  }, [marketRows, pairTab, pairSearch, favorites]);

  const selectPair = (id) => {
    setMarket(id);
    navigate(`/dashboard/trade/${id}`, { replace: true });
  };

  // ── Order handlers ─────────────────────────────────────────────────────────
  const handleOrderSubmit = async (orderData) => {
    setTradeLoading(true); setError(null);
    try {
      const result = await cryptoService.createOrder(orderData);
      if (result.success) {
        setSuccess(`${orderData.side.toUpperCase()} order placed!`);
        fetchMarketData();
        setTimeout(() => setSuccess(null), 4000);
      } else setError(result.error || 'Order failed');
    } catch (e) { setError(e.message); }
    finally { setTradeLoading(false); }
  };

  const handleCancelOrder = async (orderId) => {
    try {
      const r = await cryptoService.cancelOrder(orderId);
      if (r.success) { setSuccess('Order cancelled'); fetchMarketData(); }
      else setError(r.error || 'Cancel failed');
    } catch (e) { setError(e.message); }
  };

  const balances = wallets.reduce((acc, w) => { acc[w.currency] = parseFloat(w.balance); return acc; }, {});

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col lg:h-[calc(100vh-100px)] min-h-[600px] lg:overflow-hidden overflow-y-auto bg-[#0b0e11]">
      {/* ── Top Stats Bar ────────────────────────────────────── */}
      <div className="bg-[#161a1f] border-b border-[#2b3139] px-3 py-2 flex items-center gap-4 overflow-x-auto no-scrollbar shrink-0">
        <span className="text-base font-bold text-white whitespace-nowrap">
          {baseAsset}/{quoteAsset}
        </span>
        <span className={`text-lg font-bold tabular-nums whitespace-nowrap ${
          lastPriceDir === 'up' ? 'text-[#0ecb81]' : lastPriceDir === 'down' ? 'text-[#f6465d]' : 'text-white'
        }`}>{fmtPrice(ticker?.last, quoteAsset)}</span>
        {ticker && (
          <>
            <div className="hidden sm:block text-[10px] text-[#848e9c] whitespace-nowrap">
              <span className="mr-1">Change</span>
              <span className={parseFloat(ticker.high) >= parseFloat(ticker.open || ticker.last) ? 'text-[#0ecb81]' : 'text-[#f6465d]'}>
                {(() => { const o = parseFloat(ticker.open || ticker.last); const l = parseFloat(ticker.last); return o ? ((l-o)/o*100).toFixed(2) : '0.00'; })()}%
              </span>
            </div>
            <div className="hidden md:block text-[10px] text-[#848e9c] whitespace-nowrap">High <span className="text-white">{fmtPrice(ticker.high, quoteAsset)}</span></div>
            <div className="hidden md:block text-[10px] text-[#848e9c] whitespace-nowrap">Low <span className="text-white">{fmtPrice(ticker.low, quoteAsset)}</span></div>
            <div className="hidden lg:block text-[10px] text-[#848e9c] whitespace-nowrap">24H Volume <span className="text-white">{fmt(ticker.vol, 2)}</span></div>
          </>
        )}
      </div>

      {/* ── Main Grid ────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Markets Sidebar (hidden on mobile) ────── */}
        <div className="hidden lg:flex flex-col w-56 xl:w-64 shrink-0 border-r border-[#2b3139] bg-[#161a1f]">
          {/* Search */}
          <div className="px-2 py-2 border-b border-[#2b3139]">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#848e9c]" />
              <input
                value={pairSearch}
                onChange={e => setPairSearch(e.target.value)}
                placeholder="Search"
                className="w-full bg-[#1e2329] border border-[#2b3139] rounded pl-7 pr-2 py-1.5 text-[11px] text-white placeholder-[#848e9c] focus:outline-none focus:border-[#f0b90b]"
              />
            </div>
          </div>
          {/* Quote tabs */}
          <div className="flex px-1 py-1 gap-0.5 border-b border-[#2b3139] overflow-x-auto no-scrollbar">
            {QUOTE_TABS.map(tab => (
              <button key={tab} onClick={() => setPairTab(tab)}
                className={`px-2 py-1 text-[10px] font-bold rounded whitespace-nowrap transition-colors ${
                  pairTab === tab ? 'bg-[#2b3139] text-[#f0b90b]' : 'text-[#848e9c] hover:text-white'
                }`}>
                {tab === 'Favorites' ? <Star size={11} className={favorites.length ? 'fill-[#f0b90b] text-[#f0b90b]' : ''} /> : tab}
              </button>
            ))}
          </div>
          {/* Header */}
          <div className="grid grid-cols-3 px-2 py-1 text-[9px] font-bold text-[#848e9c] uppercase border-b border-[#2b3139]">
            <span>Markets</span><span className="text-right">Last Price</span><span className="text-right">Change</span>
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filteredPairs.length === 0 && (
              <p className="text-[#848e9c] text-[10px] text-center py-6">No pairs found</p>
            )}
            {filteredPairs.map(r => (
              <button key={r.id} onClick={() => selectPair(r.id)}
                className={`w-full grid grid-cols-3 items-center px-2 py-1.5 text-[11px] hover:bg-[#1e2329] transition-colors ${
                  r.id === market ? 'bg-[#1e2329]' : ''
                }`}>
                <span className="text-left flex items-center gap-1">
                  <Star size={10} className={`cursor-pointer shrink-0 ${favorites.includes(r.id) ? 'fill-[#f0b90b] text-[#f0b90b]' : 'text-[#2b3139]'}`}
                    onClick={e => toggleFavorite(e, r.id)} />
                  <span className="text-white font-semibold">{r.base}</span>
                  <span className="text-[#848e9c]">/{r.quote}</span>
                </span>
                <span className="text-right text-white tabular-nums">{fmtPrice(r.last, r.quote)}</span>
                <span className={`text-right tabular-nums font-medium ${r.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>
                  {r.change >= 0 ? '+' : ''}{r.change.toFixed(2)}%
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Center + Right ─────────────────────────────── */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Center: Chart + Order Book + Trades */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Chart area */}
            <div className="flex-[3] min-h-[300px] sm:min-h-[350px] bg-[#161a1f] border-b border-[#2b3139] overflow-hidden">
              <TradingViewChart symbol={market.toUpperCase()} />
            </div>

            {/* Below chart: Order Book + Market Trades side by side on desktop */}
            <div className="flex-[2] flex overflow-hidden border-b border-[#2b3139]">
              {/* Order Book */}
              <div className="flex-1 border-r border-[#2b3139] overflow-hidden">
                <OrderBook asks={orderBook.asks} bids={orderBook.bids} loading={loading} />
              </div>
              {/* Market Trades */}
              <div className="flex-1 overflow-hidden hidden md:flex flex-col">
                <TradeHistory trades={trades} loading={loading} />
              </div>
            </div>

            {/* Bottom: Open orders / Order History / Trade History / Funds */}
            <div className="h-40 lg:h-48 shrink-0 bg-[#161a1f] flex flex-col overflow-hidden">
              <div className="flex items-center gap-4 px-3 py-1.5 border-b border-[#2b3139]">
                {[
                  { id: 'open_orders', label: `Open orders(${userOrders.length})` },
                  { id: 'order_history', label: 'Order history' },
                  { id: 'trade_history', label: 'Trade History' },
                  { id: 'funds', label: 'Funds' },
                ].map(t => (
                  <button key={t.id} onClick={() => setBottomTab(t.id)}
                    className={`text-[11px] font-medium pb-1 border-b-2 transition-colors ${
                      bottomTab === t.id ? 'text-white border-[#f0b90b]' : 'text-[#848e9c] border-transparent hover:text-white'
                    }`}>{t.label}</button>
                ))}
                <div className="ml-auto flex items-center gap-1">
                  <label className="text-[10px] text-[#848e9c] flex items-center gap-1">
                    <input type="checkbox" className="accent-[#f0b90b] w-3 h-3" /> Hide Other Pairs
                  </label>
                  <button className="text-[10px] text-[#f6465d] font-medium ml-2">Cancel</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto px-3 py-1">
                {bottomTab === 'open_orders' && (
                  userOrders.length > 0 ? (
                    <table className="w-full text-[11px]">
                      <thead className="text-[#848e9c]">
                        <tr><th className="text-left py-1 font-medium">Date</th><th className="text-left py-1">Pair</th><th className="py-1">Type</th><th className="py-1">Direction</th><th className="text-right py-1">Price</th><th className="text-right py-1">Amount</th><th className="text-right py-1">Filed</th><th className="text-right py-1">Total</th><th className="text-center py-1"></th></tr>
                      </thead>
                      <tbody>
                        {userOrders.map(o => (
                          <tr key={o.id} className="border-b border-[#2b3139]">
                            <td className="py-1 text-[#848e9c]">{new Date(o.created_at).toLocaleString()}</td>
                            <td className="py-1 text-white">{o.market?.toUpperCase()}</td>
                            <td className="py-1 text-[#848e9c]">{o.ord_type}</td>
                            <td className={`py-1 ${o.side === 'buy' ? 'text-[#0ecb81]' : 'text-[#f6465d]'}`}>{o.side}</td>
                            <td className="py-1 text-right text-white tabular-nums">{o.price}</td>
                            <td className="py-1 text-right text-white tabular-nums">{o.origin_volume}</td>
                            <td className="py-1 text-right text-[#848e9c]">{o.executed_volume}</td>
                            <td className="py-1 text-right text-white tabular-nums">{(parseFloat(o.price) * parseFloat(o.origin_volume)).toFixed(2)}</td>
                            <td className="py-1 text-center">
                              <button onClick={() => handleCancelOrder(o.id)} className="text-[#f6465d] hover:underline text-[10px]">Cancel</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-[#848e9c]">
                      <div className="w-12 h-12 mb-2 bg-[#1e2329] rounded-lg flex items-center justify-center">
                        <Clock size={20} className="text-[#2b3139]" />
                      </div>
                      <p className="text-[11px]">No Data</p>
                    </div>
                  )
                )}
                {bottomTab === 'funds' && (
                  <div className="grid grid-cols-3 gap-4 py-2">
                    {Object.entries(balances).filter(([,v]) => v > 0).map(([c, v]) => (
                      <div key={c} className="text-[11px]">
                        <span className="text-white font-medium">{c.toUpperCase()}</span>
                        <span className="text-[#848e9c] ml-2">{v.toFixed(8)}</span>
                      </div>
                    ))}
                    {Object.keys(balances).length === 0 && (
                      <p className="text-[#848e9c] text-[11px] col-span-3 text-center py-4">No funds available</p>
                    )}
                  </div>
                )}
                {(bottomTab === 'order_history' || bottomTab === 'trade_history') && (
                  <div className="h-full flex items-center justify-center text-[#848e9c] text-[11px]">
                    <div className="text-center">
                      <div className="w-12 h-12 mb-2 mx-auto bg-[#1e2329] rounded-lg flex items-center justify-center">
                        <Clock size={20} className="text-[#2b3139]" />
                      </div>
                      <p>No Data</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right: Spot Trade / Deposit & Withdraw ──── */}
          <div className="w-full lg:w-72 xl:w-80 shrink-0 border-l border-[#2b3139] bg-[#161a1f] overflow-y-auto flex flex-col">
            {/* Right panel tabs */}
            <div className="flex border-b border-[#2b3139] shrink-0">
              <button onClick={() => setRightTab('trade')}
                className={`flex-1 py-2 text-[10px] font-black uppercase transition-colors border-b-2 ${
                  rightTab === 'trade' ? 'text-[#f0b90b] border-[#f0b90b]' : 'text-[#848e9c] border-transparent hover:text-white'
                }`}>Spot Trade</button>
              <button onClick={() => setRightTab('deposit_withdraw')}
                className={`flex-1 py-2 text-[10px] font-black uppercase transition-colors border-b-2 ${
                  rightTab === 'deposit_withdraw' ? 'text-[#f0b90b] border-[#f0b90b]' : 'text-[#848e9c] border-transparent hover:text-white'
                }`}>Deposit / Withdraw</button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === 'trade' ? (
                <TradingForm
                  market={market}
                  base={baseAsset}
                  quote={quoteAsset}
                  balances={balances}
                  loading={tradeLoading}
                  onSubmit={handleOrderSubmit}
                />
              ) : (
                <CryptoDepositWithdraw coin={baseAsset} balances={balances} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Toast Notifications ──────────────────────────── */}
      {error && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-sm p-3 bg-[#f6465d] text-white rounded-lg shadow-xl flex items-center gap-2 animate-in slide-in-from-right">
          <AlertCircle size={16} />
          <span className="text-xs flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="fixed bottom-4 right-4 z-[100] max-w-sm p-3 bg-[#0ecb81] text-white rounded-lg shadow-xl flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span className="text-xs flex-1">{success}</span>
          <button onClick={() => setSuccess(null)}><X size={14} /></button>
        </div>
      )}
    </div>
  );
};

export default TradeDashboard;
