import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import cryptoService from '../../services/cryptoService';

/**
 * Breaking News Style Live Price Ticker
 * Features:
 * - Continuous scrolling marquee
 * - Multiple trading pairs
 * - Color-coded price changes
 * - Real-time updates
 */
const LivePriceTicker = () => {
    const [tickers, setTickers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isPaused, setIsPaused] = useState(false);
    const marqueeRef = useRef(null);

    // Trading pairs to display
    const tradingPairs = [
        { pair: 'BTC/USDT', market: 'btcusdt', type: 'crypto' },
        { pair: 'ETH/USDT', market: 'ethusdt', type: 'crypto' },
        { pair: 'BTC/NGN', market: 'btcngn', type: 'crypto-fiat' },
        { pair: 'ETH/NGN', market: 'ethngn', type: 'crypto-fiat' },
        { pair: 'USDT/NGN', market: 'usdtngn', type: 'stable' },
        { pair: 'SOL/USDT', market: 'solusdt', type: 'crypto' },
        { pair: 'BNB/USDT', market: 'bnbusdt', type: 'crypto' },
        { pair: 'XRP/USDT', market: 'xrpusdt', type: 'crypto' },
        { pair: 'ADA/USDT', market: 'adausdt', type: 'crypto' },
        { pair: 'DOGE/USDT', market: 'dogeusdt', type: 'crypto' },
        { pair: 'DOT/USDT', market: 'dotusdt', type: 'crypto' },
        { pair: 'MATIC/USDT', market: 'maticusdt', type: 'crypto' },
    ];

    useEffect(() => {
        const fetchTickers = async () => {
            try {
                const result = await cryptoService.get24hTickers();
                if (result.success && result.data) {
                    // Quidax returns { market_id: { ticker: { last, buy, sell, ... } } }
                    const tickerData = result.data.data || result.data;

                    const formattedTickers = tradingPairs.map(({ pair, market }) => {
                        const data = tickerData[market.toLowerCase()] ||
                                   tickerData[market.toUpperCase()] ||
                                   tickerData[market];

                        const ticker = data?.ticker || data || {};
                        const price = parseFloat(ticker.last || ticker.sell || ticker.price || 0);
                        return {
                            pair,
                            price,
                            change: parseFloat(ticker.change || ticker.price_change_percent || 0),
                            volume: parseFloat(ticker.vol || ticker.volume || 0),
                            high: parseFloat(ticker.high || 0),
                            low: parseFloat(ticker.low || 0)
                        };
                    });

                    // Only update if at least some markets returned real data
                    const hasRealData = formattedTickers.some(t => t.price > 0);
                    if (hasRealData) setTickers(formattedTickers);
                    setLoading(false);
                } else {
                    setLoading(false);
                }
            } catch (err) {
                console.error('Failed to fetch tickers:', err);
                setLoading(false);
            }
        };

        fetchTickers();
        const interval = setInterval(fetchTickers, 10000); // Update every 10 seconds
        return () => clearInterval(interval);
    }, []);

    const getChangeColor = (change) => {
        if (change > 0) return 'text-green-500';
        if (change < 0) return 'text-red-500';
        return 'text-gray-500';
    };

    const getChangeBg = (change) => {
        if (change > 0) return 'bg-green-500/10';
        if (change < 0) return 'bg-red-500/10';
        return 'bg-gray-500/10';
    };

    const formatPrice = (price, pair) => {
        if (pair.includes('NGN')) {
            return price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
        if (price < 1) {
            return price.toLocaleString(undefined, {
                minimumFractionDigits: 4,
                maximumFractionDigits: 6
            });
        }
        return price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4
        });
    };

    const formatChange = (change) => {
        const sign = change >= 0 ? '+' : '';
        return `${sign}${change.toFixed(2)}%`;
    };

    // Duplicate tickers for seamless loop
    const displayTickers = [...tickers, ...tickers, ...tickers];

    if (loading && tickers.length === 0) {
        return (
            <div className="bg-gray-900 border-y border-gray-800 py-2 overflow-hidden">
                <div className="flex items-center justify-center gap-2 text-gray-500 text-xs">
                    <Activity className="w-4 h-4 animate-spin" />
                    <span>Loading market data...</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-gray-700 overflow-hidden relative"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {/* Breaking News Label */}
            <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center">
                <div className="bg-red-600 text-white px-3 py-2 flex items-center gap-1.5 shadow-lg">
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span className="text-[10px] font-black uppercase tracking-wider">LIVE</span>
                </div>
                <div className="w-8 h-full bg-gradient-to-r from-gray-900 to-transparent" />
            </div>

            {/* Ticker Content */}
            <div
                ref={marqueeRef}
                className="flex whitespace-nowrap py-2"
                style={{
                    animation: `marquee 60s linear infinite`,
                    animationPlayState: isPaused ? 'paused' : 'running'
                }}
            >
                {displayTickers.map((ticker, index) => (
                    <div
                        key={`${ticker.pair}-${index}`}
                        className="flex items-center gap-3 px-4 border-r border-gray-700/50 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        {/* Pair Name */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                                {ticker.pair}
                            </span>
                        </div>

                        {/* Price */}
                        <span className="text-sm font-bold text-white tabular-nums tracking-tight">
                            {formatPrice(ticker.price, ticker.pair)}
                        </span>

                        {/* Change Badge */}
                        <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${getChangeBg(ticker.change)}`}>
                            {ticker.change >= 0 ? (
                                <TrendingUp className={`w-3 h-3 ${getChangeColor(ticker.change)}`} />
                            ) : (
                                <TrendingDown className={`w-3 h-3 ${getChangeColor(ticker.change)}`} />
                            )}
                            <span className={`text-[10px] font-bold ${getChangeColor(ticker.change)}`}>
                                {formatChange(ticker.change)}
                            </span>
                        </div>

                        {/* Volume (hidden on mobile) */}
                        <span className="hidden lg:block text-[10px] text-gray-500 tabular-nums">
                            Vol: {(ticker.volume / 1000).toFixed(1)}K
                        </span>
                    </div>
                ))}
            </div>

            {/* Right Fade */}
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-gray-900 to-transparent z-10" />

            {/* Inline Styles for Animation */}
            <style>{`
                @keyframes marquee {
                    0% {
                        transform: translateX(0);
                    }
                    100% {
                        transform: translateX(-33.33%);
                    }
                }
            `}</style>
        </div>
    );
};

export default LivePriceTicker;
