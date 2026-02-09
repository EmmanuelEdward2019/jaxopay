import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Shield,
    AlertTriangle,
    CheckCircle2,
    Users,
    Activity,
    Search,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Flag
} from 'lucide-react';
import adminService from '../../services/adminService';
import { formatDateTime } from '../../utils/formatters';

const AMLCompliance = () => {
    const [stats, setStats] = useState(null);
    const [highRiskUsers, setHighRiskUsers] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        const [statsRes, riskRes, logsRes] = await Promise.all([
            adminService.getComplianceStats(),
            adminService.getHighRiskUsers(),
            adminService.getAuditLogs({ limit: 5 }) // Fetch recent 5 logs
        ]);

        if (statsRes.success) setStats(statsRes.data);
        if (riskRes.success) setHighRiskUsers(riskRes.data || []);
        if (logsRes.success) setAuditLogs(logsRes.data.logs || []);
        setLoading(false);
    };

    const handleRefreshRisk = async (userId) => {
        setRefreshing(userId);
        const result = await adminService.refreshUserRiskScore(userId);
        if (result.success) {
            fetchData();
        }
        setRefreshing(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
            </div>
        );
    }

    // Dynamic compliance score calculation
    const complianceScore = (100 - (highRiskUsers.length * 2.5) - ((stats?.flagged_count || 0) * 1)).toFixed(1);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Compliance & AML</h1>
                    <p className="text-gray-600 dark:text-gray-400">Monitor high-risk activities and regulatory compliance</p>
                </div>
                <button
                    onClick={fetchData}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Compliance Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    title="Flagged Transactions"
                    value={stats?.flagged_count || 0}
                    icon={Flag}
                    color="bg-red-500"
                />
                <StatCard
                    title="Pending Reviews"
                    value={stats?.pending_reviews || 0}
                    icon={Shield}
                    color="bg-amber-500"
                />
                <StatCard
                    title="High Risk Users"
                    value={highRiskUsers.length}
                    icon={AlertTriangle}
                    color="bg-orange-500"
                />
                <StatCard
                    title="Compliance Score"
                    value={`${Math.max(0, complianceScore)}%`}
                    icon={CheckCircle2}
                    color={complianceScore > 90 ? "bg-green-500" : "bg-yellow-500"}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* High Risk Users */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-orange-500" />
                            High Risk Users
                        </h2>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {highRiskUsers.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No high-risk users identified.</div>
                        ) : (
                            highRiskUsers.map(user => (
                                <div key={user.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center font-bold">
                                                {user.email[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900 dark:text-white">{user.email}</p>
                                                <p className="text-xs text-gray-500">Risk Score: <span className="text-red-600 font-bold">{user.risk_score}</span></p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRefreshRisk(user.id)}
                                            disabled={refreshing === user.id}
                                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-primary-600"
                                        >
                                            <RefreshCw className={`w-4 h-4 ${refreshing === user.id ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Recent Compliance Actions */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Activity className="w-5 h-5 text-primary-500" />
                            Audit Trail (Compliance)
                        </h2>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {auditLogs.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">No recent compliance actions found.</div>
                        ) : (
                            auditLogs.map(log => (
                                <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {log.action.replace(/_/g, ' ').toUpperCase()}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Target: <span className="font-mono">{log.entity_type} / {log.entity_id}</span>
                                            </p>
                                        </div>
                                        <p className="text-xs text-gray-400">
                                            {formatDateTime(log.created_at)}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-4">
            <div className={`p-2 rounded-lg ${color} text-white`}>
                <Icon className="w-5 h-5" />
            </div>
        </div>
        <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        </div>
    </div>
);

export default AMLCompliance;
