import { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Activity,
  RefreshCw,
  Zap,
  Eye,
  EyeOff,
  CreditCard,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import dashboardService from '../../services/dashboardService';
import cryptoService from '../../services/cryptoService';
import walletService from '../../services/walletService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const COIN_COLORS = [
  'from-yellow-400 to-orange-500',
  'from-blue-500 to-indigo-600',
  'from-emerald-400 to-teal-600',
  'from-purple-500 to-pink-600',
  'from-cyan-400 to-blue-500',
  'from-rose-400 to-red-600',
];

const FALLBACK_RATES = {
  // Fiat
  'USD': 1, 'NGN': 1650, 'GBP': 0.78, 'EUR': 0.92,
  'ZAR': 18.8, 'CAD': 1.35, 'GHS': 12.5, 'KES': 130,
  'CNY': 7.2, 'AUD': 1.5, 'JPY': 150,
  // Crypto (approximate USD rates as fallback)
  'BTC': 0.000015, 'ETH': 0.00028, 'USDT': 1, 'USDC': 1,
  'SOL': 0.006, 'BNB': 0.0015, 'XRP': 0.45, 'TRX': 4.5,
  'DOGE': 6, 'LTC': 0.011, 'ADA': 1.1, 'POL': 1.8,
  'DOT': 0.12, 'LINK': 0.055, 'CAKE': 0.25, 'XLM': 3.3,
  'SHIB': 55000, 'AAVE': 0.003, 'DASH': 0.028, 'BCH': 0.0022,
  'SLP': 130, 'FLOKI': 5500, 'PEPE': 85000, 'BONK': 40000,
  'ALGO': 3.5, 'WIF': 0.35, 'NOS': 0.3, 'NEAR': 0.16,
  'TON': 0.14, 'RNDR': 0.1, 'STRK': 1.5, 'SUI': 0.22,
  'XYO': 70, 'HYPE': 0.04, 'FARTCOIN': 0.7, 'ZK': 4,
  'LSK': 0.6, 'CFX': 4, 'S': 1.5, 'AXCNH': 1,
  'QDX': 30, 'CNGN': 1650,
};

const BalanceOneLine = ({ children, className = '' }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const MIN_PX = 9;
  const MAX_PX = 26;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      const available = container.clientWidth;
      if (available <= 0) return;
      text.style.whiteSpace = 'nowrap';
      let lo = MIN_PX;
      let hi = MAX_PX;
      let best = MIN_PX;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        text.style.fontSize = `${mid}px`;
        if (text.scrollWidth <= available) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      text.style.fontSize = `${best}px`;
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [children]);

  return (
    <div ref={containerRef} className={`min-w-0 w-full overflow-hidden ${className}`}>
      <h3
        ref={textRef}
        className="font-black text-foreground tabular-nums leading-tight"
        style={{ fontSize: `${MAX_PX}px`, whiteSpace: 'nowrap' }}
      >
        {children}
      </h3>
    </div>
  );
};

