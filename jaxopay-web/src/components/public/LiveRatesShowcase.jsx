import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import cryptoService from '../../services/cryptoService';

const COIN_META = {
    BTC: { color: '#f7931a' },
    ETH: { color: '#627eea' },
    USDT: { color: '#26a17b' },
    SOL: { color: '#9945ff' },
    BNB: { color: '#f3ba2f' },
    XRP: { color: '#00aae4' },
    ADA: { color: '#0033ad' },
    DOGE: { color: '#c2a633' },
};

const formatPrice = (value, quote) => {
    const n = Number(value);
    if (!(n > 0)) return '—';
    if (quote === 'NGN') return `₦${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (quote === 'GHS') return `₵${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    return n < 1 ? `$${n.toFixed(4)}` : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const CoinIcon = ({ code }) => {
    const [failed, setFailed] = useState(false);
    if (!failed) {
        return (
            <img
                src={`https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/svg/color/${code.toLowerCase()}.svg`}
                alt={code}
                width={22}
                height={22}
                className="rounded-full shrink-0"
                onError={() => setFailed(true)}
            />
        );
    }
    return (
        <div
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white font-black text-[8px] shrink-0"
            style={{ backgroundColor: COIN_META[code]?.color || '#848e9c' }}
        >
            {code.slice(0, 3)}
        </div>
    );
};

const TickerPill = ({ pair }) => {
    const change = parseFloat(pair.change || pair.price_change_percent || 0);
    return (
        <div className="flex items-center gap-2.5 px-4 py-2.5 mx-1.5 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 shrink-0">
            <CoinIcon code={pair.base} />
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{pair.base}/{pair.quote}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                {formatPrice(pair.jaxopay_rate, pair.quote)}
            </span>
            {change !== 0 && (
                <span className={`flex items-center gap-0.5 text-[11px] font-bold ${change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {Math.abs(change).toFixed(2)}%
                </span>
            )}
        </div>
    );
};

const SkeletonPill = ({ i }) => (
    <div className="flex items-center gap-2.5 px-4 py-2.5 mx-1.5 bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-100 dark:border-gray-700 shrink-0 animate-pulse">
        <div className="w-[22px] h-[22px] rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-14 rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-16 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
);

/**
 * Public marketing rate ticker — a compact, continuously scrolling marquee (same visual
 * language as the old in-app ticker), fetched ONCE per page load (no interval, no polling)
 * from /crypto/ticker/24h, which the backend caches server-side for 5 minutes and shares
 * across every visitor. So no matter how much traffic this page gets, Obiex only ever sees at
 * most one real call every 5-minute window, not one per page view. The scrolling motion and
 * pulsing "LIVE" dot keep it feeling real-time even though the underlying data is a cached
 * snapshot, not a per-second feed.
 *
 * The pair list is derived from the response itself, not a hardcoded array — has_markup (set by
 * crypto.controller.js's attachJaxopayRates) is true only for pairs an admin has actually
 * configured a markup for in the Rates & Fees tab. A hardcoded list previously showed several
 * pairs (BTC/NGN, every GHS pair, ETH, SOL, BNB, XRP, ADA, DOGE) nobody had priced, silently
 * passing through the raw provider rate as if it were "our rate" — this can never drift out of
 * sync with admin config again since it only ever shows what's actually been marked up.
 */
const LiveRatesShowcase = () => {
    const [pairs, setPairs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        cryptoService.get24hTickers().then((res) => {
            if (!active) return;
            if (res.success && res.data) {
                const raw = res.data.data || res.data;
                const list = [];
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    Object.entries(raw).forEach(([id, v]) => {
                        const t = v?.ticker || v;
                        if (!v?.base || !v?.quote || !t?.has_markup) return;
                        list.push({
                            market: id,
                            base: v.base,
                            quote: v.quote,
                            jaxopay_rate: t.jaxopay_rate,
                            change: t.change ?? t.price_change_percent,
                        });
                    });
                }
                setPairs(list);
            }
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);

    // Duplicated once so the -50% marquee translate loops seamlessly with no visible seam.
    const displayPairs = [...pairs, ...pairs];

    return (
        <section className="py-6 bg-white dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-wide">Live Rates</span>
                </div>
                <div className="relative flex-1 overflow-hidden">
                    <div className="flex animate-marquee w-max">
                        {loading
                            ? Array.from({ length: 6 }).map((_, i) => <SkeletonPill key={i} />)
                            : displayPairs.map((pair, i) => <TickerPill key={`${pair.market}-${i}`} pair={pair} />)}
                    </div>
                    {/* Edge fades so pills scroll in/out smoothly instead of clipping abruptly */}
                    <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white dark:from-gray-900 to-transparent" />
                    <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white dark:from-gray-900 to-transparent" />
                </div>
            </div>
        </section>
    );
};

export default LiveRatesShowcase;
