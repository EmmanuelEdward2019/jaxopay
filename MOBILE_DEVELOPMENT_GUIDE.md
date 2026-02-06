# JAXOPAY Mobile App Development Guide

## Overview

This guide provides a comprehensive roadmap for building mobile applications (iOS and Android) that consume the JAXOPAY API. The guide covers architecture, technology choices, implementation patterns, and best practices.

---

## Technology Stack Recommendations

### Option 1: Cross-Platform (Recommended for MVP)

**React Native with Expo**
- Pros: Shared codebase, faster development, OTA updates, large community
- Cons: Slightly less native feel, limited native module access
- Best for: Rapid development, limited resources

**Flutter**
- Pros: Beautiful UI, great performance, hot reload, Google backing
- Cons: Larger app size, Dart learning curve
- Best for: Premium UI/UX requirements

### Option 2: Native Development

**iOS (Swift/SwiftUI)**
- Pros: Best performance, native features, App Store optimization
- Cons: iOS only, slower development

**Android (Kotlin/Jetpack Compose)**
- Pros: Best Android experience, Material Design
- Cons: Android only, slower development

### Recommendation

For JAXOPAY, we recommend **React Native with Expo** for the following reasons:
1. Your web frontend is already React-based (code sharing possible)
2. Faster time to market
3. Single team can maintain both platforms
4. Expo provides OTA updates for quick fixes

---

## Project Setup

### React Native with Expo

```bash
# Install Expo CLI
npm install -g @expo/cli

# Create new project
npx create-expo-app jaxopay-mobile --template expo-template-blank-typescript

# Navigate to project
cd jaxopay-mobile

# Install dependencies
npx expo install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-secure-store expo-local-authentication
npx expo install axios react-query
npx expo install expo-image-picker expo-camera expo-notifications
```

### Project Structure

```
jaxopay-mobile/
├── app/                    # Screens (Expo Router)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── forgot-password.tsx
│   ├── (tabs)/
│   │   ├── index.tsx       # Dashboard
│   │   ├── wallets.tsx
│   │   ├── cards.tsx
│   │   ├── transactions.tsx
│   │   └── settings.tsx
│   └── _layout.tsx
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── Modal.tsx
│   ├── wallet/
│   │   ├── WalletCard.tsx
│   │   └── TransactionItem.tsx
│   └── common/
│       ├── Header.tsx
│       └── LoadingSpinner.tsx
├── services/
│   ├── api.ts              # Axios instance
│   ├── auth.ts
│   ├── wallets.ts
│   ├── cards.ts
│   └── transactions.ts
├── store/
│   ├── authStore.ts        # Zustand store
│   └── appStore.ts
├── hooks/
│   ├── useAuth.ts
│   └── useWallets.ts
├── utils/
│   ├── formatters.ts
│   └── validators.ts
├── constants/
│   ├── colors.ts
│   └── config.ts
└── types/
    └── index.ts
```

---

## Core Implementation

### API Client Setup

```typescript
// services/api.ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = 'https://api.jaxopay.com/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });
        
        const { access_token } = response.data;
        await SecureStore.setItemAsync('access_token', access_token);
        
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        // Navigate to login screen
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;
```

### Authentication Store

```typescript
// store/authStore.ts
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import api from '../services/api';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  kyc_tier: number;
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  biometricEnabled: boolean;
  
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  enableBiometric: () => Promise<boolean>;
  loginWithBiometric: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  biometricEnabled: false,

  login: async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, refresh_token, user } = response.data;
      
      await SecureStore.setItemAsync('access_token', access_token);
      await SecureStore.setItemAsync('refresh_token', refresh_token);
      
      set({ user, isAuthenticated: true });
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      // Ignore logout API errors
    }
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      
      const response = await api.get('/users/profile');
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch (error) {
      await SecureStore.deleteItemAsync('access_token');
      set({ isLoading: false });
    }
  },

  enableBiometric: async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    
    if (hasHardware && isEnrolled) {
      await SecureStore.setItemAsync('biometric_enabled', 'true');
      set({ biometricEnabled: true });
      return true;
    }
    return false;
  },

  loginWithBiometric: async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Login to JAXOPAY',
      fallbackLabel: 'Use password',
    });
    
    if (result.success) {
      // Check if we have a valid refresh token
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (refreshToken) {
        await get().checkAuth();
        return true;
      }
    }
    return false;
  },
}));
```

