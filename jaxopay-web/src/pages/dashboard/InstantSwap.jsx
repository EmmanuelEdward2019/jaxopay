import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeftRight, RefreshCw, ArrowDown, AlertCircle, Check,
  ChevronDown, Search, X, ShieldCheck, Clock, Loader2
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';
import walletService from '../../services/walletService';

const POPULAR_PAIRS = [
  { from: 'USDT', to: 'NGN' },
  { from: 'BTC', to: 'NGN' },
  { from: 'ETH', to: 'USDT' },
  { from: 'BTC', to: 'USDT' },
  { from: 'USDT', to: 'GHS' },
  { from: 'BNB', to: 'USDT' },
];

const COIN_META = {
  BTC: { name: 'Bitcoin', color: '#f7931a' },
  ETH: { name: 'Ethereum', color: '#627eea' },
  USDT: { name: 'Tether', color: '#26a17b' },
  USDC: { name: 'USD Coin', color: '#2775ca' },
  BNB: { name: 'BNB', color: '#f3ba2f' },
  SOL: { name: 'Solana', color: '#9945ff' },
  XRP: { name: 'Ripple', color: '#00aae4' },
  NGN: { name: 'Nigerian Naira', color: '#008751' },
  GHS: { name: 'Ghanaian Cedi', color: '#ce1126' },
  TRX: { name: 'TRON', color: '#ff0013' },
  DOGE: { name: 'Dogecoin', color: '#c2a633' },
  LTC: { name: 'Litecoin', color: '#bfbbbb' },
  ADA: { name: 'Cardano', color: '#0033ad' },
  MATIC: { name: 'Polygon', color: '#8247e5' },
  DOT: { name: 'Polkadot', color: '#e6007a' },
  CNGN: { name: 'cNGN', color: '#008751' },
};

const CoinIcon = ({ code, size = 32 }) => {
  const meta = COIN_META[code?.toUpperCase()] || {};
  return (
    <div className="rounded-full flex items-center justify-center text-white font-black text-xs shrink-0"
      style={{ width: size, height: size, backgroundColor: meta.color || '#848e9c' }}>
      {(code || '??').slice(0, 3).toUpperCase()}
    </div>
  );
};

