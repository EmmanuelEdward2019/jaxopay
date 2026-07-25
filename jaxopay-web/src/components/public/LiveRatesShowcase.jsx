import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import cryptoService from '../../services/cryptoService';

// Pairs to showcase — mirrors what the app itself trades, so the numbers visitors see here
// are the same ones they'd get inside the app.
const PAIRS = [
    { code: 'BTC', market: 'btcusdt', quote: 'USDT' },
    { code: 'ETH', market: 'ethusdt', quote: 'USDT' },
    { code: 'BTC', market: 'btcngn', quote: 'NGN' },
    { code: 'USDT', market: 'usdtngn', quote: 'NGN' },
    { code: 'SOL', market: 'solusdt', quote: 'USDT' },
    { code: 'BNB', market: 'bnbusdt', quote: 'USDT' },
    { code: 'XRP', market: 'xrpusdt', quote: 'USDT' },
    { code: 'ETH', market: 'ethngn', quote: 'NGN' },
];

const COIN_META = {
    BTC: { name: 'Bitcoin', color: '#f7931a' },
    ETH: { name: 'Ethereum', color: '#627eea' },
    USDT: { name: 'Tether', color: '#26a17b' },
    SOL: { name: 'Solana', color: '#9945ff' },
    BNB: { name: 'BNB', color: '#f3ba2f' },
    XRP: { name: 'XRP', color: '#00aae4' },
};

const formatPrice = (value, quote) => {
    const n = Number(value);
    if (!(n > 0)) return '—';
    if (quote === 'NGN') return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return n < 1 ? `$${n.toFixed(4)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const CoinIcon = ({ code }) => {
    const [failed, setFailed] = useState(false);
    const meta = COIN_META[code] || {};
    if (!failed) {
        return (
            <img
                src={`https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/svg/color/${code.toLowerCase()}.svg`}
                alt={code}
                width={36}
                height={36}
                className="rounded-full"
                onError={() => setFailed(true)}
            />
        );
    }
    return (
        <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-[10px]"
            style={{ backgroundColor: meta.color || '#848e9c' }}
        >
            {code.slice(0, 3)}
        </div>
    );
};

/**
 * Public marketing rate showcase — fetched ONCE per page load (no interval, no polling), from
 * /crypto/ticker/24h which the backend caches server-side for 5 minutes and shares across every
 * visitor. So no matter how much traffic this page gets, Obiex only ever sees at most one real
 * call every 5 minutes total, not one per page view.
 */
const LiveRatesShowcase = () => {
    const [rates, setRates] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        cryptoService.get24hTickers().then((res) => {
            if (!active) return;
            if (res.success && res.data) {
                const raw = res.data.data || res.data;
                const map = {};
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    Object.entries(raw).forEach(([id, v]) => { map[id.toLowerCase()] = v?.ticker || v; });
                }
                setRates(map);
            }
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    return (
        <section className="py-20 bg-white dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-12"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent-50 dark:bg-accent-900/20 rounded-full mb-4">
                        <Zap className="w-3.5 h-3.5 text-accent-600" />
                        <span className="text-xs font-bold text-accent-600 uppercase tracking-wide">Live Rates</span>
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                        Real rates, right now
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
                        The same competitive rates you'll get inside the app — no markup, no surprises.
                    </p>
                </motion.div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {PAIRS.map((pair, i) => {
                        const ticker = rates[pair.market];
                        const price = ticker ? parseFloat(ticker.last || ticker.sell || ticker.buy || 0) : null;
                        const change = ticker ? parseFloat(ticker.change || ticker.price_change_percent || 0) : 0;

                        return (
                            <motion.div
                                key={pair.market}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: i * 0.05 }}
                                className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 hover:border-accent-200 dark:hover:border-accent-800 hover:shadow-lg transition-all"
                            >
                                <div className="flex items-center gap-3 mb-3">
                                    <CoinIcon code={pair.code} />
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white text-sm">{pair.code}/{pair.quote}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{COIN_META[pair.code]?.name || pair.code}</div>
                                    </div>
                                </div>
                                <div className="flex items-end justify-between">
                                    <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
                                        {loading ? (
                                            <span className="inline-block w-16 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                        ) : (
                                            formatPrice(price, pair.quote)
                                        )}
                                    </div>
                                    {!loading && change !== 0 && (
                                        <div className={`flex items-center gap-0.5 text-xs font-bold ${change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                            {Math.abs(change).toFixed(2)}%
                                        </div>
                                    )}
                                    {!loading && change === 0 && (
                                        <Minus className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default LiveRatesShowcase;