### Wallet Service Example

```typescript
// services/wallets.ts
import api from './api';

export interface Wallet {
  id: string;
  currency: string;
  balance: number;
  status: 'active' | 'frozen';
  is_default: boolean;
  created_at: string;
}

export const walletService = {
  getWallets: async (): Promise<Wallet[]> => {
    const response = await api.get('/wallets');
    return response.data.wallets;
  },

  createWallet: async (currency: string): Promise<Wallet> => {
    const response = await api.post('/wallets', { currency });
    return response.data;
  },

  transfer: async (fromWalletId: string, toWalletId: string, amount: number) => {
    const response = await api.post('/wallets/transfer', {
      from_wallet_id: fromWalletId,
      to_wallet_id: toWalletId,
      amount,
    });
    return response.data;
  },

  getTransactions: async (walletId: string, page = 1, limit = 20) => {
    const response = await api.get(`/wallets/${walletId}/transactions`, {
      params: { page, limit },
    });
    return response.data;
  },
};
```

---

## UI Components

### Design System Colors

```typescript
// constants/colors.ts
export const Colors = {
  light: {
    primary: '#22C55E',      // Green
    primaryDark: '#16A34A',
    secondary: '#F97316',    // Orange
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
  },
  dark: {
    primary: '#22C55E',
    primaryDark: '#16A34A',
    secondary: '#F97316',
    background: '#111827',
    surface: '#1F2937',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    border: '#374151',
    error: '#EF4444',
    success: '#22C55E',
    warning: '#F59E0B',
  },
};
```

### Reusable Button Component

```typescript
// components/ui/Button.tsx
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  loading?: boolean;
  disabled?: boolean;
}

export const Button = ({ 
  title, 
  onPress, 
  variant = 'primary', 
  loading, 
  disabled 
}: ButtonProps) => {
  const isPrimary = variant === 'primary';
  
  return (
    <TouchableOpacity
      style={[
        styles.button,
        isPrimary ? styles.primary : styles.outline,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#FFF' : Colors.light.primary} />
      ) : (
        <Text style={[
          styles.text,
          isPrimary ? styles.textPrimary : styles.textOutline,
        ]}>
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: {
    backgroundColor: Colors.light.primary,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  textPrimary: {
    color: '#FFFFFF',
  },
  textOutline: {
    color: Colors.light.primary,
  },
});
```

### Wallet Card Component

```typescript
// components/wallet/WalletCard.tsx
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/formatters';

interface WalletCardProps {
  currency: string;
  balance: number;
  onPress?: () => void;
}

const currencyGradients: Record<string, string[]> = {
  USD: ['#22C55E', '#16A34A'],
  NGN: ['#10B981', '#059669'],
  GBP: ['#6366F1', '#4F46E5'],
  EUR: ['#3B82F6', '#2563EB'],
};

export const WalletCard = ({ currency, balance, onPress }: WalletCardProps) => {
  const gradient = currencyGradients[currency] || currencyGradients.USD;
  
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.header}>
          <View style={styles.currencyBadge}>
            <Text style={styles.currencyText}>{currency}</Text>
          </View>
          <Ionicons name="wallet-outline" size={24} color="rgba(255,255,255,0.8)" />
        </View>
        
        <View style={styles.balanceContainer}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balance}>{formatCurrency(balance, currency)}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 20,
    height: 160,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currencyBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  currencyText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  balanceContainer: {
    marginTop: 'auto',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  balance: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
});
```

---

## Screen Implementations

### Dashboard Screen

