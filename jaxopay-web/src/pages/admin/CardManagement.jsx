import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    CreditCard,
    Search,
    RefreshCw,
    ChevronLeft,
    ChevronRight,
    User,
    Shield,
    Lock,
    Unlock,
    Trash2,
    CheckCircle,
    XCircle
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const CardManagement = () => {
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        user_id: ''
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
    const [actionLoading, setActionLoading] = useState(null);

    useEffect(() => {
        fetchCards();
    }, [pagination.page, filters]);

    const fetchCards = async () => {
        setLoading(true);
        const result = await adminService.getAllCards({
            page: pagination.page,
            limit: pagination.limit,
            ...filters
        });
        if (result.success) {
            setCards(result.data.cards);
            setPagination(prev => ({ ...prev, total: result.data.pagination.total }));
        }
        setLoading(false);
    };

    const handleUpdateStatus = async (cardId, status) => {
        setActionLoading(cardId);
        const result = await adminService.updateCardStatus(cardId, status);
        if (result.success) {
            fetchCards(); // Refresh list to reflect new status
        } else {
            alert('Failed to update card status: ' + result.error);
        }
        setActionLoading(null);
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Virtual Card Registry</h1>
                    <p className="text-gray-600 dark:text-gray-400">Oversee all issued virtual cards and their performance</p>
                </div>
                <button
                    onClick={fetchCards}
                    className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 transition-colors"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        name="user_id"
                        placeholder="Search by User ID..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                        value={filters.user_id}
                        onChange={handleFilterChange}
                    />
                </div>
                <select
                    name="status"
                    className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 text-sm md:w-48"
                    value={filters.status}
                    onChange={handleFilterChange}
                >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="frozen">Frozen</option>
                    <option value="terminated">Terminated</option>
                </select>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Card & Owner</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Provider</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Balance</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Daily Limit</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase">Expiry</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {cards.map((card) => (
                                <tr key={card.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600">
                                                <CreditCard className="w-5 h-5" />
                                            </div>
                                            <div className="text-sm">
                                                <p className="font-medium text-gray-900 dark:text-white">**** {card.last_four || card.card_last_four}</p>
                                                <p className="text-gray-500 text-xs">{card.user_email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase">{card.card_brand || 'VISA'}</span>
                                    </td>
                                    <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                                        {formatCurrency(card.balance, card.currency || 'USD')}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                        {formatCurrency(card.spending_limit || card.spending_limit_daily, card.currency || 'USD')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${card.status === 'active'
                                            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                                            : card.status === 'frozen'
                                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400'
                                                : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                                            }`}>
                                            {card.status === 'active' && <CheckCircle className="w-3 h-3" />}
                                            {card.status === 'frozen' && <Lock className="w-3 h-3" />}
                                            {card.status === 'terminated' && <XCircle className="w-3 h-3" />}
                                            <span className="capitalize">{card.status}</span>
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {card.expiry_month}/{card.expiry_year}
                                    </td>
                                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                        <button
                                            onClick={() => handleUpdateStatus(card.id, card.status === 'frozen' ? 'active' : 'frozen')}
                                            disabled={actionLoading === card.id || card.status === 'terminated'}
                                            className={`p-2 rounded-lg transition-colors ${card.status === 'frozen'
                                                ? 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400'
                                                : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400'
                                                } ${card.status === 'terminated' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            title={card.status === 'frozen' ? 'Unfreeze Card' : 'Freeze Card'}
                                        >
                                            {actionLoading === card.id ? (
                                                <RefreshCw className="w-4 h-4 animate-spin" />
                                            ) : card.status === 'frozen' ? (
                                                <Unlock className="w-4 h-4" />
                                            ) : (
                                                <Lock className="w-4 h-4" />
                                            )}
                                        </button>
                                        <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500">
                                            <Shield className="w-4 h-4" title="Audit Trail" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/30 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                        Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} cards
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            disabled={pagination.page === 1}
                            className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            disabled={pagination.page >= totalPages}
                            className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-50"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CardManagement;
