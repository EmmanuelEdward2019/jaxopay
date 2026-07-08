import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Coins, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, RefreshCw,
    CheckCircle2, AlertCircle, Wallet, Copy, Building2, ArrowRight,
} from 'lucide-react';
import fxService from '../../services/fxService';
import walletService from '../../services/walletService';
import kycService from '../../services/kycService';
import PinModal from '../../components/common/PinModal';
import { formatCurrency } from '../../utils/formatters';

const STABLECOINS = ['USDT', 'USDC'];

// Networks that work reliably (Yellow Card sandbox: TRON/TRC20 currently errors on deposits).
const RECOMMENDED_NETWORK = { USDT: 'POLYGON', USDC: 'POLYGON' };

const CryptoRamp = () => {
    const [gate, setGate] = useState(null);              // { country, required, verified }
    const [options, setOptions] = useState([]);          // [{ code, defaultNetwork, networks: [...] }]
    const [wallets, setWallets] = useState([]);
    const [payoutNetworks, setPayoutNetworks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState('buy');               // 'buy' | 'sell'
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);          // ramp submission result (instruction screen)

    // BVN/NIN capture
    const [idType, setIdType] = useState('nin');
    const [idNumber, setIdNumber] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [verifyMsg, setVerifyMsg] = useState('');

    // Buy (deposit) form
    const [buy, setBuy] = useState({ coin: 'USDT', network: 'POLYGON', fiatAmount: '', mode: 'internal', walletAddress: '' });
    // Sell (withdraw) form
    const [sell, setSell] = useState({ coin: 'USDT', network: 'POLYGON', cryptoAmount: '', mode: 'internal', recipientName: '', accountNumber: '', networkId: '' });

    // PIN
    const [showPin, setShowPin] = useState(false);
    const [pinError, setPinError] = useState('');
    const [pinProcessing, setPinProcessing] = useState(false);
    const [pendingAction, setPendingAction] = useState(null); // 'buy' | 'sell'

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        setLoading(true);
        const [s, o, w] = await Promise.all([
            fxService.getRampStatus().catch(() => null),
            fxService.getRampOptions('NGN').catch(() => null),
            walletService.getWallets().catch(() => null),
        ]);
        if (s?.success) setGate(s.data);
        if (o?.success) setOptions(o.data || []);
        if (w?.success) setWallets(w.data || []);
        // payout networks for external sell (bank list)
        try {
            const pn = await fxService.getPayoutNetworks('NG');
            if (pn?.success) setPayoutNetworks(pn.data || []);
        } catch { /* non-fatal */ }
        setLoading(false);
    };

    const balanceOf = (cur) => {
        const w = wallets.find((x) => String(x.currency).toUpperCase() === cur);
        return w ? parseFloat(w.balance || 0) : 0;
    };

    const networksFor = (coin) => {
        const opt = options.find((o) => String(o.code).toUpperCase() === coin);
        return (opt?.networks || []).map((n) => n.network);
    };

    // ── BVN/NIN verification ──
    const handleVerifyId = async () => {
        setVerifyMsg('');
        if (!/^\d{11}$/.test(idNumber.trim())) { setVerifyMsg('Enter a valid 11-digit ' + idType.toUpperCase() + '.'); return; }
        setVerifying(true);
        const res = await kycService.verifyRampId({ id_type: idType.toUpperCase(), id_number: idNumber.trim() });
        setVerifying(false);
        if (res.success) {
            setVerifyMsg('✓ Submitted. Re-checking your verification…');
            const s = await fxService.getRampStatus().catch(() => null);
            if (s?.success) setGate(s.data);
        } else {
            setVerifyMsg(res.error || 'Verification failed. Please check the number and try again.');
        }
    };

    // ── Submit ramp (opens PIN) ──
    const startBuy = () => {
        setError(null);
        if (!(parseFloat(buy.fiatAmount) > 0)) { setError('Enter an amount in NGN.'); return; }
        if (parseFloat(buy.fiatAmount) > balanceOf('NGN')) { setError('Insufficient NGN wallet balance.'); return; }
        if (buy.mode === 'external' && !buy.walletAddress.trim()) { setError('Enter the destination wallet address.'); return; }
        setPendingAction('buy'); setPinError(''); setShowPin(true);
    };
    const startSell = () => {
        setError(null);
        if (!(parseFloat(sell.cryptoAmount) > 0)) { setError('Enter an amount of ' + sell.coin + '.'); return; }
        if (parseFloat(sell.cryptoAmount) > balanceOf(sell.coin)) { setError('Insufficient ' + sell.coin + ' balance.'); return; }
        if (!sell.recipientName.trim() || !sell.accountNumber.trim() || !sell.networkId) { setError('Enter the recipient bank details.'); return; }
        setPendingAction('sell'); setPinError(''); setShowPin(true);
    };

    const runRamp = async (pin) => {
        setPinProcessing(true); setPinError('');
        try {
            let res;
            if (pendingAction === 'buy') {
                res = await fxService.rampDeposit({
                    cryptoCurrency: buy.coin, cryptoNetwork: buy.network, fiatAmount: parseFloat(buy.fiatAmount),
                    mode: buy.mode, fiatCurrency: 'NGN', country: 'NG',
                    walletAddress: buy.mode === 'external' ? buy.walletAddress.trim() : undefined, pin,
                });
            } else {
                const net = payoutNetworks.find((n) => (n.id || n.code) === sell.networkId);
                res = await fxService.rampWithdraw({
                    cryptoCurrency: sell.coin, cryptoNetwork: sell.network, cryptoAmount: parseFloat(sell.cryptoAmount),
                    mode: sell.mode, destinationCountry: 'NG', fiatCurrency: 'NGN',
                    recipientName: sell.recipientName.trim(), accountNumber: sell.accountNumber.trim(),
                    networkId: sell.networkId, networkName: net?.name, networkAccountType: net?.accountType, pin,
                });
            }
            if (res?.success) {
                setResult({ kind: pendingAction, ...res.data });
                setShowPin(false);
                loadAll();
            } else {
                setPinError(res?.error || res?.message || 'Transaction failed.');
            }
        } catch (e) {
            const msg = e?.response?.data?.message || e.message || 'Transaction failed.';
            if (e?.response?.data?.code === 'BVN_NIN_REQUIRED') {
                setShowPin(false);
                setGate((g) => ({ ...(g || {}), required: true, verified: false }));
            }
            setPinError(msg);
        } finally {
            setPinProcessing(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 animate-spin text-indigo-500" /></div>;
    }

    // ── Block screen: BVN/NIN required ──
    const blocked = gate?.required && !gate?.verified;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40"><Coins className="w-6 h-6 text-indigo-600 dark:text-indigo-300" /></div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Buy &amp; Sell Crypto</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400">USDT / USDC on-ramp &amp; off-ramp via Yellow Card</p>
                </div>
            </div>

            {blocked ? (
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-start gap-3 mb-4">
                        <ShieldCheck className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                            <h2 className="font-semibold text-gray-900 dark:text-white">Verify your BVN or NIN</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nigerian regulations require an identity check before you can buy or sell crypto. This is a one-time step.</p>
                        </div>
                    </div>
                    <div className="grid sm:grid-cols-[140px_1fr] gap-3">
                        <select value={idType} onChange={(e) => setIdType(e.target.value)}
                            className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm">
                            <option value="nin">NIN</option>
                            <option value="bvn">BVN</option>
                        </select>
                        <input value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                            inputMode="numeric" placeholder={`Enter your 11-digit ${idType.toUpperCase()}`}
                            className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm" />
                    </div>
                    {verifyMsg && <p className="text-sm mt-3 text-gray-600 dark:text-gray-300">{verifyMsg}</p>}
                    <button onClick={handleVerifyId} disabled={verifying}
                        className="mt-4 w-full sm:w-auto px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                        {verifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        {verifying ? 'Verifying…' : 'Verify & Continue'}
                    </button>
                    <p className="text-xs text-gray-400 mt-3">Missing your legal name? <Link to="/dashboard/profile" className="text-indigo-600 underline">Update your profile</Link> first.</p>
                </div>
            ) : result ? (
                <RampResult result={result} onDone={() => setResult(null)} />
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700">
                        <button onClick={() => { setTab('buy'); setError(null); }}
                            className={`flex-1 py-3.5 font-semibold text-sm flex items-center justify-center gap-2 ${tab === 'buy' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>
                            <ArrowDownToLine className="w-4 h-4" /> Buy (Deposit)
                        </button>
                        <button onClick={() => { setTab('sell'); setError(null); }}
                            className={`flex-1 py-3.5 font-semibold text-sm flex items-center justify-center gap-2 ${tab === 'sell' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500'}`}>
                            <ArrowUpFromLine className="w-4 h-4" /> Sell (Withdraw)
                        </button>
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Balances */}
                        <div className="flex flex-wrap gap-3 text-xs">
                            {['NGN', 'USDT', 'USDC'].map((c) => (
                                <span key={c} className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                                    <Wallet className="w-3.5 h-3.5" /> {formatCurrency(balanceOf(c), c)} {c}
                                </span>
                            ))}
                        </div>

                        {tab === 'buy' ? (
                            <>
                                <Field label="You pay (NGN)">
                                    <input type="number" value={buy.fiatAmount} onChange={(e) => setBuy({ ...buy, fiatAmount: e.target.value })}
                                        placeholder="0.00" className={inputCls} />
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Coin">
                                        <select value={buy.coin} onChange={(e) => setBuy({ ...buy, coin: e.target.value, network: RECOMMENDED_NETWORK[e.target.value] || 'POLYGON' })} className={inputCls}>
                                            {STABLECOINS.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Network">
                                        <select value={buy.network} onChange={(e) => setBuy({ ...buy, network: e.target.value })} className={inputCls}>
                                            {networksFor(buy.coin).map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                <ModeToggle value={buy.mode} onChange={(m) => setBuy({ ...buy, mode: m })}
                                    internalLabel="To my JAXOPAY wallet" externalLabel="To external wallet" />
                                {buy.mode === 'external' && (
                                    <Field label={`${buy.coin} wallet address (${buy.network})`}>
                                        <input value={buy.walletAddress} onChange={(e) => setBuy({ ...buy, walletAddress: e.target.value })}
                                            placeholder="Destination address" className={inputCls} />
                                    </Field>
                                )}
                                <button onClick={startBuy} className={primaryBtn}>
                                    Continue <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <>
                                <Field label={`You sell (${sell.coin})`}>
                                    <input type="number" value={sell.cryptoAmount} onChange={(e) => setSell({ ...sell, cryptoAmount: e.target.value })}
                                        placeholder="0.00" className={inputCls} />
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Coin">
                                        <select value={sell.coin} onChange={(e) => setSell({ ...sell, coin: e.target.value, network: RECOMMENDED_NETWORK[e.target.value] || 'POLYGON' })} className={inputCls}>
                                            {STABLECOINS.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Network">
                                        <select value={sell.network} onChange={(e) => setSell({ ...sell, network: e.target.value })} className={inputCls}>
                                            {networksFor(sell.coin).map((n) => <option key={n} value={n}>{n}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                <ModeToggle value={sell.mode} onChange={(m) => setSell({ ...sell, mode: m })}
                                    internalLabel="NGN to my wallet" externalLabel="NGN to a bank" />
                                <Field label="Recipient bank">
                                    <select value={sell.networkId} onChange={(e) => setSell({ ...sell, networkId: e.target.value })} className={inputCls}>
                                        <option value="">Select bank…</option>
                                        {payoutNetworks.map((n) => <option key={n.id || n.code} value={n.id || n.code}>{n.name}</option>)}
                                    </select>
                                </Field>
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Account number">
                                        <input value={sell.accountNumber} onChange={(e) => setSell({ ...sell, accountNumber: e.target.value })} className={inputCls} />
                                    </Field>
                                    <Field label="Account name">
                                        <input value={sell.recipientName} onChange={(e) => setSell({ ...sell, recipientName: e.target.value })} className={inputCls} />
                                    </Field>
                                </div>
                                <button onClick={startSell} className={primaryBtn}>
                                    Continue <ArrowRight className="w-4 h-4" />
                                </button>
                            </>
                        )}

                        {error && (
                            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <PinModal
                open={showPin}
                onClose={() => { setShowPin(false); setPinError(''); }}
                onConfirm={runRamp}
                processing={pinProcessing}
                errorMessage={pinError}
                title={pendingAction === 'buy' ? 'Authorize Crypto Purchase' : 'Authorize Crypto Sale'}
                description="Enter your 4-digit PIN to authorize this transaction."
            />
        </div>
    );
};

const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm text-gray-900 dark:text-white';
const primaryBtn = 'w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2';

const Field = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{label}</label>
        {children}
    </div>
);

const ModeToggle = ({ value, onChange, internalLabel, externalLabel }) => (
    <div className="grid grid-cols-2 gap-2">
        {[['internal', internalLabel], ['external', externalLabel]].map(([m, label]) => (
            <button key={m} onClick={() => onChange(m)} type="button"
                className={`py-2.5 rounded-lg text-sm font-medium border ${value === m ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                {label}
            </button>
        ))}
    </div>
);

const RampResult = ({ result, onDone }) => {
    const isBuy = result.kind === 'buy';
    const copy = (t) => navigator.clipboard?.writeText(t);
    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 space-y-4">
            <div className="flex items-center gap-3">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <div>
                    <h2 className="font-semibold text-gray-900 dark:text-white">Request submitted</h2>
                    <p className="text-sm text-gray-500">Status: {result.status} · awaiting settlement</p>
                </div>
            </div>

            {isBuy && result.bankInfo && (
                <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2"><Building2 className="w-4 h-4" /> Pay {formatCurrency(result.fiatAmount, 'NGN')} NGN to:</p>
                    <Row label="Bank" value={result.bankInfo.name} />
                    <Row label="Account" value={result.bankInfo.accountNumber} onCopy={() => copy(result.bankInfo.accountNumber)} />
                    <Row label="Name" value={result.bankInfo.accountName} />
                    <p className="text-xs text-gray-500 pt-1">You'll receive ≈ {result.cryptoAmount} {result.cryptoCurrency}{result.mode === 'internal' ? ' in your JAXOPAY wallet' : ' at your wallet address'} once confirmed.</p>
                </div>
            )}

            {!isBuy && result.walletAddress && (
                <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Send {result.cryptoAmount} {result.cryptoCurrency} ({result.cryptoNetwork}) to:</p>
                    <Row label="Address" value={result.walletAddress} onCopy={() => copy(result.walletAddress)} />
                    <p className="text-xs text-gray-500 pt-1">You'll receive ≈ {formatCurrency(result.convertedFiat, 'NGN')} NGN{result.mode === 'internal' ? ' in your JAXOPAY wallet' : ' to the bank account'} once confirmed.</p>
                </div>
            )}

            <button onClick={onDone} className={primaryBtn}>Done</button>
        </div>
    );
};

const Row = ({ label, value, onCopy }) => (
    <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            {value}
            {onCopy && <button onClick={onCopy}><Copy className="w-3.5 h-3.5 text-gray-400 hover:text-indigo-600" /></button>}
        </span>
    </div>
);

export default CryptoRamp;
