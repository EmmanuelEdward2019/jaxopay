import { useState, useEffect, useRef } from 'react';
import QRCodeSVG from 'react-qr-code';
import {
  ArrowDownLeft, ArrowUpRight, RefreshCw, Copy, Check,
  AlertCircle, Info, ChevronDown, X
} from 'lucide-react';
import cryptoService from '../../services/cryptoService';

const STATIC_NETWORKS = {
  BTC:  [{ network: 'btc',   name: 'Bitcoin',            isDefault: true }],
  ETH:  [{ network: 'erc20', name: 'Ethereum (ERC20)',   isDefault: true }],
  USDT: [
    { network: 'trc20', name: 'TRON (TRC20)',            isDefault: true },
    { network: 'erc20', name: 'Ethereum (ERC20)',        isDefault: false },
    { network: 'bep20', name: 'BNB Smart Chain (BEP20)', isDefault: false },
  ],
  USDC: [
    { network: 'erc20', name: 'Ethereum (ERC20)',        isDefault: true },
    { network: 'trc20', name: 'TRON (TRC20)',            isDefault: false },
  ],
  SOL:  [{ network: 'sol',   name: 'Solana',             isDefault: true }],
  BNB:  [{ network: 'bep20', name: 'BNB Smart Chain',    isDefault: true }],
  TRX:  [{ network: 'trc20', name: 'TRON',               isDefault: true }],
  XRP:  [{ network: 'xrp',   name: 'XRP Ledger',         isDefault: true }],
  DOGE: [{ network: 'doge',  name: 'Dogecoin',           isDefault: true }],
  LTC:  [{ network: 'ltc',   name: 'Litecoin',           isDefault: true }],
};

