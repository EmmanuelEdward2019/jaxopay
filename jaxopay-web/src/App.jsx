import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';

// Components
import SetupNotice from './components/SetupNotice';
import FeatureGuard from './components/FeatureGuard';

// Auth Pages
import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import ForgotPassword from './pages/auth/ForgotPassword';
import VerifyEmail from './pages/auth/VerifyEmail';

// Public Pages
import Home from './pages/public/Home';
import About from './pages/public/About';
import Contact from './pages/public/Contact';
import Products from './pages/public/Products';
import Privacy from './pages/public/Privacy';
import Terms from './pages/public/Terms';
import Cookies from './pages/public/Cookies';

// Product Pages
import Payments from './pages/products/Payments';
import VirtualCards from './pages/products/VirtualCards';
import Crypto from './pages/products/Crypto';
import Blog from './pages/public/Blog';
import Careers from './pages/public/Careers';

// Dashboard Pages
import Dashboard from './pages/dashboard/Dashboard';
import Wallets from './pages/dashboard/Wallets';
import Cards from './pages/dashboard/Cards';
import Transactions from './pages/dashboard/Transactions';
import Profile from './pages/dashboard/Profile';
import Settings from './pages/dashboard/Settings';
import Bills from './pages/dashboard/Bills';
import Exchange from './pages/dashboard/Exchange';
import Trade from './pages/dashboard/Trade';
import InstantSwap from './pages/dashboard/InstantSwap';
import DashboardHome from './pages/dashboard/DashboardHome';
import KYC from './pages/dashboard/KYC';
import CrossBorder from './pages/dashboard/CrossBorder';
import CryptoRamp from './pages/dashboard/CryptoRamp';

import Support from './pages/dashboard/Support';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import KYCReview from './pages/admin/KYCReview';
import TransactionMonitor from './pages/admin/TransactionMonitor';
import FeatureManagement from './pages/admin/FeatureManagement';
import AuditLogs from './pages/admin/AuditLogs';
import SystemManagement from './pages/admin/SystemManagement';
import WalletManagement from './pages/admin/WalletManagement';
import Treasury from './pages/admin/Treasury';
import RampQueue from './pages/admin/RampQueue';
import CardManagement from './pages/admin/CardManagement';
import ProductManagement from './pages/admin/ProductManagement';
import AMLCompliance from './pages/admin/AMLCompliance';
import AnnouncementManagement from './pages/admin/AnnouncementManagement';
import AdminSupport from './pages/admin/AdminSupport';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Public Route Component (redirect to dashboard if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Role Protected Route Component
const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && !allowedRoles.includes(user.role)) {
    // Redirect to base admin dashboard if they are an admin type, or main dashboard otherwise
    return <Navigate to="/admin" replace />;
  }

  return children;
};

