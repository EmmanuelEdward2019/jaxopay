import { MessageCircle, Bell, ChevronDown, ArrowDownLeft, ArrowUpRight, RefreshCw, TrendingUp, Zap, CreditCard, Globe, Home as HomeIcon, Wallet, ArrowLeftRight, User } from 'lucide-react';

// Single source of truth for "what the real RN app's Home tab looks like" — used by the homepage
// hero phone and the /products/payments hero phone, so both marketing mockups are provably the
// same screen (DashboardScreen.tsx) instead of two hand-drawn approximations that can drift from
// the app and from each other. Matches a real device screenshot: header, dark-green balance card,
// three quick actions, the Services grid, and the bottom tab bar.
const SERVICES = [
  { label: 'Crypto', desc: 'Buy, sell & swap', Icon: TrendingUp, wash: '#EDE9FE', ink: '#6D28D9' },
  { label: 'Pay Bills', desc: 'Airtime, data & more', Icon: Zap, wash: '#FFE4DE', ink: '#C2410C' },
  { label: 'Cards', desc: 'Virtual USD cards', Icon: CreditCard, wash: '#D9F2E7', ink: '#0D9467' },
  { label: 'Global Pay', desc: 'Send worldwide', Icon: Globe, wash: '#E4E7FE', ink: '#4338CA' },
];

const TABS = [
  { label: 'Home', Icon: HomeIcon, active: true },
  { label: 'Wallets', Icon: Wallet },
  { label: 'Swap', Icon: ArrowLeftRight },
  { label: 'Pay', Icon: RefreshCw },
  { label: 'Profile', Icon: User },
];

const formatUSD = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PhoneHomeMockup = ({ name, balance, greeting = 'Good Morning', unreadCount = 9, activeWallets = 20 }) => (
  <div className="w-full h-full bg-gray-50 flex flex-col pt-10 relative overflow-hidden">
    {/* Header */}
    <div className="px-5 pb-3 flex justify-between items-center">
      <div>
        <div className="text-[11px] text-gray-400 font-medium">{greeting}</div>
        <div className="font-bold text-gray-900 text-[16px]">{name} 👋</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center">
          <MessageCircle className="w-4 h-4" style={{ color: '#25D366' }} />
        </div>
        <div className="relative w-8 h-8 rounded-full bg-white border border-gray-100 flex items-center justify-center">
          <Bell className="w-4 h-4 text-gray-500" />
          <div className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 flex items-center justify-center">
            <span className="text-[8px] text-white font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
          </div>
        </div>
      </div>
    </div>

    <div className="flex-1 px-5 overflow-hidden">
      {/* Balance Card */}
      <div className="rounded-2xl p-4 mb-4" style={{ background: 'linear-gradient(135deg,#064e3b,#065f46)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-white/70 text-[10px] font-bold uppercase tracking-wide">Total Balance</span>
          <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-1">
            <span className="text-white text-[10px] font-bold">USD</span>
            <ChevronDown className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="text-white text-[26px] font-bold mb-3 tracking-tight">{formatUSD(balance)}</div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#10B981' }} />
            <span className="text-white/60 text-[10px]">{activeWallets} active wallets</span>
          </div>
          <span className="text-white/60 text-[10px]">Tap to hide</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex justify-between mb-5 px-2">
        {[
          { label: 'Deposit', Icon: ArrowDownLeft },
          { label: 'Withdraw', Icon: ArrowUpRight },
          { label: 'Swap', Icon: RefreshCw },
        ].map(({ label, Icon }) => (
          <div key={label} className="flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(31, 173, 107, 0.12)' }}>
              <Icon className="w-5 h-5" style={{ color: '#1FAD6B' }} />
            </div>
            <span className="text-[10px] font-medium text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Services */}
      <div className="text-[13px] font-bold text-gray-900 mb-2">Services</div>
      <div className="grid grid-cols-2 gap-2.5">
        {SERVICES.map(({ label, desc, Icon, wash, ink }) => (
          <div key={label} className="rounded-2xl p-3" style={{ backgroundColor: wash }}>
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center mb-2">
              <Icon className="w-4 h-4" style={{ color: ink }} />
            </div>
            <div className="text-[11px] font-bold text-gray-900">{label}</div>
            <div className="text-[9px] text-gray-500 truncate">{desc}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Bottom tab bar */}
    <div className="border-t border-gray-100 bg-white flex justify-between px-4 py-2.5">
      {TABS.map(({ label, Icon, active }) => (
        <div key={label} className="flex flex-col items-center gap-0.5">
          <Icon className="w-4 h-4" style={{ color: active ? '#1FAD6B' : '#9CA3AF' }} />
          <span className="text-[8px] font-semibold" style={{ color: active ? '#1FAD6B' : '#9CA3AF' }}>{label}</span>
        </div>
      ))}
    </div>
  </div>
);

export default PhoneHomeMockup;