const CryptoDepositWithdraw = ({ coin = 'USDT', balances = {} }) => {
  const [mode, setMode] = useState('deposit'); // deposit | withdraw
  const [network, setNetwork] = useState('');
  const [networks, setNetworks] = useState([]);
  const [copied, setCopied] = useState('');

  // Deposit state
  const [depositAddress, setDepositAddress] = useState(null);
  const [depositMemo, setDepositMemo] = useState(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositPending, setDepositPending] = useState(false);
  const [depositError, setDepositError] = useState(null);
  const retryRef = useRef(0);
  const retryTimer = useRef(null);

  // Withdraw state
  const [withdrawAddr, setWithdrawAddr] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawMemo, setWithdrawMemo] = useState('');
  const [withdrawFee, setWithdrawFee] = useState(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState(null);
  const [fetchingFee, setFetchingFee] = useState(false);

  const coinUp = coin.toUpperCase();
  const balance = balances[coinUp] || balances[coin?.toLowerCase()] || 0;

  // Fetch networks when coin changes
  useEffect(() => {
    let cancelled = false;
    setNetworks([]);
    setNetwork('');
    setDepositAddress(null);
    setDepositMemo(null);
    setDepositError(null);

    const load = async () => {
      try {
        const res = await cryptoService.getNetworks(coin);
        if (cancelled) return;
        if (res.success && res.data?.networks?.length > 0) {
          const nets = res.data.networks;
          setNetworks(nets);
          const def = nets.find(n => n.isDefault) || nets[0];
          setNetwork(def?.network || '');
          return;
        }
      } catch {}
      if (!cancelled) {
        const fallback = STATIC_NETWORKS[coinUp] || [{ network: coinUp.toLowerCase(), name: coinUp, isDefault: true }];
        setNetworks(fallback);
        const def = fallback.find(n => n.isDefault) || fallback[0];
        setNetwork(def?.network || '');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [coin]);

  // Auto-fetch deposit address when network selected in deposit mode
  useEffect(() => {
    if (mode !== 'deposit' || !network || !coin) return;
    retryRef.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);

    let cancelled = false;

    const fetchAddr = async () => {
      if (cancelled) return;
      setDepositLoading(true);
      setDepositError(null);
      try {
        const res = await cryptoService.getDepositAddress(coin.toLowerCase(), network);
        if (cancelled) return;
        if (res.success && res.data?.address) {
          setDepositAddress(res.data.address);
          setDepositMemo(res.data.memo || null);
          setDepositPending(false);
        } else if (res.pending) {
          setDepositPending(true);
          setDepositAddress(null);
          if (retryRef.current < 12) {
            retryRef.current += 1;
            retryTimer.current = setTimeout(fetchAddr, 5000);
          } else {
            setDepositPending(false);
            setDepositError('Address generation is taking too long. Please try again.');
          }
        } else {
          setDepositPending(false);
          setDepositError(res.error || 'Could not get deposit address.');
        }
      } catch (e) {
        if (!cancelled) { setDepositPending(false); setDepositError(e.message); }
      }
      if (!cancelled) setDepositLoading(false);
    };

    fetchAddr();
    return () => { cancelled = true; if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [mode, network, coin]);

  // Fetch withdraw fee
  useEffect(() => {
    if (mode !== 'withdraw' || !network || !coin) return;
    let cancelled = false;
    setFetchingFee(true);
    cryptoService.getWithdrawFee(coin.toLowerCase(), network).then(res => {
      if (cancelled) return;
      if (res.success) setWithdrawFee(parseFloat(res.data?.fee || 0));
      else setWithdrawFee(null);
    }).catch(() => { if (!cancelled) setWithdrawFee(null); })
      .finally(() => { if (!cancelled) setFetchingFee(false); });
    return () => { cancelled = true; };
  }, [mode, network, coin]);

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const handleWithdraw = async () => {
    if (!withdrawAddr || !withdrawAmount || !network) {
      setWithdrawError('Fill in all required fields.');
      return;
    }
    if (parseFloat(withdrawAmount) <= 0) {
      setWithdrawError('Amount must be greater than 0.');
      return;
    }
    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);
    try {
      const res = await cryptoService.withdraw({
        coin: coin.toLowerCase(),
        address: withdrawAddr,
        amount: parseFloat(withdrawAmount),
        network,
        memo: withdrawMemo || undefined,
      });
      if (res.success) {
        setWithdrawSuccess('Withdrawal submitted successfully!');
        setWithdrawAddr('');
        setWithdrawAmount('');
        setWithdrawMemo('');
      } else {
        setWithdrawError(res.error || 'Withdrawal failed.');
      }
    } catch (e) {
      setWithdrawError(e.message || 'Withdrawal failed.');
    }
    setWithdrawLoading(false);
  };

  const netReceive = withdrawAmount && withdrawFee != null
    ? Math.max(0, parseFloat(withdrawAmount) - withdrawFee)
    : null;

  return (
    <div className="flex flex-col h-full bg-[#161a1f]">
      {/* Mode tabs */}
      <div className="flex border-b border-[#2b3139]">
        <button onClick={() => { setMode('deposit'); setWithdrawError(null); setWithdrawSuccess(null); }}
          className={`flex-1 py-3 text-[11px] font-black uppercase flex items-center justify-center gap-1.5 transition-all border-b-2 ${
            mode === 'deposit' ? 'text-[#0ecb81] border-[#0ecb81] bg-[#0ecb81]/5' : 'text-[#848e9c] border-transparent hover:text-[#0ecb81]'
          }`}>
          <ArrowDownLeft className="w-3.5 h-3.5" /> Deposit
        </button>
        <button onClick={() => { setMode('withdraw'); setDepositError(null); }}
          className={`flex-1 py-3 text-[11px] font-black uppercase flex items-center justify-center gap-1.5 transition-all border-b-2 ${
            mode === 'withdraw' ? 'text-[#f6465d] border-[#f6465d] bg-[#f6465d]/5' : 'text-[#848e9c] border-transparent hover:text-[#f6465d]'
          }`}>
          <ArrowUpRight className="w-3.5 h-3.5" /> Withdraw
        </button>
      </div>

      <div className="p-3 flex-1 overflow-y-auto space-y-3">
        {/* Coin + Network */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black text-[#848e9c] uppercase">Coin</span>
            <span className="text-[11px] text-white font-bold">{coinUp}</span>
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-black text-[#848e9c] uppercase">Network</span>
            <select value={network} onChange={e => setNetwork(e.target.value)}
              className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg text-xs text-white focus:outline-none focus:border-[#f0b90b]">
              {networks.map(n => (
                <option key={n.network} value={n.network}>{n.name || n.network}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Balance */}
        <div className="flex items-center justify-between py-2 px-3 bg-[#0b0e11] rounded-lg border border-[#2b3139]">
          <span className="text-[9px] font-black text-[#848e9c] uppercase">Available</span>
          <span className="text-xs text-white font-bold tabular-nums">{parseFloat(balance).toFixed(6)} {coinUp}</span>
        </div>

        {/* ── DEPOSIT ─────────────────────────────────────── */}
        {mode === 'deposit' && (
          <div className="space-y-3">
            {depositPending && (
              <div className="text-center py-4 space-y-2">
                <RefreshCw className="w-6 h-6 text-[#f0b90b] animate-spin mx-auto" />
                <p className="text-[11px] text-white font-bold">Generating address...</p>
                <p className="text-[9px] text-[#848e9c]">Attempt {retryRef.current}/12</p>
              </div>
            )}

            {depositLoading && !depositPending && (
              <div className="flex justify-center py-4">
                <RefreshCw className="w-5 h-5 text-[#f0b90b] animate-spin" />
              </div>
            )}

            {depositError && (
              <div className="p-2 bg-[#f6465d]/10 border border-[#f6465d]/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#f6465d] shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#f6465d] flex-1">{depositError}</p>
              </div>
            )}

            {depositAddress && !depositPending && (
              <div className="space-y-3 animate-in fade-in">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-xl">
                    <QRCodeSVG value={depositAddress} size={120} />
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1">
                  <span className="text-[9px] font-black text-[#848e9c] uppercase">Deposit Address</span>
                  <div className="flex items-center gap-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg p-2">
                    <code className="text-[10px] text-white font-mono break-all flex-1">{depositAddress}</code>
                    <button onClick={() => handleCopy(depositAddress, 'addr')}
                      className="p-1.5 rounded hover:bg-[#2b3139] transition-colors shrink-0">
                      {copied === 'addr' ? <Check className="w-3.5 h-3.5 text-[#0ecb81]" /> : <Copy className="w-3.5 h-3.5 text-[#848e9c]" />}
                    </button>
                  </div>
                </div>

                {/* Memo */}
                {depositMemo && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-[#f6465d] uppercase">Memo / Tag (Required)</span>
                    <div className="flex items-center gap-2 bg-[#0b0e11] border border-[#f6465d]/40 rounded-lg p-2">
                      <code className="text-xs text-white font-mono flex-1">{depositMemo}</code>
                      <button onClick={() => handleCopy(depositMemo, 'memo')}
                        className="p-1.5 rounded hover:bg-[#2b3139] transition-colors shrink-0">
                        {copied === 'memo' ? <Check className="w-3.5 h-3.5 text-[#0ecb81]" /> : <Copy className="w-3.5 h-3.5 text-[#848e9c]" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Warning */}
                <div className="p-2 bg-[#f0b90b]/5 border border-[#f0b90b]/20 rounded-lg">
                  <p className="text-[9px] text-[#f0b90b] leading-relaxed">
                    Only send <span className="font-bold">{coinUp}</span> via <span className="font-bold">{network}</span> network. Wrong network = permanent loss.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── WITHDRAW ────────────────────────────────────── */}
        {mode === 'withdraw' && (
          <div className="space-y-3">
            {/* Address */}
            <div className="space-y-1">
              <span className="text-[9px] font-black text-[#848e9c] uppercase">Recipient Address</span>
              <input type="text" placeholder="Paste address" value={withdrawAddr}
                onChange={e => setWithdrawAddr(e.target.value)}
                className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg text-xs text-white placeholder-[#5e6673] focus:outline-none focus:border-[#f0b90b]" />
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-[#848e9c] uppercase">Amount</span>
                <button onClick={() => setWithdrawAmount(String(balance))}
                  className="text-[9px] text-[#f0b90b] font-bold hover:underline">MAX</button>
              </div>
              <input type="number" placeholder="0.00" value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg text-xs text-white placeholder-[#5e6673] focus:outline-none focus:border-[#f0b90b]" />
            </div>

            {/* Memo (optional) */}
            <div className="space-y-1">
              <span className="text-[9px] font-black text-[#848e9c] uppercase">Memo / Tag (if required)</span>
              <input type="text" placeholder="Optional" value={withdrawMemo}
                onChange={e => setWithdrawMemo(e.target.value)}
                className="w-full px-3 py-2 bg-[#0b0e11] border border-[#2b3139] rounded-lg text-xs text-white placeholder-[#5e6673] focus:outline-none focus:border-[#f0b90b]" />
            </div>

            {/* Fee info */}
            <div className="space-y-1 py-2 border-t border-[#2b3139]">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[#848e9c]">Network Fee</span>
                <span className="text-white font-medium tabular-nums">
                  {fetchingFee ? '...' : withdrawFee != null ? `${withdrawFee} ${coinUp}` : '—'}
                </span>
              </div>
              {netReceive != null && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-[#848e9c]">You Receive</span>
                  <span className="text-[#0ecb81] font-bold tabular-nums">{netReceive.toFixed(6)} {coinUp}</span>
                </div>
              )}
            </div>

            {/* Errors / Success */}
            {withdrawError && (
              <div className="p-2 bg-[#f6465d]/10 border border-[#f6465d]/30 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-[#f6465d] shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#f6465d] flex-1">{withdrawError}</p>
                <button onClick={() => setWithdrawError(null)}><X className="w-3 h-3 text-[#f6465d]" /></button>
              </div>
            )}
            {withdrawSuccess && (
              <div className="p-2 bg-[#0ecb81]/10 border border-[#0ecb81]/30 rounded-lg flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-[#0ecb81] shrink-0 mt-0.5" />
                <p className="text-[10px] text-[#0ecb81] flex-1">{withdrawSuccess}</p>
              </div>
            )}

            {/* Submit */}
            <button onClick={handleWithdraw}
              disabled={withdrawLoading || !withdrawAddr || !withdrawAmount || !network}
              className="w-full py-2.5 rounded-lg bg-[#f6465d] hover:bg-[#f6465d]/90 text-white font-black text-[11px] uppercase disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors">
              {withdrawLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><ArrowUpRight className="w-3.5 h-3.5" /> Withdraw {coinUp}</>}
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-[#0b0e11] border-t border-[#2b3139] flex items-center gap-2">
        <Info className="w-3 h-3 text-[#848e9c]" />
        <span className="text-[8px] text-[#848e9c] font-bold uppercase tracking-wider">
          {mode === 'deposit' ? 'Deposits are free | Confirmations required' : 'Withdrawal fees apply'}
        </span>
      </div>
    </div>
  );
};

export default CryptoDepositWithdraw;
