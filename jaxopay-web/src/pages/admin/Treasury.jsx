import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Landmark,
    RefreshCw,
    TrendingUp,
    Users,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Clock,
    Info,
    ArrowDownLeft,
    ArrowUpRight,
    ListTree,
} from 'lucide-react';
import adminService from '../../services/adminService';

const fmt = (amount, currency) => {
    const n = Number(amount) || 0;
    return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
};

const StatusBadge = ({ status }) => {
    const map = {
        ok: { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'Connected' },
        error: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: 'Unavailable' },
        unavailable: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300', label: 'No API' },
    };
    const s = map[status] || map.unavailable;
    return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
};

const Treasury = () => {
    const [data, setData] = useState(null);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const [treasury, ledger] = await Promise.all([
            adminService.getTreasury(),
            adminService.getFundMovements({ limit: 25 }),
        ]);
        if (treasury.success) {
            setData(treasury.data?.data || treasury.data);
        } else {
            setError(treasury.error || 'Failed to load treasury data');
        }
        if (ledger.success) {
            const payload = ledger.data?.data || ledger.data;
            setMovements(payload?.movements || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const coverage = (data?.coverage || []).filter((c) => c.float !== 0 || c.liabilities !== 0);
    const providers = data?.providers || [];
    const liabilities = data?.liabilities || [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Landmark className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Treasury &amp; Reconciliation</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Provider float (assets) vs. user balances (liabilities)
                            {data?.generatedAt && (
                                <span className="inline-flex items-center gap-1 ml-2">
                                    <Clock className="w-3.5 h-3.5" /> Updated {new Date(data.generatedAt).toLocaleString()}
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </button>
            </div>

            {/* Plain-English explainer */}
            <div className="p-4 sm:p-5 bg-blue-50 dark:bg-blue-900/15 border border-blue-100 dark:border-blue-900/40 rounded-2xl flex gap-3">
                <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1.5">
                    <p><span className="font-semibold text-gray-900 dark:text-white">Float</span> = the actual money your platform holds at each provider (Korapay, Quidax, etc.). This is your cash on hand.</p>
                    <p><span className="font-semibold text-gray-900 dark:text-white">Liabilities</span> = the total balance you owe your users (the sum of their wallets).</p>
                    <p><span className="font-semibold text-gray-900 dark:text-white">Coverage</span> = Float − Liabilities. It must stay <span className="text-emerald-600 font-semibold">positive</span> for every currency — that means you hold enough to cover everything your users could withdraw.</p>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                    <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                </div>
            )}

            {loading && !data ? (
                <div className="flex items-center justify-center py-24">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                </div>
            ) : (
                <>
                    {/* Coverage summary */}
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Coverage by currency</h2>
                        <p className="text-xs text-gray-400 mb-3">Green = you hold enough float to cover what users are owed. Red = shortfall, move funds into that provider.</p>
                        {coverage.length === 0 ? (
                            <p className="text-sm text-gray-500">No balances to display.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {coverage.map((c) => (
                                    <motion.div
                                        key={c.currency}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`p-5 rounded-2xl border bg-white dark:bg-gray-800 ${c.covered ? 'border-gray-200 dark:border-gray-700' : 'border-red-300 dark:border-red-800'}`}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="font-bold text-gray-900 dark:text-white">{c.currency}</span>
                                            {c.covered
                                                ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                : <XCircle className="w-5 h-5 text-red-500" />}
                                        </div>
                                        <div className="space-y-1.5 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> Float</span>
                                                <span className="font-medium text-gray-900 dark:text-white">{fmt(c.float, c.currency)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500 dark:text-gray-400 inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Liabilities</span>
                                                <span className="font-medium text-gray-900 dark:text-white">{fmt(c.liabilities, c.currency)}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                                                <span className="text-gray-600 dark:text-gray-300 font-semibold">Coverage</span>
                                                <span className={`font-bold ${c.covered ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(c.difference, c.currency)}</span>
                                            </div>
                                            <p className={`text-xs font-medium ${c.covered ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {c.covered ? '✓ Fully funded' : '⚠ Shortfall — top up provider float'}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Provider float */}
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Provider float (assets)</h2>
                        <p className="text-xs text-gray-400 mb-3">Live cash balances at each provider. "Unavailable" means the provider's balance API isn't reachable or configured.</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {providers.map((p) => (
                                <div key={p.key} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="font-semibold text-gray-900 dark:text-white">{p.label}</h3>
                                        <StatusBadge status={p.status} />
                                    </div>
                                    {p.status === 'ok' && p.balances.length > 0 ? (
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="text-left text-gray-400">
                                                    <th className="font-medium pb-2">Currency</th>
                                                    <th className="font-medium pb-2 text-right">Available</th>
                                                    <th className="font-medium pb-2 text-right">Pending</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {p.balances.map((b) => (
                                                    <tr key={b.currency} className="border-t border-gray-100 dark:border-gray-700">
                                                        <td className="py-2 font-medium text-gray-900 dark:text-white">{b.currency}</td>
                                                        <td className="py-2 text-right text-gray-700 dark:text-gray-300">{Number(b.available).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                                                        <td className="py-2 text-right text-gray-500">{Number(b.pending).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    ) : (
                                        <p className="text-sm text-gray-400">{p.error || p.note || 'No balances available.'}</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Liabilities */}
                    <div>
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">User liabilities (what we owe users)</h2>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-400 bg-gray-50 dark:bg-gray-900/40">
                                        <th className="font-medium px-5 py-3">Currency</th>
                                        <th className="font-medium px-5 py-3">Type</th>
                                        <th className="font-medium px-5 py-3 text-right">Total owed</th>
                                        <th className="font-medium px-5 py-3 text-right">Wallets</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {liabilities.filter((l) => Number(l.total) !== 0).length === 0 ? (
                                        <tr><td colSpan={4} className="px-5 py-6 text-center text-gray-400">No outstanding balances.</td></tr>
                                    ) : (
                                        liabilities.filter((l) => Number(l.total) !== 0).map((l) => (
                                            <tr key={`${l.currency}-${l.type}`} className="border-t border-gray-100 dark:border-gray-700">
                                                <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{l.currency}</td>
                                                <td className="px-5 py-3 capitalize text-gray-500">{l.type}</td>
                                                <td className="px-5 py-3 text-right text-gray-900 dark:text-white font-medium">{Number(l.total).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                                                <td className="px-5 py-3 text-right text-gray-500">{l.wallets}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Fund movements (internal ledger) */}
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <ListTree className="w-4 h-4 text-gray-400" />
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Recent fund movements</h2>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">Every recorded debit/credit in the internal ledger, newest first. Each transfer of funds appears as a matching debit and credit.</p>
                        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[640px]">
                                    <thead>
                                        <tr className="text-left text-gray-400 bg-gray-50 dark:bg-gray-900/40">
                                            <th className="font-medium px-5 py-3">Date</th>
                                            <th className="font-medium px-5 py-3">Account</th>
                                            <th className="font-medium px-5 py-3">Movement</th>
                                            <th className="font-medium px-5 py-3 text-right">Amount</th>
                                            <th className="font-medium px-5 py-3 text-right">Balance after</th>
                                            <th className="font-medium px-5 py-3">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.length === 0 ? (
                                            <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400">No fund movements recorded yet.</td></tr>
                                        ) : (
                                            movements.map((m) => {
                                                const isCredit = m.type === 'credit';
                                                return (
                                                    <tr key={m.id} className="border-t border-gray-100 dark:border-gray-700">
                                                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{new Date(m.date).toLocaleString()}</td>
                                                        <td className="px-5 py-3 text-gray-900 dark:text-white">{m.account}</td>
                                                        <td className="px-5 py-3">
                                                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${isCredit ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                                                {isCredit ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                                                                {isCredit ? 'Money in' : 'Money out'}
                                                            </span>
                                                        </td>
                                                        <td className={`px-5 py-3 text-right font-medium ${isCredit ? 'text-emerald-600' : 'text-gray-900 dark:text-white'}`}>
                                                            {isCredit ? '+' : '−'}{Number(m.amount).toLocaleString(undefined, { maximumFractionDigits: 8 })} {m.currency}
                                                        </td>
                                                        <td className="px-5 py-3 text-right text-gray-500">{Number(m.balanceAfter).toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                                                        <td className="px-5 py-3 text-gray-500 max-w-[220px] truncate" title={m.description}>{m.description || '—'}</td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Treasury;
