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
    Gift,
    TrendingUp,
    LifeBuoy,
    Megaphone,
    Landmark,
    Coins,
    Mail,
    Percent
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import NotificationDropdown from '../../components/notifications/NotificationDropdown';
import AnnouncementBanner from '../../components/notifications/AnnouncementBanner';

const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true, roles: ['admin', 'super_admin', 'compliance_officer', 'finance', 'support'] },
    { path: '/admin/users', icon: Users, label: 'Users', roles: ['admin', 'super_admin', 'compliance_officer', 'finance', 'support'] },
    { path: '/admin/kyc', icon: Shield, label: 'KYC Review', roles: ['admin', 'super_admin', 'compliance_officer'] },
    { path: '/admin/transactions', icon: Activity, label: 'Transactions', roles: ['admin', 'super_admin', 'compliance_officer', 'finance'] },
    { path: '/admin/aml', icon: ShieldAlert, label: 'Compliance & AML', roles: ['super_admin', 'compliance_officer'] },
    { path: '/admin/treasury', icon: Landmark, label: 'Treasury', roles: ['admin', 'super_admin', 'finance'] },
    { path: '/admin/ramps', icon: Coins, label: 'Crypto Ramps', roles: ['admin', 'super_admin', 'finance'] },
    { path: '/admin/wallets', icon: Wallet, label: 'Wallets', roles: ['admin', 'super_admin', 'finance'] },
    { path: '/admin/cards', icon: CreditCard, label: 'Cards', roles: ['admin', 'super_admin'] },
    { path: '/admin/crypto', icon: TrendingUp, label: 'Crypto Assets', roles: ['admin', 'super_admin'] },
    { path: '/admin/features', icon: Settings, label: 'Platform Features', roles: ['super_admin'] },
    { path: '/admin/system?tab=rates_fees', icon: Percent, label: 'Rates & Fees', roles: ['admin', 'super_admin', 'finance'] },
    { path: '/admin/system', icon: ShieldAlert, label: 'System Configurations', roles: ['admin', 'super_admin'] },
    { path: '/admin/audit', icon: Activity, label: 'Audit Logs', roles: ['super_admin', 'compliance_officer'] },
    { path: '/admin/announcements', icon: Megaphone, label: 'Announcements', roles: ['admin', 'super_admin', 'support'] },
    { path: '/admin/support', icon: LifeBuoy, label: 'Support Tickets', roles: ['admin', 'super_admin', 'support'] },
    { path: '/admin/public-forms', icon: Mail, label: 'Contact Messages', roles: ['admin', 'super_admin', 'support'] },
];

const AdminLayout = () => {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();
    // Desktop collapse (icon-only vs full width) — unrelated to mobile, always full-width there.
    const [sidebarOpen, setSidebarOpen] = useState(true);
    // Mobile off-canvas drawer — closed by default; the sidebar is `fixed` and was previously
    // always on-screen and always taking real width (min 80px), which is most of a ~360-412px
    // phone viewport. Below `md`, the sidebar now only renders on-screen when this is true.
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    // The sidebar's own collapse/close button serves two contexts: on mobile it just closes the
    // drawer; on desktop it toggles the icon-only collapse. mobileSidebarOpen is only ever set
    // true via the header's hamburger button (md:hidden), so on desktop this always falls through
    // to the collapse toggle, preserving the exact previous desktop behavior.
    const handleSidebarToggleClick = () => {
        if (mobileSidebarOpen) setMobileSidebarOpen(false);
        else setSidebarOpen(!sidebarOpen);
    };

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
            case 'finance': return 'Finance Panel';
            case 'support': return 'Support Panel';
            default: return 'Admin Panel';
        }
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'super_admin': return 'text-red-400';
            case 'compliance_officer': return 'text-orange-400';
            case 'finance': return 'text-emerald-400';
            case 'support': return 'text-sky-400';
            default: return 'text-accent-400';
        }
    };

    const getDashboardTitle = (role) => {
        switch (role) {
            case 'super_admin': return 'Super Admin Dashboard';
            case 'compliance_officer': return 'Compliance Dashboard';
            case 'finance': return 'Finance Dashboard';
            case 'support': return 'Support Dashboard';
            default: return 'Admin Dashboard';
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex overflow-x-hidden">
            {/* Backdrop — mobile only, dims the page and closes the drawer on tap */}
            {mobileSidebarOpen && (
                <div
                    className="fixed inset-0 z-[45] bg-black/50 md:hidden"
                    onClick={() => setMobileSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar — off-canvas drawer below md (full width, slides in/out), permanently
                docked at md and up (collapsible between w-64/w-20 as before). */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 bg-gradient-to-b from-gray-900 to-gray-800 transition-all duration-300 flex flex-col w-64 transform ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    } md:translate-x-0 ${sidebarOpen ? 'md:w-64' : 'md:w-20'}`}
            >
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700 shrink-0">
                    {(sidebarOpen || mobileSidebarOpen) && (
                        <div className="flex items-center gap-3">
                            <img src="/logo.png" alt="JAXOPAY" className="w-12 h-12 object-contain shrink-0" />
                            <div className="min-w-0">
                                <h1 className="text-white font-bold text-lg leading-none truncate">JAXOPAY</h1>
                                <span className={`text-[10px] font-semibold uppercase tracking-wider truncate block ${getRoleColor(user?.role)}`}>
                                    {getRoleLabel(user?.role)}
                                </span>
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleSidebarToggleClick}
                        className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors shrink-0"
                    >
                        {(sidebarOpen || mobileSidebarOpen) ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
                                onClick={() => setMobileSidebarOpen(false)}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                        ? 'bg-accent-500/20 text-gray-200 border-l-4 border-accent-500 shadow-lg shadow-accent-500/10'
                                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-white'
                                    }`
                                }
                            >
                                <item.icon className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110`} />
                                {(sidebarOpen || mobileSidebarOpen) && <span className="font-medium truncate">{item.label}</span>}
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
                        onClick={() => setMobileSidebarOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-gray-700/50 hover:text-white transition-colors"
                    >
                        <Settings className="w-5 h-5 shrink-0" />
                        {(sidebarOpen || mobileSidebarOpen) && <span className="truncate">Back to Dashboard</span>}
                    </NavLink>
                </div>
            </aside>

            {/* Main Content — no sidebar margin below md (sidebar is off-canvas there); matches
                the desktop collapse width at md and up. */}
            <div className={`flex-1 min-w-0 transition-all duration-300 ml-0 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'} flex flex-col min-h-screen`}>
                <AnnouncementBanner />
                {/* Top Header */}
                <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 px-4 md:px-6 sticky top-0 z-40">
                    <button
                        onClick={() => setMobileSidebarOpen(true)}
                        className="md:hidden p-2 -ml-2 shrink-0 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        aria-label="Open menu"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">
                            {getDashboardTitle(user?.role)}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4 shrink-0">
                        <NotificationDropdown />
                        {/* User Menu */}
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <div className="w-8 h-8 bg-gradient-to-br from-accent-500 to-accent-600 rounded-full flex items-center justify-center text-white font-medium text-sm">
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
                <main className="p-4 md:p-6 min-w-0">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
