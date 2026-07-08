import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, XCircle, ArrowDownToLine, ArrowUpFromLine, Coins } from 'lucide-react';
import adminService from '../../services/adminService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const STATUS_TABS = ['PENDING', 'COMPLETED', 'FAILED'];

const RampQueue = () => {
    const [ramps, setRamps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('PENDING');
    const [busy, setBusy] = useState(null); // ramp id being actioned
    const [note, setNote] = useState('');

    useEffect(() => { load(); }, [status]);

    const load = async () => {
        setLoading(true);
        const res = await adminService.getRamps(status);
        if (res.success) setRamps(res.data?.data || res.data || []);
        setLoading(false);
    };

    const act = async (id, kind) => {
        setBusy(id); setNote('');
        const res = kind === 'confirm'
            ? await adminService.confirmRamp(id)
            : await adminService.failRamp(id, 'rejected_by_admin');
        setBusy(null);
        if (res.success) { setNote(`✓ ${kind === 'confirm' ? 'Confirmed' : 'Refunded'} ${id.slice(0, 8)}`); load(); }
        else setNote(res.error || 'Action failed');
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Coins className="w-6 h-6 text-indigo-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Crypto Ramp Settlement</h1>
                        <p className="text-sm text-gray-500">Confirm the settlement leg (send crypto / pay fiat), then credit the user.</p>
                    </div>
                </div>
                <button onClick={load} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="flex gap-2">
                {STATUS_TABS.map((s) => (
                    <button key={s} onClick={() => setStatus(s)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium ${status === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                        {s}
                    </button>
                ))}
            </div>

            {note && <div className="text-sm px-4 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300">{note}</div>}

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-indigo-500" /></div>
                ) : ramps.length === 0 ? (
                    <div className="text-center py-16 text-gray-500">No {status.toLowerCase()} ramps.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="text-left px-4 py-3">User</th>
                                    <th className="text-left px-4 py-3">Type</th>
                                    <th className="text-left px-4 py-3">Amount</th>
                                    <th className="text-left px-4 py-3">Settlement step</th>
                                    <th className="text-left px-4 py-3">Created</th>
                                    {status === 'PENDING' && <th className="text-right px-4 py-3">Action</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {ramps.map((r) => {
                                    const isBuy = r.type === 'crypto_onramp';
                                    const d = r.recipient_details || {};
                                    return (
                                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900 dark:text-white">{r.user_name || r.user_email}</div>
                                                <div className="text-xs text-gray-400">{d.mode} · {r.provider_txn_id?.slice(0, 10)}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${isBuy ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    {isBuy ? <ArrowDownToLine className="w-3 h-3" /> : <ArrowUpFromLine className="w-3 h-3" />}
                                                    {isBuy ? 'Buy' : 'Sell'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                                                {formatCurrency(r.amount, r.from_currency)} {r.from_currency}
                                                <div className="text-xs text-gray-400">→ {formatCurrency(r.converted_amount, r.to_currency)} {r.to_currency}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[240px]">
                                                {isBuy
                                                    ? (d.bankInfo ? `Pay ${r.from_currency} to ${d.bankInfo.name} ${d.bankInfo.accountNumber}` : 'Awaiting bank info')
                                                    : (d.walletAddress ? `Send ${r.from_currency} to ${d.walletAddress}` : 'Awaiting address')}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                                            {status === 'PENDING' && (
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => act(r.id, 'confirm')} disabled={busy === r.id}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium disabled:opacity-50">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
                                                        </button>
                                                        <button onClick={() => act(r.id, 'fail')} disabled={busy === r.id}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium disabled:opacity-50">
                                                            <XCircle className="w-3.5 h-3.5" /> Reject
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RampQueue;
