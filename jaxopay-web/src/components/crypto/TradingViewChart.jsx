import React, { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';

/**
 * Resolve any trading pair symbol to a TradingView-supported symbol.
 *
 * Mapping strategy:
 *  - Crypto/Crypto pairs (e.g. BTCUSDT, ETHBTC)   → BINANCE:{symbol}
 *  - Stablecoin/Fiat  (e.g. USDTNGN, USDCGHS)    → FX_IDC:USD{fiat}  (USD as proxy)
 *  - Crypto/Fiat      (e.g. BTCNGN, ETHGHS)       → BINANCE:{base}USDT
 *
 * NGN/GHS/KES pairs don't exist on TradingView, so we always fall back
 * to a liquid BINANCE pair so the chart never fails to load.
 */
const FIAT_SUFFIXES = ['NGN', 'GHS', 'KES', 'ZAR', 'EUR', 'GBP', 'USD'];
const STABLECOINS   = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];
const CRYPTO_QUOTES = ['USDT', 'USDC', 'BTC', 'ETH', 'BNB', 'BUSD'];

const resolveTVSymbol = (symbol) => {
  const s = symbol.toUpperCase().replace(/[\s/]/g, '');

  // Already has an exchange prefix (e.g. "BINANCE:BTCUSDT")
  if (s.includes(':')) return s;

  // Identify the quote asset
  const cryptoQuote = CRYPTO_QUOTES.find(q => s.endsWith(q) && s.length > q.length);
  if (cryptoQuote) {
    // Pure crypto pair → Binance
    return `BINANCE:${s}`;
  }

  const fiatQuote = FIAT_SUFFIXES.find(q => s.endsWith(q) && s.length > q.length);
  if (fiatQuote) {
    const base = s.slice(0, -fiatQuote.length);

    if (STABLECOINS.includes(base)) {
      // Stablecoin vs fiat (USDTNGN, USDCGHS) → FX rate proxy
      const fxPair = `USD${fiatQuote}`;
      // TradingView FX_IDC covers most emerging-market pairs
      return `FX_IDC:${fxPair}`;
    }

    // Crypto vs fiat (BTCNGN, ETHGHS) → use liquid USDT pair on Binance
    return `BINANCE:${base}USDT`;
  }

  // Unknown format — try Binance with USDT appended
  return `BINANCE:${s}USDT`;
};

const TradingViewChart = ({ symbol = 'USDTNGN' }) => {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  const theme = useAppStore(s => s.theme);

  const buildWidget = useCallback(() => {
    const el = containerRef.current;
    if (!el || typeof TradingView === 'undefined') return;

    // Clear any existing widget
    el.innerHTML = '';
    widgetRef.current = null;

    const tvSymbol = resolveTVSymbol(symbol);
    const tvTheme = theme === 'dark' ? 'Dark' : 'Light';

    try {
      widgetRef.current = new TradingView.widget({
        autosize: true,
        symbol: tvSymbol,
        interval: 'D',
        timezone: 'Africa/Lagos',
        theme: tvTheme,
        style: '1',
        locale: 'en',
        toolbar_bg: theme === 'dark' ? '#161a1f' : '#f8fafc',
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        container_id: el.id,
        studies: ['Volume@tv-basicstudies'],
        overrides: theme === 'dark' ? {
          'paneProperties.background': '#161a1f',
          'paneProperties.vertGridProperties.color': '#2b3139',
          'paneProperties.horzGridProperties.color': '#2b3139',
        } : {},
      });
    } catch (err) {
      console.warn('[TradingViewChart] Widget init error:', err);
    }
  }, [symbol, theme]);

  useEffect(() => {
    const containerId = `tv_chart_${Math.random().toString(36).slice(2, 8)}`;
    if (containerRef.current) containerRef.current.id = containerId;

    // If TradingView script already loaded, build immediately
    if (typeof TradingView !== 'undefined') {
      buildWidget();
      return;
    }

    // Load script once
    const existing = document.querySelector('script[data-tv-widget]');
    if (existing) {
      existing.addEventListener('load', buildWidget);
      return () => existing.removeEventListener('load', buildWidget);
    }

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.setAttribute('data-tv-widget', '1');
    script.onload = buildWidget;
    document.head.appendChild(script);

    return () => {
      // Don't remove the script — only remove this listener
      script.removeEventListener('load', buildWidget);
    };
  }, [buildWidget]);

  return (
    <div className="w-full h-full min-h-[300px] bg-white dark:bg-[#161a1f] rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default TradingViewChart;
