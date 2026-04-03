import React, { useEffect, useRef } from 'react';

const TradingViewChart = ({ symbol = 'USDTNGN', theme = 'light' }) => {
  const container = useRef();

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => {
      if (typeof TradingView !== 'undefined') {
        new TradingView.widget({
          "autosize": true,
          "symbol": symbol.toUpperCase().includes('NGN') ? `QUIDAX:${symbol.toUpperCase()}` : `BINANCE:${symbol.toUpperCase()}`,
          "interval": "D",
          "timezone": "Africa/Lagos",
          "theme": theme,
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "allow_symbol_change": true,
          "container_id": "tradingview_chart"
        });
      }
    };
    document.head.appendChild(script);
    return () => {
        if (script.parentNode) script.parentNode.removeChild(script);
    }
  }, [symbol, theme]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden h-[450px]">
      <div id="tradingview_chart" className="h-full w-full" ref={container} />
    </div>
  );
};

export default TradingViewChart;