// Admin Route Component (requires admin role)
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check for admin role
  if (!['admin', 'super_admin', 'compliance_officer'].includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  const { refreshSession, setLoading } = useAuthStore();
  const { setTheme, fetchFeatureToggles } = useAppStore();

  // Check if Supabase is configured
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const hasValidCredentials =
    supabaseUrl &&
    !supabaseUrl.includes('placeholder');

  useEffect(() => {
    // Initialize app
    const initApp = () => {
      // Apply saved theme immediately (local, synchronous — never blocks on the network).
      try {
        const savedTheme = localStorage.getItem('jaxopay-app-settings');
        if (savedTheme) {
          const { theme } = JSON.parse(savedTheme);
          setTheme(theme || 'light');
        }
      } catch { /* ignore malformed settings */ }

      if (!hasValidCredentials) {
        setLoading(false);
        return;
      }

      // IMPORTANT: never gate the whole UI behind a network round-trip. If a session is already
      // persisted, render the app immediately and validate/renew it in the background (the API
      // layer refreshes the token on demand). On a slow/flaky connection this avoids the long
      // full-page spinner + reload loop. If there's no session, ProtectedRoute sends to login.
      const hasSession = !!useAuthStore.getState().session?.access_token;
      setLoading(false);

      if (hasSession) {
        Promise.resolve(refreshSession()).catch(() => { /* keep session on transient failure */ });
      }
      Promise.resolve(fetchFeatureToggles()).catch(() => { /* non-critical, must not block login */ });
    };

    initApp();
  }, []);

  // Show setup notice if Supabase is not configured
  if (!hasValidCredentials) {
    return <SetupNotice />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/payments" element={<Payments />} />
          <Route path="/products/cards" element={<VirtualCards />} />
          <Route path="/products/crypto" element={<Crypto />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/careers" element={<Careers />} />

          {/* Auth Routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ForgotPassword />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<DashboardHome />} />
            <Route path="portfolio" element={<Dashboard />} />

            {/* Dashboard Features */}
            <Route path="wallets" element={<Wallets />} />
            {/* Crypto trading routes (hidden from nav but routes preserved) */}
            <Route path="trade" element={
              <FeatureGuard feature="crypto">
                <Trade />
              </FeatureGuard>
            } />
            <Route path="trade/:pair" element={
              <FeatureGuard feature="crypto">
                <Trade />
              </FeatureGuard>
            } />
            <Route path="swap" element={
              <FeatureGuard feature="crypto">
                <Exchange />
              </FeatureGuard>
            } />
            <Route path="instant-swap" element={
              <FeatureGuard feature="crypto">
                <InstantSwap />
              </FeatureGuard>
            } />
            <Route path="exchange" element={
              <FeatureGuard feature="crypto">
                <Exchange />
              </FeatureGuard>
            } />
            <Route path="cards" element={
              <FeatureGuard feature="virtual_cards">
                <Cards />
              </FeatureGuard>
            } />
            <Route path="bills" element={
              <FeatureGuard feature="bill_payments">
                <Bills />
              </FeatureGuard>
            } />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="kyc" element={<KYC />} />

            <Route path="support" element={<Support />} />
            <Route path="cross-border" element={<CrossBorder />} />
            <Route path="crypto-ramp" element={<CryptoRamp />} />
          </Route>

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminDashboard />} />

            {/* User Management - All Admins */}
            <Route path="users" element={<UserManagement />} />

            {/* KYC - Admin, Super Admin, Compliance */}
            <Route path="kyc" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin', 'compliance_officer']}>
                <KYCReview />
              </RoleProtectedRoute>
            } />

            {/* Transactions - Admin, Super Admin, Compliance */}
            <Route path="transactions" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin', 'compliance_officer']}>
                <TransactionMonitor />
              </RoleProtectedRoute>
            } />

            {/* AML/Compliance - Compliance Officer, Super Admin */}
            <Route path="aml" element={
              <RoleProtectedRoute allowedRoles={['super_admin', 'compliance_officer', 'admin']}>
                <AMLCompliance />
              </RoleProtectedRoute>
            } />

            {/* Features - SUPER ADMIN ONLY */}
            <Route path="features" element={
              <RoleProtectedRoute allowedRoles={['super_admin']}>
                <FeatureManagement />
              </RoleProtectedRoute>
            } />

            {/* Announcements - Admin & Compliance */}
            <Route path="announcements" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin', 'compliance_officer']}>
                <AnnouncementManagement />
              </RoleProtectedRoute>
            } />

            {/* Audit Logs - Super Admin, Compliance */}
            <Route path="audit" element={
              <RoleProtectedRoute allowedRoles={['super_admin', 'compliance_officer']}>
                <AuditLogs />
              </RoleProtectedRoute>
            } />

            {/* Support Tickets - Admin, Super Admin, Compliance */}
            <Route path="support" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin', 'compliance_officer']}>
                <AdminSupport />
              </RoleProtectedRoute>
            } />

            {/* System Management - Admin, Super Admin */}
            <Route path="system" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <SystemManagement />
              </RoleProtectedRoute>
            } />

            {/* Financial Products - Admin, Super Admin */}
            <Route path="treasury" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <Treasury />
              </RoleProtectedRoute>
            } />
            <Route path="ramps" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <RampQueue />
              </RoleProtectedRoute>
            } />
            <Route path="wallets" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <WalletManagement />
              </RoleProtectedRoute>
            } />
            <Route path="cards" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <CardManagement />
              </RoleProtectedRoute>
            } />
            <Route path="crypto" element={
              <RoleProtectedRoute allowedRoles={['admin', 'super_admin']}>
                <ProductManagement />
              </RoleProtectedRoute>
            } />

          </Route>

          {/* Catch all - redirect to home for unauthenticated, dashboard for authenticated */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider >
  );
}

export default App;
