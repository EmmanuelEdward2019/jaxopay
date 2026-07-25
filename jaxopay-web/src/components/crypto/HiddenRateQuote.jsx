import { useState, useRef } from 'react';
import { Eye } from 'lucide-react';
import cryptoService from '../../services/cryptoService';

const PAIRS = [
    { label: 'BTC/USDT', from: 'BTC', to: 'USDT' },
    { label: 'ETH/USDT', from: 'ETH', to: 'USDT' },
    { label: 'BTC/NGN', from: 'BTC', to: 'NGN' },
    { label: 'ETH/NGN', from: 'ETH', to: 'NGN' },
    { label: 'USDT/NGN', from: 'USDT', to: 'NGN' },
    { label: 'SOL/USDT', from: 'SOL', to: 'USDT' },
    { label: 'BNB/USDT', from: 'BNB', to: 'USDT' },
    { label: 'XRP/USDT', from: 'XRP', to: 'USDT' },
];

// A quote stays fresh in-memory for this long before hovering/clicking again re-fetches it —
// keeps repeat interactions with the same pair from firing another request every time.
const FRESH_MS = 60 * 1000;

const formatRate = (value, to) => {
    const n = Number(value);
    if (!(n > 0)) return 'N/A';
    const decimals = ['NGN', 'GHS', 'KES', 'ZAR'].includes(to) ? 2 : 6;
    return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
};

/**
 * Masked-by-default rate quote strip. No background polling at all — each pair only calls
 * /crypto/rates (Obiex-first) the moment a user actually hovers or taps it, and only if that
 * pair hasn't been fetched in the last minute. This replaced the old always-on ticker bar,
 * which was polling Obiex every 15s regardless of whether anyone was looking at it.
 */
const HiddenRateQuote = () => {
    const [state, setState] = useState({}); // { [label]: { rate, loading, error, show, fetchedAt } }
    const cache = useRef({});

    const reveal = async (pair) => {
        const cached = cache.current[pair.label];
        if (cached && Date.now() - cached.fetchedAt < FRESH_MS) {
            setState((prev) => ({ ...prev, [pair.label]: { ...cached, show: true } }));
            return;
        }

        setState((prev) => ({ ...prev, [pair.label]: { ...prev[pair.label], show: true, loading: true, error: false } }));
        try {
            const res = await cryptoService.getExchangeRates(pair.from, pair.to);
            const rate = res?.success ? res.data?.rate : null;
            const entry = { rate, loading: false, error: !rate, show: true, fetchedAt: Date.now() };
            cache.current[pair.label] = entry;
            setState((prev) => ({ ...prev, [pair.label]: entry }));
        } catch {
            const entry = { rate: null, loading: false, error: true, show: true, fetchedAt: Date.now() };
            cache.current[pair.label] = entry;
            setState((prev) => ({ ...prev, [pair.label]: entry }));
        }
    };

    const hide = (pair) => {
        setState((prev) => (prev[pair.label] ? { ...prev, [pair.label]: { ...prev[pair.label], show: false } } : prev));
    };

    return (
        <div className="glass-card p-4">
            <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-muted-foreground">
                    Live Rates <span className="font-normal">— hover or tap to reveal</span>
                </h3>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {PAIRS.map((pair) => {
                    const s = state[pair.label];
                    const revealed = s?.show;
                    return (
                        <button
                            key={pair.label}
                            type="button"
                            onMouseEnter={() => reveal(pair)}
                            onMouseLeave={() => hide(pair)}
                            onClick={() => (revealed ? hide(pair) : reveal(pair))}
                            className="shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg bg-muted/50 border border-border hover:border-primary/40 transition-colors min-w-[104px]"
                        >
                            <span className="text-[11px] font-bold text-muted-foreground">{pair.label}</span>
                            <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
                                {!revealed
                                    ? '••••••'
                                    : s.loading
                                        ? '...'
                                        : s.error
                                            ? 'N/A'
                                            : formatRate(s.rate, pair.to)}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default HiddenRateQuote;
