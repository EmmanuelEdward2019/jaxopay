import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Wallet,
  ArrowLeftRight,
  CreditCard,
  Receipt,
  Plane,
  Gift,
  Settings,
  LogOut,
  Menu,
  X,
  MessageSquare,
  Sun,
  Moon,
  Bell,
  Shield,
  LifeBuoy,
  User,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import NotificationDropdown from '../notifications/NotificationDropdown';
import AnnouncementBanner from '../notifications/AnnouncementBanner';

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

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home, enabled: true },
    { name: 'Wallets', href: '/dashboard/wallets', icon: Wallet, enabled: true },
    { name: 'Exchange', href: '/dashboard/exchange', icon: ArrowLeftRight, enabled: isFeatureEnabled('crypto') },
    { name: 'Virtual Cards', href: '/dashboard/cards', icon: CreditCard, enabled: isFeatureEnabled('virtual_cards') },
    { name: 'Bill Payments', href: '/dashboard/bills', icon: Receipt, enabled: isFeatureEnabled('bill_payments') },
    { name: 'Flights', href: '/dashboard/flights', icon: Plane, enabled: isFeatureEnabled('flights') },
    { name: 'Gift Cards', href: '/dashboard/gift-cards', icon: Gift, enabled: isFeatureEnabled('gift_cards') },
    { name: 'Bulk SMS', href: '/dashboard/sms', icon: MessageSquare, enabled: isFeatureEnabled('bulk_sms') },
    { name: 'KYC Verification', href: '/dashboard/kyc', icon: Shield, enabled: true },
    { name: 'Support', href: '/dashboard/support', icon: LifeBuoy, enabled: true },
  ];

  const adminNavigation = [
    { name: 'Administration', href: '/admin', icon: Settings, enabled: ['admin', 'super_admin', 'compliance_officer'].includes(user?.role) },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <img
                src="/logo.png"
                alt="JAXOPAY"
                className="h-12 w-auto"
              />
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {navigation.filter(item => item.enabled).map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive(item.href)
                    ? 'bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}

            {/* Admin Section */}
            {adminNavigation.some(item => item.enabled) && (
              <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                <p className="px-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Administration
                </p>
                {adminNavigation.filter(item => item.enabled).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive(item.href)
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          {/* Bottom section */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <Link
              to="/dashboard/settings"
              className="flex items-center space-x-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <Settings className="h-5 w-5" />
              <span className="font-medium">Settings</span>
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span className="font-medium">Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <AnnouncementBanner />
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex-1 lg:ml-0 ml-4">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Welcome back, {user?.email?.split('@')[0] || 'User'}
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </button>
              <NotificationDropdown />
              <Link
                to="/dashboard/profile"
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <User className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;

