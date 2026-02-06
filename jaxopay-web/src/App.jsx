import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import { useAppStore } from './store/appStore';

// Layouts
import DashboardLayout from './components/layout/DashboardLayout';

// Components
import SetupNotice from './components/SetupNotice';

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
import Flights from './pages/products/Flights';
import GiftCards from './pages/products/GiftCards';
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
import DashboardGiftCards from './pages/dashboard/GiftCards';
import KYC from './pages/dashboard/KYC';
import DashboardFlights from './pages/dashboard/Flights';

// Admin Pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import KYCReview from './pages/admin/KYCReview';
import TransactionMonitor from './pages/admin/TransactionMonitor';

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

// Admin Route Component (requires admin role)
const AdminRoute = ({ children }) => {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check for admin role
  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
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
    const initApp = async () => {
      setLoading(true);

      // Only initialize if Supabase is configured
      if (hasValidCredentials) {
        // Check for existing session
        await refreshSession();

        // Fetch feature toggles
        await fetchFeatureToggles();
      }

      // Set initial theme
      const savedTheme = localStorage.getItem('jaxopay-app-settings');
      if (savedTheme) {
        const { theme } = JSON.parse(savedTheme);
        setTheme(theme || 'light');
      }

      setLoading(false);
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
          <Route path="/products/flights" element={<Flights />} />
          <Route path="/products/giftcards" element={<GiftCards />} />
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
            <Route index element={<Dashboard />} />

            {/* Placeholder routes - to be implemented */}
            <Route path="wallets" element={<Wallets />} />
            <Route path="exchange" element={<Exchange />} />
            <Route path="cards" element={<Cards />} />
            <Route path="bills" element={<Bills />} />
            <Route path="flights" element={<DashboardFlights />} />
            <Route path="gift-cards" element={<DashboardGiftCards />} />
            <Route path="settings" element={<Settings />} />
            <Route path="profile" element={<Profile />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="kyc" element={<KYC />} />
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
            <Route path="users" element={<UserManagement />} />
            <Route path="kyc" element={<KYCReview />} />
            <Route path="transactions" element={<TransactionMonitor />} />
            <Route path="wallets" element={<div className="card">Admin Wallets - Coming Soon</div>} />
            <Route path="cards" element={<div className="card">Admin Cards - Coming Soon</div>} />
          </Route>

          {/* Catch all - redirect to home for unauthenticated, dashboard for authenticated */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
