import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart2,
  TrendingUp,
  Zap,
  Wallet,
  Globe,
  CreditCard,
  Receipt,
  Gift,
  Settings,
  LogOut,
  Menu,
  X,
  Sun,
  Moon,
  Shield,
  LifeBuoy,
  User,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import NotificationDropdown from '../notifications/NotificationDropdown';
import AnnouncementBanner from '../notifications/AnnouncementBanner';
import LivePriceTicker from '../crypto/LivePriceTicker';

// Nav group definitions
const NAV_GROUPS = (isFeatureEnabled) => [
  {
    label: 'Trading',
    items: [
      { name: 'Markets', href: '/dashboard/markets', icon: BarChart2, enabled: true },
      { name: 'Spot Trade', href: '/dashboard/trade', icon: Activity, enabled: isFeatureEnabled('crypto') },
      { name: 'Instant Swap', href: '/dashboard/swap', icon: Zap, enabled: isFeatureEnabled('crypto') },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Portfolio', href: '/dashboard/portfolio', icon: TrendingUp, enabled: true },
      { name: 'Wallets', href: '/dashboard/wallets', icon: Wallet, enabled: true },
      { name: 'Global Pay', href: '/dashboard/cross-border', icon: Globe, enabled: true },
      { name: 'Virtual Cards', href: '/dashboard/cards', icon: CreditCard, enabled: isFeatureEnabled('virtual_cards') },
      { name: 'Bill Payments', href: '/dashboard/bills', icon: Receipt, enabled: isFeatureEnabled('bill_payments') },
      { name: 'Gift Cards', href: '/dashboard/gift-cards', icon: Gift, enabled: isFeatureEnabled('gift_cards') },
    ],
  },
  {
    label: 'Account',
    items: [
      { name: 'KYC Verification', href: '/dashboard/kyc', icon: Shield, enabled: true },
      { name: 'Support', href: '/dashboard/support', icon: LifeBuoy, enabled: true },
    ],
  },
];

const DashboardLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme, isFeatureEnabled, fetchFeatureToggles } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchFeatureToggles();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (href) => {
    if (href === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(href);
  };

  const navGroups = NAV_GROUPS(isFeatureEnabled);
  const isAdminUser = ['admin', 'super_admin', 'compliance_officer'].includes(user?.role);

  // Determine if we're on a trading page (use dark theme for those)
  const isTrading = location.pathname.startsWith('/dashboard/trade') || location.pathname.startsWith('/dashboard/markets');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0b0e11]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-60 bg-[#161a1f] border-r border-[#2b3139] transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2b3139]">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="JAXOPAY" className="h-10 w-auto" />
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-[#848e9c] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => {
            const enabledItems = group.items.filter((i) => i.enabled);
            if (!enabledItems.length) return null;
            return (
              <div key={group.label}>
                <p className="px-3 mb-1.5 text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {enabledItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          active
                            ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                            : 'text-[#848e9c] hover:bg-[#2b3139] hover:text-white'
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0" size={18} />
                        <span>{item.name}</span>
                        {active && <ChevronRight className="h-3 w-3 ml-auto opacity-60" />}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Admin link */}
          {isAdminUser && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-[#848e9c] uppercase tracking-widest">
                Administration
              </p>
              <Link
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#848e9c] hover:bg-[#2b3139] hover:text-white transition-all"
              >
                <Settings size={18} className="shrink-0" />
                <span>Admin Panel</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Bottom: Settings + Logout */}
        <div className="px-3 py-4 border-t border-[#2b3139] space-y-0.5">
          <Link
            to="/dashboard/settings"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[#848e9c] hover:bg-[#2b3139] hover:text-white transition-all"
          >
            <Settings size={18} className="shrink-0" />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-all"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="lg:pl-60 flex flex-col min-h-screen">
        <AnnouncementBanner />

        {/* Top header */}
        <header className="sticky top-0 z-30 bg-[#161a1f] border-b border-[#2b3139]">
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-[#848e9c] hover:text-white transition-colors p-1"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Page title / breadcrumb — hidden on trading pages */}
            <div className="flex-1 hidden sm:block">
              <span className="text-sm font-medium text-[#848e9c]">
                {user?.email?.split('@')[0] || 'User'}
              </span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-[#848e9c] hover:bg-[#2b3139] hover:text-white transition-colors"
                title="Toggle theme"
              >
                {theme === 'light' ? <Moon className="h-4.5 w-4.5" size={18} /> : <Sun className="h-4.5 w-4.5" size={18} />}
              </button>
              <NotificationDropdown />
              <Link
                to="/dashboard/profile"
                className="p-2 rounded-lg text-[#848e9c] hover:bg-[#2b3139] hover:text-white transition-colors"
                title="Profile"
              >
                <User size={18} />
              </Link>
            </div>
          </div>
        </header>

        {/* Live price ticker bar */}
        <LivePriceTicker />

        {/* Page content */}
        <main className={`flex-1 ${isTrading ? 'p-0' : 'p-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
