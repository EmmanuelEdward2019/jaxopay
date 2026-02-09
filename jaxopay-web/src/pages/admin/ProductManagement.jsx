import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    Activity,
    Search,
    RefreshCw,
    TrendingUp,
    Gift,
    Plane,
    MessageSquare,
    Eye,
    Filter,
    CheckCircle,
    XCircle,
    Clock
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const ProductManagement = () => {
    const location = useLocation();
    const [pageTitle, setPageTitle] = useState('');
    const [productType, setProductType] = useState('');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ status: '', user: '' });

    useEffect(() => {
        const path = location.pathname;
        if (path.includes('crypto')) {
            setPageTitle('Crypto Asset Management');
            setProductType('crypto');
        } else if (path.includes('giftcards')) {
            setPageTitle('Gift Card Trade Registry');
            setProductType('gift_card');
        } else if (path.includes('flights')) {
            setPageTitle('Flight Booking Monitor');
            setProductType('flight');
        } else if (path.includes('sms')) {
            setPageTitle('System SMS Logs');
            setProductType('bulk_sms');
        }
    }, [location]);

    useEffect(() => {
        if (productType) {
            fetchProductData();
        }
    }, [productType, filters]);

    const fetchProductData = async () => {
        setLoading(true);
        // We use the general transaction monitor with product type filter
        const result = await adminService.getTransactions({
            page: 1,
            limit: 50,
            type: productType,
            status: filters.status || undefined,
        });

        if (result.success) {
            setItems(result.data.transactions || []);
        }
        setLoading(false);
    };

    const getStatusStyle = (status) => {
        switch (status?.toLowerCase()) {
            case 'completed': return 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400';
            case 'pending': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
            case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
            default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400';
        }
    };

    const getProductIcon = () => {
        switch (productType) {
            case 'crypto': return <TrendingUp className="w-6 h-6 text-orange-500" />;
            case 'gift_card': return <Gift className="w-6 h-6 text-purple-500" />;
            case 'flight': return <Plane className="w-6 h-6 text-blue-500" />;
            case 'sms': return <MessageSquare className="w-6 h-6 text-primary-500" />;
            default: return <Activity className="w-6 h-6 text-gray-500" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                        {getProductIcon()}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white uppercase tracking-tight">{pageTitle}</h1>
                        <p className="text-gray-500 text-sm">Real-time oversight of {productType.replace('_', ' ')} activity</p>
                    </div>
                </div>
                <button
                    onClick={fetchProductData}
                    className="p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Quick Filters */}
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setFilters({ ...filters, status: '' })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filters.status === ''
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                        }`}
                >
                    All Transactions
                </button>
                <button
                    onClick={() => setFilters({ ...filters, status: 'pending' })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filters.status === 'pending'
                        ? 'bg-yellow-500 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                        }`}
                >
                    Pending
                </button>
                <button
                    onClick={() => setFilters({ ...filters, status: 'completed' })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${filters.status === 'completed'
                        ? 'bg-primary-600 text-white'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                        }`}
                >
                    Completed
                </button>
            </div>

            {/* List */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-700">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Details</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Value</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Timestamp</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center gap-2">
                                            <Clock className="w-8 h-8 opacity-20" />
                                            <p>No {productType} activity found matching your criteria</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="text-sm">
                                                    <p className="font-bold text-gray-900 dark:text-white truncate max-w-[200px]">
                                                        {item.description || `${productType} order`}
                                                    </p>
                                                    <p className="text-gray-400 font-mono text-[10px]">{item.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm">
                                                <p className="font-black text-gray-900 dark:text-white">
                                                    {formatCurrency(item.amount, item.currency)}
                                                </p>
                                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Gross Amount</p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusStyle(item.status)}`}>
                                                {item.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                                                {item.status === 'failed' && <XCircle className="w-3 h-3" />}
                                                {item.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{formatDateTime(item.created_at)}</p>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-gray-400 hover:text-gray-900 dark:hover:text-white">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ProductManagement;
