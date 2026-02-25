import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Send,
    Users,
    MessageSquare,
    DollarSign,
    History,
    CheckCircle2,
    AlertCircle,
    Info,
    RefreshCw
} from 'lucide-react';
import smsService from '../services/smsService';
import walletService from '../services/walletService';
import { formatCurrency, formatDateTime } from '../utils/formatters';

const BulkSMS = () => {
    const [recipients, setRecipients] = useState('');
    const [message, setMessage] = useState('');
    const [senderId, setSenderId] = useState('JAXOPAY');
    const [estimate, setEstimate] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [ngnBalance, setNgnBalance] = useState(0);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (recipients || message) {
            handleEstimate();
        } else {
            setEstimate(null);
        }
    }, [recipients, message]);

    const fetchData = async () => {
        const [historyRes, balanceRes] = await Promise.all([
            smsService.getSMSHistory(),
            walletService.getWalletByCurrency('NGN')
        ]);

        if (historyRes.success) setHistory(historyRes.data);
        if (balanceRes.success) setNgnBalance(balanceRes.data.balance);
    };

    const handleEstimate = async () => {
        const recipientList = recipients.split(/[\n,]/).map(r => r.trim()).filter(r => r);
        if (recipientList.length === 0 || !message) return;

        const result = await smsService.getEstimator({
            recipients: recipientList,
            message
        });
        if (result.success) setEstimate(result.data);
    };

    const handleSend = async (e) => {
        e.preventDefault();
        const recipientList = recipients.split(/[\n,]/).map(r => r.trim()).filter(r => r);

        if (recipientList.length === 0) return;

        setLoading(true);
        const result = await smsService.sendBulkSMS({
            recipients: recipientList,
            message,
            sender_id: senderId
        });

        if (result.success) {
            setRecipients('');
            setMessage('');
            fetchData();
            // Show success toast here if global toast exists
        } else {
            // Show error toast
        }
        setLoading(false);
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bulk SMS</h1>
                    <p className="text-gray-600 dark:text-gray-400">Reach thousands of people instantly</p>
                </div>
                <div className="bg-accent-50 dark:bg-accent-900/20 px-4 py-2 rounded-xl border border-accent-100 dark:border-accent-800 flex items-center gap-3">
                    <div className="p-2 bg-accent-100 dark:bg-accent-800 rounded-lg text-accent-600">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-xs text-accent-700 dark:text-accent-300 font-medium">NGN Balance</p>
                        <p className="text-lg font-bold text-accent-800 dark:text-white">{formatCurrency(ngnBalance, 'NGN')}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Compose Section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-accent-600" />
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Compose Message</h2>
                        </div>
                        <form onSubmit={handleSend} className="p-6 space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Recipients (Phone numbers separated by comma or new line)
                                </label>
                                <textarea
                                    value={recipients}
                                    onChange={(e) => setRecipients(e.target.value)}
                                    placeholder="+2348012345678, +2348087654321..."
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-accent-500 min-h-[120px]"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Sender ID
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={11}
                                        value={senderId}
                                        onChange={(e) => setSenderId(e.target.value)}
                                        placeholder="Max 11 characters"
                                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Message
                                    </label>
                                    <span className={`text-xs ${message.length > 160 ? 'text-orange-500' : 'text-gray-500'}`}>
                                        {message.length} chars ({Math.ceil(message.length / 160)} unit{Math.ceil(message.length / 160) !== 1 ? 's' : ''})
                                    </span>
                                </div>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Type your message here..."
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-primary-500 min-h-[150px]"
                                    required
                                />
                            </div>

                            {estimate && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 flex items-start gap-4">
                                    <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="font-bold text-blue-900 dark:text-blue-300">Order Summary</p>
                                        <p className="text-blue-700 dark:text-blue-400">
                                            Sending to {estimate.recipients} people ({estimate.units} units each).
                                            Total cost: <span className="font-bold">{formatCurrency(estimate.total_cost, 'NGN')}</span>
                                        </p>
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading || !ngnBalance || (estimate && ngnBalance < estimate.total_cost)}
                                className="w-full py-4 bg-accent-600 hover:bg-accent-700 text-white font-bold rounded-xl shadow-lg shadow-accent-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <>
                                        <RefreshCw className="w-5 h-5 animate-spin" />
                                        Processing Batch...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        Send Bulk SMS
                                    </>
                                )}
                            </button>
                            {estimate && ngnBalance < estimate.total_cost && (
                                <p className="text-center text-xs text-red-600 font-medium">Insufficient NGN balance to send this batch</p>
                            )}
                        </form>
                    </div>
                </div>

                {/* Info & Side Stats */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Guidelines</h3>
                        <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                            <li className="flex gap-2">
                                <CheckCircle2 className="w-4 h-4 text-accent-500 flex-shrink-0" />
                                Sender ID must not exceed 11 characters.
                            </li>
                            <li className="flex gap-2">
                                <CheckCircle2 className="w-4 h-4 text-accent-500 flex-shrink-0" />
                                1 SMS unit = 160 characters.
                            </li>
                            <li className="flex gap-2">
                                <CheckCircle2 className="w-4 h-4 text-primary-500 flex-shrink-0" />
                                Phone numbers should include country code (e.g. +234).
                            </li>
                            <li className="flex gap-2">
                                <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                Avoid using special characters to ensure deliverability.
                            </li>
                        </ul>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Recent Batches</h3>
                            <button onClick={fetchData} className="text-accent-600 hover:text-accent-700 text-sm font-medium">Refresh</button>
                        </div>
                        <div className="space-y-4">
                            {history.length === 0 ? (
                                <p className="text-sm text-gray-500 text-center py-4">No SMS history yet</p>
                            ) : (
                                history.map(batch => (
                                    <div key={batch.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{batch.total_recipients} Recipients</p>
                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${batch.status === 'completed' ? 'bg-accent-100 text-accent-700' : 'bg-yellow-100 text-yellow-700'
                                                }`}>
                                                {batch.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 line-clamp-1 mb-2">{batch.message}</p>
                                        <p className="text-[10px] text-gray-400">{formatDateTime(batch.created_at)}</p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkSMS;