const InstantSwap = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [fromCode, setFromCode] = useState(searchParams.get('from')?.toUpperCase() || 'USDT');
  const [toCode, setToCode] = useState(searchParams.get('to')?.toUpperCase() || 'NGN');
  const [payAmount, setPayAmount] = useState('');
  const [receiveAmount, setReceiveAmount] = useState('');
  const [wallets, setWallets] = useState([]);
  const [assets, setAssets] = useState([]);

  // Quotation lifecycle
  const [quotation, setQuotation] = useState(null);
  const [swapPhase, setSwapPhase] = useState('idle'); // idle|quoting|quoted|refreshing|confirming|polling|completed|failed
  const [swapError, setSwapError] = useState(null);
  const [swapResult, setSwapResult] = useState(null);
  const [countdownSecs, setCountdownSecs] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const quotationIdRef = useRef(null);
  const autoRefreshFiredRef = useRef(false);
  const refreshCallbackRef = useRef(null);

  // Rate preview (before quote)
  const [previewRate, setPreviewRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);

  // Token picker modal
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSide, setPickerSide] = useState('from');
  const [pickerSearch, setPickerSearch] = useState('');

  // Update URL when currencies change
  useEffect(() => {
    setSearchParams({ from: fromCode, to: toCode }, { replace: true });
  }, [fromCode, toCode, setSearchParams]);

  // Fetch wallets + assets
  useEffect(() => {
    walletService.getWallets().then(res => {
      if (res.success) setWallets(Array.isArray(res.data) ? res.data : res.data?.wallets || []);
    });
    cryptoService.getSupportedCryptos().then(res => {
      if (res.success) setAssets(res.data || []);
    });
  }, []);

  // Preview rate debounce
  useEffect(() => {
    if (swapPhase !== 'idle') return;
    const timer = setTimeout(() => {
      if (payAmount && parseFloat(payAmount) > 0) fetchPreviewRate();
      else { setReceiveAmount(''); setPreviewRate(null); }
    }, 300);
    return () => clearTimeout(timer);
  }, [payAmount, fromCode, toCode, swapPhase]);

  // Keep refresh callback ref current
  useEffect(() => { refreshCallbackRef.current = handleRefresh; });

  // Countdown timer
  useEffect(() => {
    if (!quotation?.expires_at) { setCountdownSecs(0); return; }
    autoRefreshFiredRef.current = false;
    const expiresAt = new Date(quotation.expires_at).getTime();
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdownSecs(left);
      if (left === 0 && !autoRefreshFiredRef.current) {
        autoRefreshFiredRef.current = true;
        clearInterval(interval);
        refreshCallbackRef.current?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [quotation?.expires_at]);

  // Reset quotation when user changes params
  useEffect(() => {
    if (swapPhase === 'quoted' || swapPhase === 'refreshing') {
      setSwapPhase('idle');
      setQuotation(null);
      setSwapError(null);
      quotationIdRef.current = null;
    }
  }, [fromCode, toCode, payAmount]);

  const getBalance = (code) => {
    const w = wallets.find(w => w.currency?.toUpperCase() === code?.toUpperCase());
    return parseFloat(w?.balance || 0);
  };

  const fetchPreviewRate = async () => {
    setLoadingRate(true);
    try {
      const res = await cryptoService.getExchangeRates(fromCode, toCode, parseFloat(payAmount));
      if (res.success && res.data) {
        const amt = res.data.exchange_amount ?? res.data.converted_amount;
        setReceiveAmount(amt != null ? Number(amt).toFixed(isFiat(toCode) ? 2 : 6) : '');
        setPreviewRate(res.data.rate || res.data.rate_with_fee);
      } else {
        setReceiveAmount('');
        setPreviewRate(null);
      }
    } catch {
      setReceiveAmount('');
      setPreviewRate(null);
    }
    setLoadingRate(false);
  };

  const isFiat = (code) => ['NGN', 'GHS', 'KES', 'USD', 'EUR', 'GBP', 'ZAR'].includes(code?.toUpperCase());

  const handleFlip = () => {
    setFromCode(toCode);
    setToCode(fromCode);
    setPayAmount('');
    setReceiveAmount('');
    setPreviewRate(null);
    resetSwap();
  };

  // ── Quotation lifecycle ─────────────────────────────────────────────────
  const handleGetQuote = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) { setSwapError('Enter an amount first.'); return; }
    setSwapPhase('quoting');
    setSwapError(null);
    setQuotation(null);
    setSwapResult(null);
    quotationIdRef.current = null;

    try {
      const res = await cryptoService.createSwapQuotation(fromCode, toCode, parseFloat(payAmount));
      if (res.success && res.data?.id) {
        quotationIdRef.current = res.data.id;
        setQuotation(res.data);
        setReceiveAmount(parseFloat(res.data.to_amount).toFixed(isFiat(toCode) ? 2 : 6));
        setSwapPhase('quoted');
      } else {
        setSwapError(res.error || 'Could not get quote.');
        setSwapPhase('failed');
      }
    } catch (e) {
      setSwapError(e.message || 'Quote failed.');
      setSwapPhase('failed');
    }
  };

  const handleRefresh = useCallback(async () => {
    const qid = quotationIdRef.current;
    if (!qid || isRefreshing) return;
    setIsRefreshing(true);
    setSwapPhase('refreshing');
    try {
      const res = await cryptoService.refreshSwapQuotation(qid, {
        from_currency: fromCode, to_currency: toCode, from_amount: parseFloat(payAmount),
      });
      if (res.success && res.data?.id) {
        quotationIdRef.current = res.data.id;
        setQuotation(res.data);
        setReceiveAmount(parseFloat(res.data.to_amount).toFixed(isFiat(toCode) ? 2 : 6));
        setSwapPhase('quoted');
      } else {
        setSwapError(res.error || 'Refresh failed.');
        setSwapPhase('failed');
      }
    } catch {
      setSwapError('Refresh failed.');
      setSwapPhase('failed');
    }
    setIsRefreshing(false);
  }, [fromCode, toCode, payAmount, isRefreshing]);

  const handleConfirm = async () => {
    const qid = quotationIdRef.current;
    if (!qid) { setSwapError('No active quote.'); return; }
    setSwapError(null);

    // Safety refresh if near expiry
    const secsLeft = quotation ? Math.max(0, Math.floor((new Date(quotation.expires_at).getTime() - Date.now()) / 1000)) : 0;
    if (secsLeft < 1) {
      setIsRefreshing(true);
      const rr = await cryptoService.refreshSwapQuotation(qid, { from_currency: fromCode, to_currency: toCode, from_amount: parseFloat(payAmount) });
      setIsRefreshing(false);
      if (!rr.success || !rr.data?.id) { setSwapError(rr.error || 'Could not refresh.'); setSwapPhase('failed'); return; }
      quotationIdRef.current = rr.data.id;
      setQuotation(rr.data);
    }

    setSwapPhase('confirming');
    try {
      const cr = await cryptoService.confirmSwapQuotation(quotationIdRef.current);
      if (!cr.success || !cr.data?.id) { setSwapError(cr.error || 'Confirmation failed.'); setSwapPhase('failed'); return; }
      setSwapPhase('polling');
      await pollSwapStatus(cr.data.id);
    } catch (e) {
      setSwapError(e.message || 'Swap failed.');
      setSwapPhase('failed');
    }
  };

  const pollSwapStatus = async (txId) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const res = await cryptoService.getSwapTransaction(txId);
        if (res.success && res.data) {
          if (res.data.status === 'completed') { setSwapResult(res.data); setSwapPhase('completed'); refreshWallets(); return; }
          if (res.data.status === 'failed') { setSwapError('Swap rejected by exchange.'); setSwapPhase('failed'); return; }
        }
      } catch {}
    }
    setSwapResult({ status: 'initiated' });
    setSwapPhase('completed');
    refreshWallets();
  };

  const refreshWallets = () => {
    walletService.getWallets().then(res => {
      if (res.success) setWallets(Array.isArray(res.data) ? res.data : res.data?.wallets || []);
    });
  };

  const resetSwap = () => {
    setSwapPhase('idle');
    setQuotation(null);
    setSwapResult(null);
    setSwapError(null);
    quotationIdRef.current = null;
  };

  const handleNewSwap = () => {
    resetSwap();
    setPayAmount('');
    setReceiveAmount('');
    setPreviewRate(null);
  };

  // Token picker
  const openPicker = (side) => { setPickerSide(side); setPickerSearch(''); setShowPicker(true); };
  const selectToken = (code) => {
    if (pickerSide === 'from') {
      if (code === toCode) setToCode(fromCode);
      setFromCode(code);
    } else {
      if (code === fromCode) setFromCode(toCode);
      setToCode(code);
    }
    setShowPicker(false);
    resetSwap();
    setPayAmount('');
    setReceiveAmount('');
  };

  const filteredAssets = assets.filter(a => {
    const code = (a.code || a.coin || '').toUpperCase();
    const q = pickerSearch.toLowerCase();
    return code.toLowerCase().includes(q) || (a.name || '').toLowerCase().includes(q);
  });

  const fmtBal = (v, code) => isFiat(code) ? v.toFixed(2) : (v < 0.001 ? v.toFixed(8) : v.toFixed(4));

  const isQuoteActive = ['quoted', 'refreshing'].includes(swapPhase);
  const isWorking = ['quoting', 'confirming', 'polling', 'refreshing'].includes(swapPhase);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b0e11] flex flex-col">
      {/* Header */}
      <div className="bg-[#161a1f] border-b border-[#2b3139] px-4 py-4 sm:px-6">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#f0b90b]/10 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-[#f0b90b]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Instant Swap</h1>
              <p className="text-[11px] text-[#848e9c]">Exchange crypto instantly at best rates</p>
            </div>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[#0ecb81]/10 rounded-lg">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0ecb81]" />
            <span className="text-[10px] font-bold text-[#0ecb81]">Secured</span>
          </div>
        </div>
      </div>

      {/* Popular pairs */}
      <div className="px-4 sm:px-6 pt-4">
        <div className="max-w-lg mx-auto flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {POPULAR_PAIRS.map(p => (
            <button key={`${p.from}-${p.to}`}
              onClick={() => { setFromCode(p.from); setToCode(p.to); handleNewSwap(); }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                fromCode === p.from && toCode === p.to
                  ? 'bg-[#f0b90b]/10 border-[#f0b90b]/40 text-[#f0b90b]'
                  : 'bg-[#161a1f] border-[#2b3139] text-[#848e9c] hover:text-white hover:border-[#848e9c]'
              }`}>
              {p.from}/{p.to}
            </button>
          ))}
        </div>
      </div>

      {/* Main card */}
      <div className="flex-1 flex items-start justify-center px-4 sm:px-6 pt-4 pb-8">
        <div className="w-full max-w-lg">

          {/* Completion screen */}
          {swapPhase === 'completed' && swapResult && (
            <div className="bg-[#161a1f] rounded-2xl border border-[#2b3139] p-6 text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-[#0ecb81]/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-[#0ecb81]" />
              </div>
              <h2 className="text-xl font-bold text-white">Swap {swapResult.status === 'initiated' ? 'Initiated' : 'Completed'}!</h2>
              <p className="text-sm text-[#848e9c]">
                {swapResult.status === 'initiated'
                  ? 'Your swap has been submitted. It may take a moment to settle.'
                  : `You swapped ${payAmount} ${fromCode} for ${receiveAmount} ${toCode}`}
              </p>
              <button onClick={handleNewSwap}
                className="w-full py-3 rounded-xl bg-[#f0b90b] text-[#0b0e11] font-bold text-sm hover:bg-[#f0b90b]/90 transition-colors">
                New Swap
              </button>
            </div>
          )}

          {/* Main swap form */}
          {swapPhase !== 'completed' && (
            <div className="space-y-3">
              {/* From */}
              <div className="bg-[#161a1f] rounded-2xl border border-[#2b3139] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#848e9c] uppercase">You Pay</span>
                  <span className="text-[11px] text-[#848e9c]">
                    Balance: <span className="text-white font-medium">{fmtBal(getBalance(fromCode), fromCode)} {fromCode}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    disabled={isQuoteActive || isWorking}
                    className="flex-1 bg-transparent text-2xl font-bold text-white placeholder-[#5e6673] focus:outline-none disabled:opacity-60"
                  />
                  <button onClick={() => openPicker('from')}
                    className="flex items-center gap-2 bg-[#2b3139] hover:bg-[#363d47] rounded-xl px-3 py-2 transition-colors">
                    <CoinIcon code={fromCode} size={24} />
                    <span className="text-sm font-bold text-white">{fromCode}</span>
                    <ChevronDown className="w-4 h-4 text-[#848e9c]" />
                  </button>
                </div>
                {/* Quick amount buttons */}
                <div className="flex gap-1.5">
                  {[25, 50, 75, 100].map(pct => (
                    <button key={pct}
                      onClick={() => setPayAmount((getBalance(fromCode) * pct / 100).toFixed(isFiat(fromCode) ? 2 : 6))}
                      disabled={isQuoteActive || isWorking}
                      className="flex-1 py-1 rounded-lg text-[10px] font-bold text-[#848e9c] bg-[#0b0e11] border border-[#2b3139] hover:text-[#f0b90b] hover:border-[#f0b90b]/40 transition-colors disabled:opacity-40">
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Flip button */}
              <div className="flex justify-center -my-1 relative z-10">
                <button onClick={handleFlip} disabled={isWorking}
                  className="w-10 h-10 rounded-full bg-[#2b3139] border-4 border-[#0b0e11] flex items-center justify-center hover:bg-[#363d47] transition-colors disabled:opacity-40">
                  <ArrowDown className="w-4 h-4 text-[#f0b90b]" />
                </button>
              </div>

              {/* To */}
              <div className="bg-[#161a1f] rounded-2xl border border-[#2b3139] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#848e9c] uppercase">You Receive</span>
                  <span className="text-[11px] text-[#848e9c]">
                    Balance: <span className="text-white font-medium">{fmtBal(getBalance(toCode), toCode)} {toCode}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-2xl font-bold text-white tabular-nums">
                    {loadingRate && !receiveAmount ? (
                      <span className="text-[#848e9c] animate-pulse">Calculating...</span>
                    ) : receiveAmount ? (
                      receiveAmount
                    ) : (
                      <span className="text-[#5e6673]">0.00</span>
                    )}
                  </div>
                  <button onClick={() => openPicker('to')}
                    className="flex items-center gap-2 bg-[#2b3139] hover:bg-[#363d47] rounded-xl px-3 py-2 transition-colors">
                    <CoinIcon code={toCode} size={24} />
                    <span className="text-sm font-bold text-white">{toCode}</span>
                    <ChevronDown className="w-4 h-4 text-[#848e9c]" />
                  </button>
                </div>
              </div>

              {/* Rate info */}
              {(previewRate || quotation) && (
                <div className="bg-[#161a1f] rounded-xl border border-[#2b3139] p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#848e9c]">Exchange Rate</span>
                    <span className="text-white font-medium">
                      1 {fromCode} = {quotation
                        ? (parseFloat(quotation.to_amount) / parseFloat(quotation.from_amount || payAmount)).toFixed(isFiat(toCode) ? 2 : 6)
                        : parseFloat(previewRate).toFixed(isFiat(toCode) ? 2 : 6)
                      } {toCode}
                    </span>
                  </div>
                  {isQuoteActive && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#848e9c]">Quote expires in</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-24 h-1.5 bg-[#2b3139] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${(countdownSecs / 15) * 100}%`,
                              backgroundColor: countdownSecs > 5 ? '#0ecb81' : countdownSecs > 2 ? '#f0b90b' : '#f6465d'
                            }} />
                        </div>
                        <span className={`font-bold tabular-nums ${countdownSecs > 5 ? 'text-[#0ecb81]' : countdownSecs > 2 ? 'text-[#f0b90b]' : 'text-[#f6465d]'}`}>
                          {countdownSecs}s
                        </span>
                        <button onClick={handleRefresh} disabled={isRefreshing}
                          className="p-1 rounded hover:bg-[#2b3139] transition-colors disabled:opacity-40">
                          <RefreshCw className={`w-3 h-3 text-[#848e9c] ${isRefreshing ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#848e9c]">Fee</span>
                    <span className="text-[#848e9c]">Included in rate</span>
                  </div>
                </div>
              )}

              {/* Error */}
              {(swapError) && (
                <div className="bg-[#f6465d]/10 border border-[#f6465d]/30 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-[#f6465d] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-[#f6465d]">{swapError}</p>
                  </div>
                  <button onClick={() => setSwapError(null)}><X className="w-3.5 h-3.5 text-[#f6465d]" /></button>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2">
                {swapPhase === 'idle' || swapPhase === 'failed' ? (
                  <button onClick={handleGetQuote}
                    disabled={!payAmount || parseFloat(payAmount) <= 0 || swapPhase === 'quoting'}
                    className="w-full py-3.5 rounded-xl bg-[#f0b90b] text-[#0b0e11] font-bold text-sm hover:bg-[#f0b90b]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {swapPhase === 'quoting' && <Loader2 className="w-4 h-4 animate-spin" />}
                    Get Quote
                  </button>
                ) : isQuoteActive ? (
                  <button onClick={handleConfirm}
                    className="w-full py-3.5 rounded-xl bg-[#0ecb81] text-white font-bold text-sm hover:bg-[#0ecb81]/90 transition-colors flex items-center justify-center gap-2">
                    Confirm Swap
                  </button>
                ) : swapPhase === 'quoting' ? (
                  <button disabled className="w-full py-3.5 rounded-xl bg-[#2b3139] text-[#848e9c] font-bold text-sm flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Getting Quote...
                  </button>
                ) : swapPhase === 'confirming' ? (
                  <button disabled className="w-full py-3.5 rounded-xl bg-[#2b3139] text-[#848e9c] font-bold text-sm flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Confirming Swap...
                  </button>
                ) : swapPhase === 'polling' ? (
                  <button disabled className="w-full py-3.5 rounded-xl bg-[#2b3139] text-[#848e9c] font-bold text-sm flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </button>
                ) : null}

                {isQuoteActive && (
                  <button onClick={handleNewSwap}
                    className="w-full py-2.5 rounded-xl bg-transparent border border-[#2b3139] text-[#848e9c] font-medium text-xs hover:text-white hover:border-[#848e9c] transition-colors">
                    Cancel
                  </button>
                )}
              </div>

              {/* Info footer */}
              <div className="flex items-center justify-center gap-2 py-2">
                <Clock className="w-3 h-3 text-[#848e9c]" />
                <span className="text-[10px] text-[#848e9c]">Swaps are executed instantly via Quidax liquidity</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Token Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={() => setShowPicker(false)}>
          <div className="bg-[#161a1f] border border-[#2b3139] rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[#2b3139] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Select {pickerSide === 'from' ? 'From' : 'To'} Token</h3>
              <button onClick={() => setShowPicker(false)}><X className="w-5 h-5 text-[#848e9c]" /></button>
            </div>
            <div className="p-4 border-b border-[#2b3139]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#848e9c]" />
                <input type="text" placeholder="Search token..." value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                  className="w-full bg-[#0b0e11] border border-[#2b3139] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#848e9c] focus:outline-none focus:border-[#f0b90b]" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredAssets.map(a => {
                const code = (a.code || a.coin || '').toUpperCase();
                const bal = getBalance(code);
                return (
                  <button key={code} onClick={() => selectToken(code)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#1e2329] transition-colors">
                    <CoinIcon code={code} size={32} />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold text-white">{code}</p>
                      <p className="text-[10px] text-[#848e9c]">{a.name || COIN_META[code]?.name || code}</p>
                    </div>
                    <span className="text-xs text-[#848e9c] tabular-nums">{fmtBal(bal, code)}</span>
                  </button>
                );
              })}
              {filteredAssets.length === 0 && (
                <p className="text-center text-[#848e9c] text-sm py-8">No tokens found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstantSwap;