const CoinBadge = ({ symbol }) => {
  const idx = (symbol.charCodeAt(0) + (symbol.charCodeAt(1) || 0)) % COIN_COLORS.length;
  return (
    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${COIN_COLORS[idx]} flex items-center justify-center text-white text-[9px] font-black shrink-0`}>
      {symbol.slice(0, 3)}
    </div>
  );
};

const DashboardHome = () => {
  const { user } = useAuthStore();
  const { isFeatureEnabled } = useAppStore();
  const [summary, setSummary] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({
    total_balance: 0,
    wallet_count: 0,
    transaction_count: 0,
    active_cards: 0,
  });
  const [markets, setMarkets] = useState([]);
  const [tickers, setTickers] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [balanceDisplay, setBalanceDisplay] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    try {
      const [summaryRes, walletsRes, marketsRes, tickersRes] = await Promise.allSettled([
        dashboardService.getSummary(),
        walletService.getWallets(),
        cryptoService.getMarkets(),
        cryptoService.get24hTickers(),
      ]);

      if (summaryRes.status === 'fulfilled' && summaryRes.value?.success) {
        const data = summaryRes.value.data;
        setSummary(data);
        setTransactions(data.transactions || []);

        const walletsData = data.wallets || [];
        let totalUSD = 0;
        for (const wallet of walletsData) {
          const bal = parseFloat(wallet.balance) || 0;
          const rate = FALLBACK_RATES[wallet.currency] || 1;
          totalUSD += bal / rate;
        }

        setStats({
          ...(data.stats || {}),
          total_balance: totalUSD,
          wallet_count: data.stats?.wallet_count || walletsData.length,
          transaction_count: data.stats?.transaction_count || (data.transactions || []).length,
          active_cards: data.stats?.active_cards || 0,
        });
      }

      if (walletsRes.status === 'fulfilled' && walletsRes.value?.success) {
        setWallets(Array.isArray(walletsRes.value.data) ? walletsRes.value.data : []);
      }

      if (marketsRes.status === 'fulfilled' && marketsRes.value?.success) {
        const raw = marketsRes.value.data?.data || marketsRes.value.data;
        setMarkets(Array.isArray(raw) ? raw.slice(0, 10) : []);
      }

      if (tickersRes.status === 'fulfilled' && tickersRes.value?.success) {
        const raw = tickersRes.value.data;
        const map = {};
        if (typeof raw === 'object' && !Array.isArray(raw)) {
          Object.entries(raw).forEach(([id, v]) => {
            map[id.toLowerCase()] = v?.ticker || v;
          });
        }
        setTickers(map);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleCurrencyChange = async (e) => {
    const currency = e.target.value;
    if (currency === 'USD') {
      setBalanceDisplay(null);
      return;
    }
    const fallbackRate = FALLBACK_RATES[currency] || 1;
    setBalanceDisplay({ currency, value: (stats.total_balance || 0) * fallbackRate });
    setBalanceLoading(true);
    try {
      const rateRes = await cryptoService.getExchangeRates('USD', currency);
      if (rateRes.success) {
        const realRate = rateRes.data.rate || rateRes.data.exchange_rate;
        setBalanceDisplay({ currency, value: (stats.total_balance || 0) * realRate });
      }
    } catch {
      // keep fallback
    } finally {
      setBalanceLoading(false);
    }
  };

  const displayName = user?.first_name || user?.username || user?.full_name?.split(' ')[0] || 'User';

  const quickActions = [
    { name: 'Deposit', icon: ArrowDownLeft, href: '/dashboard/wallets', color: 'text-success' },
    { name: 'Withdraw', icon: ArrowUpRight, href: '/dashboard/wallets', color: 'text-danger' },
    { name: 'Swap', icon: ArrowLeftRight, href: '/dashboard/instant-swap?from=USDT&to=NGN', color: 'text-primary' },
    { name: 'Trade', icon: Activity, href: '/dashboard/trade', color: 'text-warning' },
  ];

  const statsDisplay = [
    {
      name: 'Active Wallets',
      value: stats.wallet_count || wallets.length,
      icon: Wallet,
      change: `${wallets.length} currencies`,
      changeType: 'positive',
      enabled: true,
    },
    {
      name: 'Transactions',
      value: stats.transaction_count || transactions.length,
      icon: TrendingUp,
      change: 'All time',
      changeType: 'neutral',
      enabled: true,
    },
    {
      name: 'Virtual Cards',
      value: stats.active_cards || 0,
      icon: CreditCard,
      change: 'Active',
      changeType: 'neutral',
      enabled: isFeatureEnabled('virtual_cards'),
    },
  ].filter(stat => stat.enabled);

  return (
    <div className="space-y-6">
      {/* Greeting + Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-foreground">
            Welcome back, {displayName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's your portfolio overview</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Portfolio Value + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Total Balance Card with Currency Dropdown */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Total Portfolio Value</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="appearance-none bg-muted border border-border px-3 py-1 rounded-lg text-xs font-bold text-foreground focus:outline-none cursor-pointer hover:border-primary transition-colors"
                onChange={handleCurrencyChange}
              >
                <option value="USD">USD</option>
                <option value="NGN">NGN</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="ZAR">ZAR</option>
                <option value="GHS">GHS</option>
                <option value="KES">KES</option>
                <option value="CNY">CNY</option>
                <option value="AUD">AUD</option>
                <option value="JPY">JPY</option>
              </select>
              <button
                onClick={() => setBalanceVisible(!balanceVisible)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {balanceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="mb-6 flex items-center gap-2">
            {loading ? (
              <div className="h-10 w-48 bg-muted rounded animate-pulse" />
            ) : (
              <BalanceOneLine className="flex-1">
                {balanceVisible
                  ? balanceDisplay
                    ? formatCurrency(balanceDisplay.value, balanceDisplay.currency)
                    : formatCurrency(stats.total_balance, 'USD')
                  : '****'}
              </BalanceOneLine>
            )}
            {balanceLoading && (
              <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" />
            )}
          </div>

          {/* Wallet breakdown */}
          <div className="flex flex-wrap gap-3">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-8 w-28 bg-muted rounded-lg animate-pulse" />
              ))
            ) : (
              wallets.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
                  <span className="text-xs font-bold text-foreground">{w.currency}</span>
                  <span className="text-xs text-muted-foreground">
                    {balanceVisible ? formatCurrency(w.balance, w.currency) : '****'}
                  </span>
                </div>
              ))
            )}
            {wallets.length > 5 && (
              <Link to="/dashboard/wallets" className="text-xs text-primary hover:underline self-center">
                +{wallets.length - 5} more
              </Link>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => (
              <Link
                key={action.name}
                to={action.href}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors group"
              >
                <div className={`p-2 rounded-lg bg-background ${action.color} group-hover:scale-110 transition-transform`}>
                  <action.icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-foreground">{action.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statsDisplay.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="glass-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.name}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                  <p className={`text-xs mt-1 ${stat.changeType === 'positive' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {stat.change}
                  </p>
                </div>
                <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Markets Overview */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold font-heading text-foreground">Trending Markets</h3>
          </div>
          <Link to="/dashboard/markets" className="text-xs text-primary hover:underline font-medium">
            View All
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1">
                  <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-12 bg-muted rounded animate-pulse" />
                </div>
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : markets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">Asset</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 px-4">Price</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 px-4">24h Change</th>
                  <th className="text-right text-xs font-medium text-muted-foreground py-2 pl-4 hidden sm:table-cell">Volume</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market) => {
                  const pair = market.pair || market.symbol || '';
                  const base = (pair.split(/[-_/]/)[0] || '').toUpperCase();
                  const tickerKey = pair.toLowerCase();
                  const ticker = tickers[tickerKey] || {};
                  const price = parseFloat(ticker.last || ticker.sell || ticker.buy || market.last || 0);
                  const change = parseFloat(ticker.change || ticker.price_change_percent || market.change || 0);
                  const volume = parseFloat(ticker.vol || ticker.volume || market.volume || 0);
                  const isUp = change >= 0;

                  return (
                    <tr
                      key={pair}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => window.location.href = `/dashboard/trade/${pair}`}
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <CoinBadge symbol={base} />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{base}</p>
                            <p className="text-[10px] text-muted-foreground">{pair.replace(/[-_]/, '/').toUpperCase()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className="text-sm font-medium text-foreground tabular-nums">
                          {price > 0 ? price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : '--'}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isUp ? 'text-success' : 'text-danger'}`}>
                          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {change !== 0 ? `${isUp ? '+' : ''}${change.toFixed(2)}%` : '--'}
                        </span>
                      </td>
                      <td className="text-right py-3 pl-4 hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {volume > 0 ? volume.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '--'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Market data unavailable</p>
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-base font-semibold font-heading text-foreground">Recent Transactions</h3>
          </div>
          <Link to="/dashboard/transactions" className="text-xs text-primary hover:underline font-medium">
            View All
          </Link>
        </div>

        {transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No transactions yet</p>
            <p className="text-xs mt-1">Start by funding your wallet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.slice(0, 5).map((tx, i) => {
              const isCredit = tx.type === 'credit' || tx.transaction_type === 'credit';
              return (
                <div key={tx.id || i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg ${isCredit ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                      {isCredit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {tx.description || tx.transaction_type || tx.type}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDateTime ? formatDateTime(tx.created_at) : new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${isCredit ? 'text-success' : 'text-danger'}`}>
                      {isCredit ? '+' : '-'}{formatCurrency(Math.abs(tx.from_amount || tx.amount), tx.from_currency || tx.currency)}
                    </span>
                    {tx.status && (
                      <p className={`text-[10px] ${tx.status === 'completed' ? 'text-success' : 'text-warning'}`}>
                        {tx.status}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardHome;
