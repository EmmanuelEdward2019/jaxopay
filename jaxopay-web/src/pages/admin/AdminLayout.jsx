import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    LayoutDashboard,
    Users,
    Shield,
    Activity,
    CreditCard,
    Wallet,
    LogOut,
    Menu,
    X,
    Bell,
    Settings,
    ShieldAlert,
    ChevronDown,
    MessageSquare,
    Gift,
    Plane,
    TrendingUp,
    LifeBuoy,
    Megaphone
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import NotificationDropdown from '../../components/notifications/NotificationDropdown';
import AnnouncementBanner from '../../components/notifications/AnnouncementBanner';

const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true, roles: ['admin', 'super_admin', 'compliance_officer'] },
    { path: '/admin/users', icon: Users, label: 'Users', roles: ['admin', 'super_admin', 'compliance_officer'] },
    { path: '/admin/kyc', icon: Shield, label: 'KYC Review', roles: ['admin', 'super_admin', 'compliance_officer'] },
    { path: '/admin/transactions', icon: Activity, label: 'Transactions', roles: ['admin', 'super_admin', 'compliance_officer'] },
    { path: '/admin/aml', icon: ShieldAlert, label: 'Compliance & AML', roles: ['super_admin', 'compliance_officer'] },
    { path: '/admin/wallets', icon: Wallet, label: 'Wallets', roles: ['admin', 'super_admin'] },
    { path: '/admin/cards', icon: CreditCard, label: 'Cards', roles: ['admin', 'super_admin'] },
    { path: '/admin/sms', icon: MessageSquare, label: 'Bulk SMS', roles: ['admin', 'super_admin'] },
    { path: '/admin/crypto', icon: TrendingUp, label: 'Crypto Assets', roles: ['admin', 'super_admin'] },
    { path: '/admin/giftcards', icon: Gift, label: 'Gift Cards', roles: ['admin', 'super_admin'] },
    { path: '/admin/flights', icon: Plane, label: 'Flight Bookings', roles: ['admin', 'super_admin'] },
    { path: '/admin/features', icon: Settings, label: 'Platform Features', roles: ['super_admin'] },
    { path: '/admin/system', icon: ShieldAlert, label: 'System Configurations', roles: ['admin', 'super_admin'] },
    { path: '/admin/audit', icon: Activity, label: 'Audit Logs', roles: ['super_admin', 'compliance_officer'] },
    { path: '/admin/announcements', icon: Megaphone, label: 'Announcements', roles: ['admin', 'super_admin', 'compliance_officer'] },
    { path: '/dashboard/support', icon: LifeBuoy, label: 'Support Tickets', roles: ['admin', 'super_admin', 'compliance_officer'] },
];

const AdminLayout = () => {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const handleLogout = async () => {
        if (isLoggingOut) return;
        setIsLoggingOut(true);
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const getRoleLabel = (role) => {
        switch (role) {
            case 'super_admin': return 'Super Admin Panel';
            case 'compliance_officer': return 'Compliance Panel';
            default: return 'Admin Panel';
        }
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'super_admin': return 'text-red-400';
            case 'compliance_officer': return 'text-orange-400';
            default: return 'text-primary-400';
        }
    };

    const getDashboardTitle = (role) => {
        switch (role) {
            case 'super_admin': return 'Super Admin Dashboard';
            case 'compliance_officer': return 'Compliance Dashboard';
            default: return 'Admin Dashboard';
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-gray-900 to-gray-800 transition-all duration-300 flex flex-col ${sidebarOpen ? 'w-64' : 'w-20'
                    }`}
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700 shrink-0">
                    {sidebarOpen && (
                        <div className="flex items-center gap-3">
                            <img src="/logo.png" alt="JAXOPAY" className="w-10 h-10 object-contain" />
                            <div>
                                <h1 className="text-white font-bold text-lg leading-none">JAXOPAY</h1>
                                <span className={`text-[10px] font-semibold uppercase tracking-wider ${getRoleColor(user?.role)}`}>
                                    {getRoleLabel(user?.role)}
                                </span>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                    </button>
                </div>

                {/* Navigation - Added scrollbar support */}
                <nav className="mt-6 px-3 space-y-1 flex-1 overflow-y-auto custom-scrollbar pb-20">
                    {navItems
                        .filter(item => item.roles.includes(user?.role))
                        .map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.exact}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                        ? 'bg-primary-500/20 text-primary-400 border-l-4 border-primary-500 shadow-lg shadow-primary-500/10'
                                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                    }`
                                }
                            >
                                <item.icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110`} />
                                {sidebarOpen && <span className="font-medium">{item.label}</span>}
                            </NavLink>
                        ))}
                </nav>

                <style dangerouslySetInnerHTML={{
                    __html: `
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 4px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: #9CA3AF;
                        border-radius: 10px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: #6B7280;
                    }
                `}} />

                {/* Bottom section */}
                <div className="p-4 border-t border-gray-700 shrink-0">
                    <NavLink
                        to="/dashboard"
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-gray-700/50 hover:text-white transition-colors"
                    >
                        <Settings className="w-5 h-5" />
                        {sidebarOpen && <span>Back to Dashboard</span>}
                    </NavLink>
                </div>
            </aside>

            {/* Main Content */}
            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'} flex flex-col min-h-screen`}>
                <AnnouncementBanner />
                {/* Top Header */}
                <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 sticky top-0 z-40">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {getDashboardTitle(user?.role)}
                        </h2>
                    </div>

                    <div className="flex items-center gap-4">
                        <NotificationDropdown />
                        {/* User Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                                    {user?.email?.[0]?.toUpperCase() || 'A'}
                                </div>
                                <div className="text-left hidden sm:block">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {user?.email?.split('@')[0] || 'Admin'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {getRoleLabel(user?.role)}
                                    </p>
                                </div>
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                            </button>

                            {userMenuOpen && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2"
                                >
                                    <button
                                        onClick={handleLogout}
                                        disabled={isLoggingOut}
                                        className={`w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ${isLoggingOut ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
                                    </button>
                                </motion.div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
