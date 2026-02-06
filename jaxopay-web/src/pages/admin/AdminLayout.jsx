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
    ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { path: '/admin/users', icon: Users, label: 'Users' },
    { path: '/admin/kyc', icon: Shield, label: 'KYC Review' },
    { path: '/admin/transactions', icon: Activity, label: 'Transactions' },
    { path: '/admin/wallets', icon: Wallet, label: 'Wallets' },
    { path: '/admin/cards', icon: CreditCard, label: 'Cards' },
];

const AdminLayout = () => {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-gray-900 to-gray-800 transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'
                    }`}
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700">
                    {sidebarOpen && (
                        <div className="flex items-center gap-3">
                            <img src="/logo-icon.png" alt="JAXOPAY" className="w-10 h-10 object-contain" />
                            <div>
                                <h1 className="text-white font-bold text-lg leading-none">JAXOPAY</h1>
                                <span className="text-[10px] text-primary-400 font-semibold uppercase tracking-wider">Admin Panel</span>
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

                {/* Navigation */}
                <nav className="mt-6 px-3 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.exact}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive
                                    ? 'bg-green-500/20 text-green-400 border-l-4 border-green-500'
                                    : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                }`
                            }
                        >
                            <item.icon className="w-5 h-5 shrink-0" />
                            {sidebarOpen && <span className="font-medium">{item.label}</span>}
                        </NavLink>
                    ))}
                </nav>

                {/* Bottom section */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-700">
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
            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
                {/* Top Header */}
                <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-6 sticky top-0 z-40">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Dashboard</h2>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Notifications */}
                        <button className="relative p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <Bell className="w-5 h-5 text-gray-500" />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                        </button>

                        {/* User Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
                                    {user?.email?.[0]?.toUpperCase() || 'A'}
                                </div>
                                <div className="text-left hidden sm:block">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {user?.email?.split('@')[0] || 'Admin'}
                                    </p>
                                    <p className="text-xs text-gray-500">Administrator</p>
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
                                        className="w-full flex items-center gap-3 px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        <span>Logout</span>
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
