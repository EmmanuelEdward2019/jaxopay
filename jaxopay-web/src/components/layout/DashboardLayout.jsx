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
  LayoutDashboard,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import NotificationDropdown from '../notifications/NotificationDropdown';
import AnnouncementBanner from '../notifications/AnnouncementBanner';
import LivePriceTicker from '../crypto/LivePriceTicker';

const NAV_GROUPS = (isFeatureEnabled) => [
  {
    label: 'Main',
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, enabled: true, exact: true },
      { name: 'Trade', href: '/dashboard/trade', icon: Activity, enabled: isFeatureEnabled('crypto') },
      { name: 'Swap', href: '/dashboard/instant-swap?from=USDT&to=NGN', icon: ArrowLeftRight, enabled: isFeatureEnabled('crypto') },
      { name: 'Markets', href: '/dashboard/markets', icon: BarChart2, enabled: true },
      { name: 'Wallets', href: '/dashboard/wallets', icon: Wallet, enabled: true },
    ],
  },
  {
    label: 'Services',
    items: [
      { name: 'Portfolio', href: '/dashboard/portfolio', icon: TrendingUp, enabled: false },
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
  const [collapsed, setCollapsed] = useState(false);
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

  const isActive = (item) => {
    const path = item.href.split('?')[0];
    if (item.exact) return location.pathname === path;
    if (path === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(path);
  };

  const navGroups = NAV_GROUPS(isFeatureEnabled);
  const isAdminUser = ['admin', 'super_admin', 'compliance_officer'].includes(user?.role);

  const isTrading = location.pathname.startsWith('/dashboard/trade') ||
    location.pathname.startsWith('/dashboard/markets') ||
    location.pathname.startsWith('/dashboard/instant-swap');

  const sidebarW = collapsed ? 'w-16' : 'w-60';

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full ${sidebarW} bg-sidebar-background border-r border-sidebar-border transform transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0 w-60' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/logo.png" alt="JAXOPAY" className={`h-10 w-auto ${collapsed ? 'lg:hidden' : ''}`} />
            {collapsed && <img src="/logo.png" alt="J" className="h-8 w-8 object-contain hidden lg:block" />}
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-sidebar-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-5">
          {navGroups.map((group) => {
            const enabledItems = group.items.filter((i) => i.enabled);
            if (!enabledItems.length) return null;
            return (
              <div key={group.label}>
                {!collapsed && (
                  <p className="px-3 mb-1.5 text-[10px] font-bold text-sidebar-muted uppercase tracking-widest">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {enabledItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item);
                    return (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        title={collapsed ? item.name : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                          active
                            ? 'bg-primary/10 text-primary border-l-2 border-primary'
                            : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
                        } ${collapsed ? 'lg:justify-center lg:px-2' : ''}`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        <span className={collapsed ? 'lg:hidden' : ''}>{item.name}</span>
                        {active && !collapsed && <ChevronRight className="h-3 w-3 ml-auto opacity-60" />}
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
              {!collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-bold text-sidebar-muted uppercase tracking-widest">
                  Administration
                </p>
              )}
              <Link
                to="/admin"
                onClick={() => setSidebarOpen(false)}
                title={collapsed ? 'Admin Panel' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-muted hover:text-foreground transition-all ${
                  collapsed ? 'lg:justify-center lg:px-2' : ''
                }`}
              >
                <Settings size={18} className="shrink-0" />
                <span className={collapsed ? 'lg:hidden' : ''}>Admin Panel</span>
              </Link>
            </div>
          )}
        </nav>

        {/* Bottom: Collapse toggle + Settings + Logout */}
        <div className="px-2 py-4 border-t border-sidebar-border space-y-0.5">
          {/* Collapse toggle - desktop only */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-muted hover:text-foreground transition-all"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span className={collapsed ? 'lg:hidden' : ''}>Collapse</span>
          </button>

          <Link
            to="/dashboard/settings"
            onClick={() => setSidebarOpen(false)}
            title={collapsed ? 'Settings' : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-muted hover:text-foreground transition-all ${
              collapsed ? 'lg:justify-center lg:px-2' : ''
            }`}
          >
            <Settings size={18} className="shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Logout' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 transition-all ${
              collapsed ? 'lg:justify-center lg:px-2' : ''
            }`}
          >
            <LogOut size={18} className="shrink-0" />
            <span className={collapsed ? 'lg:hidden' : ''}>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className={`${collapsed ? 'lg:pl-16' : 'lg:pl-60'} flex flex-col min-h-screen transition-all duration-300`}>
        <AnnouncementBanner />

        {/* Top header */}
        <header className="z-30 bg-card border-b border-border">
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Page title / user greeting */}
            <div className="flex-1 hidden sm:block">
              <span className="text-sm font-medium text-muted-foreground">
                {user?.email?.split('@')[0] || 'User'}
              </span>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Toggle theme"
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <NotificationDropdown />
              <Link
                to="/dashboard/profile"
                className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
        <main className={`flex-1 ${isTrading ? 'p-0' : 'p-4 md:p-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