```typescript
// app/(tabs)/index.tsx
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { walletService } from '../../services/wallets';
import { WalletCard } from '../../components/wallet/WalletCard';
import { QuickActions } from '../../components/dashboard/QuickActions';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  
  const { data: wallets, isLoading, refetch } = useQuery({
    queryKey: ['wallets'],
    queryFn: walletService.getWallets,
  });

  const totalBalance = wallets?.reduce((sum, w) => {
    // Convert to USD for display (simplified)
    return sum + w.balance;
  }, 0) || 0;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.first_name || 'User'}!</Text>
        <Text style={styles.totalLabel}>Total Balance</Text>
        <Text style={styles.totalBalance}>${totalBalance.toLocaleString()}</Text>
      </View>

      {/* Quick Actions */}
      <QuickActions />

      {/* Wallets */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Wallets</Text>
        {wallets?.map((wallet) => (
          <View key={wallet.id} style={styles.walletWrapper}>
            <WalletCard 
              currency={wallet.currency}
              balance={wallet.balance}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  greeting: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 16,
  },
  totalBalance: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '700',
    marginTop: 4,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  walletWrapper: {
    marginBottom: 16,
  },
});
```

---

## Push Notifications Setup

```typescript
// services/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import api from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const registerForPushNotifications = async () => {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get push token');
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync();
  
  // Register token with backend
  await api.post('/users/devices', {
    push_token: token.data,
    platform: Device.osName,
  });

  return token.data;
};
```

---

## Testing Strategy

### Unit Tests

```typescript
// __tests__/services/wallets.test.ts
import { walletService } from '../../services/wallets';
import api from '../../services/api';

jest.mock('../../services/api');

describe('walletService', () => {
  it('should fetch wallets successfully', async () => {
    const mockWallets = [
      { id: '1', currency: 'USD', balance: 1000 },
      { id: '2', currency: 'NGN', balance: 500000 },
    ];
    
    (api.get as jest.Mock).mockResolvedValue({ data: { wallets: mockWallets } });
    
    const result = await walletService.getWallets();
    
    expect(api.get).toHaveBeenCalledWith('/wallets');
    expect(result).toEqual(mockWallets);
  });
});
```

### E2E Tests with Detox

```javascript
// e2e/login.test.js
describe('Login Flow', () => {
  beforeAll(async () => {
    await device.launchApp();
  });

  it('should login successfully with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    
    await expect(element(by.id('dashboard-screen'))).toBeVisible();
  });

  it('should show error with invalid credentials', async () => {
    await element(by.id('email-input')).typeText('wrong@example.com');
    await element(by.id('password-input')).typeText('wrongpassword');
    await element(by.id('login-button')).tap();
    
    await expect(element(by.text('Invalid credentials'))).toBeVisible();
  });
});
```

---

## App Store Submission Checklist

### iOS
- [ ] App icons (all sizes)
- [ ] Launch screen
- [ ] App Store screenshots (all device sizes)
- [ ] Privacy policy URL
- [ ] App description and keywords
- [ ] Age rating questionnaire
- [ ] Export compliance (encryption)
- [ ] Sign in with Apple (if using social auth)

### Android
- [ ] App icons (all densities)
- [ ] Feature graphic
- [ ] Screenshots for phones and tablets
- [ ] Privacy policy URL
- [ ] Content rating questionnaire
- [ ] Target SDK level
- [ ] Signed APK/AAB

---

## Security Best Practices

1. **Token Storage**: Always use Keychain (iOS) / EncryptedSharedPreferences (Android)
2. **Certificate Pinning**: Implement SSL pinning in production
3. **Jailbreak/Root Detection**: Check for compromised devices
4. **Screen Capture**: Disable screenshots on sensitive screens
5. **Timeout**: Auto-logout after inactivity
6. **Biometric**: Require biometric for sensitive operations
7. **Obfuscation**: Enable code obfuscation for release builds

---

## Next Steps

1. Set up the project with Expo
2. Implement authentication flow
3. Build dashboard and wallet screens
4. Add virtual card management
5. Implement bill payments
6. Add push notifications
7. Test on physical devices
8. Submit to app stores
