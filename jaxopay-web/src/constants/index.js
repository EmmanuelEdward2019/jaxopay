// Currency configurations
export const FIAT_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬' },
  { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵', flag: '🇬🇭' },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', flag: '🇰🇪' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
];

export const CRYPTO_CURRENCIES = [
  { code: 'USDT', name: 'Tether', symbol: 'USDT', icon: '₮' },
  { code: 'BTC', name: 'Bitcoin', symbol: 'BTC', icon: '₿' },
  { code: 'ETH', name: 'Ethereum', symbol: 'ETH', icon: 'Ξ' },
  { code: 'USDC', name: 'USD Coin', symbol: 'USDC', icon: 'USDC' },
];

export const ALL_CURRENCIES = [...FIAT_CURRENCIES, ...CRYPTO_CURRENCIES];

// Transaction types
export const TRANSACTION_TYPES = {
  DEPOSIT: 'deposit',
  WITHDRAWAL: 'withdrawal',
  TRANSFER: 'transfer',
  EXCHANGE: 'exchange',
  PAYMENT: 'payment',
  CARD_FUNDING: 'card_funding',
  CARD_TRANSACTION: 'card_transaction',
  BILL_PAYMENT: 'bill_payment',
  FLIGHT_BOOKING: 'flight_booking',
  GIFT_CARD_PURCHASE: 'gift_card_purchase',
  GIFT_CARD_SALE: 'gift_card_sale',
  REFUND: 'refund',
  FEE: 'fee',
};

// Transaction statuses
export const TRANSACTION_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REVERSED: 'reversed',
};

// KYC tiers
export const KYC_TIERS = {
  TIER_0: 'tier_0',
  TIER_1: 'tier_1',
  TIER_2: 'tier_2',
};

// KYC limits (example values - should be configurable)
export const KYC_LIMITS = {
  tier_0: {
    daily_limit: 100,
    monthly_limit: 500,
    features: ['wallet_transfers'],
  },
  tier_1: {
    daily_limit: 5000,
    monthly_limit: 50000,
    features: ['wallet_transfers', 'cross_border', 'bill_payments', 'utilities'],
  },
  tier_2: {
    daily_limit: 50000,
    monthly_limit: 500000,
    features: ['all'],
  },
};

// User roles
export const USER_ROLES = {
  END_USER: 'end_user',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  COMPLIANCE_OFFICER: 'compliance_officer',
};

// Bill payment service types
export const BILL_SERVICE_TYPES = {
  ELECTRICITY: 'electricity',
  WATER: 'water',
  CABLE_TV: 'cable_tv',
  INTERNET: 'internet',
  AIRTIME: 'airtime',
  DATA: 'data',
  EDUCATION: 'education',
};

// Gift card brands
export const GIFT_CARD_BRANDS = {
  AMAZON: 'Amazon',
  APPLE: 'Apple',
  GOOGLE_PLAY: 'Google Play',
  STEAM: 'Steam',
  NETFLIX: 'Netflix',
};

// Countries (African countries + UK, Canada, China)
export const SUPPORTED_COUNTRIES = [
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  // Add more African countries as needed
];

// API endpoints
export const API_ENDPOINTS = {
  AUTH: '/auth',
  WALLETS: '/wallets',
  TRANSACTIONS: '/transactions',
  EXCHANGE: '/exchange',
  CARDS: '/cards',
  BILLS: '/bills',
  FLIGHTS: '/flights',
  KYC: '/kyc',
  USERS: '/users',
};

// Feature flags
export const FEATURES = {
  CRYPTO: 'crypto',
  VIRTUAL_CARDS: 'virtual_cards',
  FLIGHTS: 'flights',
  BULK_SMS: 'bulk_sms',
  UTILITIES: 'utilities',
  CROSS_BORDER: 'cross_border',
  BILL_PAYMENTS: 'bill_payments',
  WALLET_TRANSFERS: 'wallet_transfers',
};

// Validation patterns
export const VALIDATION = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\+?[1-9]\d{1,14}$/,
  PASSWORD_MIN_LENGTH: 8,
};

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  DISPLAY_WITH_TIME: 'MMM dd, yyyy HH:mm',
  API: 'yyyy-MM-dd',
  API_WITH_TIME: "yyyy-MM-dd'T'HH:mm:ss",
};

