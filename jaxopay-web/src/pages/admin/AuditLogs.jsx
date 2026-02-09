import { useState, useEffect } from 'react';
import {
    Clock,
    User,
    Shield,
    AlertTriangle,
    Activity,
    Search,
    Filter,
    ChevronLeft,
    ChevronRight,
    ExternalLink
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatDateTime } from '../../utils/formatters';

const ACTION_ICONS = {
    update_user: User,
    suspend_user: AlertTriangle,
    verify_kyc: Shield,
    update_feature_toggle: Shield,
};

const AuditLogs = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [filters, setFilters] = useState({ action: '', targetType: '' });

    useEffect(() => {
        fetchLogs();
    }, [pagination.page, filters]);

    const fetchLogs = async () => {
        setLoading(true);
        const result = await adminService.getAuditLogs({
            page: pagination.page,
            limit: pagination.limit,
            action: filters.action || undefined,
            targetType: filters.targetType || undefined,
        });
        if (result.success) {
            setLogs(result.data.logs || []);
            setPagination(prev => ({
                ...prev,
                total: result.data.pagination?.total || 0
            }));
        }
        setLoading(false);
    };

    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
                    <p className="text-gray-600 dark:text-gray-400">Track all administrative actions</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Action Type</label>
                    <select
                        value={filters.action}
                        onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                    >
                        <option value="">All Actions</option>
                        <option value="update_user">Update User</option>
                        <option value="suspend_user">Suspend User</option>
                        <option value="verify_kyc">Verify KYC</option>
                        <option value="update_feature_toggle">Update Toggle</option>
                    </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Target Type</label>
                    <select
                        value={filters.targetType}
                        onChange={(e) => setFilters({ ...filters, targetType: e.target.value })}
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm"
                    >
                        <option value="">All Targets</option>
                        <option value="user">User</option>
                        <option value="kyc_document">KYC Document</option>
                        <option value="feature_toggle">Feature Toggle</option>
                    </select>
                </div>
            </div>

            {/* Logs List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-12">
                        <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">No logs found</h3>
                        <p className="text-gray-500">No administrative actions have been recorded yet.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timestamp</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Administrator</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Action</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Target</th>
                                    <th className="text-left px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IP Address</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                                {logs.map((log) => {
                                    const ActionIcon = ACTION_ICONS[log.action] || Activity;
                                    return (
                                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-4 h-4" />
                                                    {formatDateTime(log.created_at)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900 dark:text-white">{log.admin_email}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="p-1 rounded bg-gray-100 dark:bg-gray-700">
                                                        <ActionIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                                    </span>
                                                    <span className="capitalize">{log.action.replace('_', ' ')}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-gray-700 dark:text-gray-300">{log.target_type}</span>
                                                    <span className="text-[10px] font-mono text-gray-400">{log.target_id}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                {log.ip_address || 'N/A'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500">
                            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                                disabled={pagination.page === 1}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className="px-4 py-2 text-sm">
                                Page {pagination.page} of {totalPages}
                            </span>
                            <button
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                                disabled={pagination.page >= totalPages}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuditLogs;
