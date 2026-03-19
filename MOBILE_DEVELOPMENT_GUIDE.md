# JAXOPAY Mobile App Development Guide (React Native)

## Overview

This guide provides a comprehensive roadmap for building the JAXOPAY mobile application using **React Native + Expo**. The app is designed to serve the **End User** role, consuming the orchestration layer API.

---

## Technology Stack Recommendation

### **React Native + Expo (Primary)**
- **Pros**: Shared architecture with the JAXOPAY web ecosystem, native performance, and rapid deployment via Expo.
- **State Management**: Zustand (Recommended for simplicity and performance).
- **Networking**: Axios (with centralized Interceptors).
- **Styling**: NativeWind (Tailwind for RN) or Styled Components.

---

## 2. Production Environment (Live)

- **API Base URL**: `https://jaxopay-production.up.railway.app/api/v1`
- **Dashboard URL**: `https://jaxopay.com`
- **Notification Engine**: Resend API (Transactional Emails)

---

## Project Setup

### 1. Initialize Expo Project

```bash
# Create new project with TypeScript
npx create-expo-app jaxopay-mobile --template expo-template-blank-typescript

# Navigate to project
cd jaxopay-mobile

# Install Essential Dependencies
npx expo install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-secure-store expo-local-authentication
npx expo install axios zustand
npx expo install react-native-reanimated react-native-gesture-handler
npx expo install lucide-react-native expo-linear-gradient expo-haptics
```

### 2. Recommended Directory Structure

```
jaxopay-mobile/
├── src/
│   ├── api/             # Axios instance & Interceptors
│   ├── components/      # UI Components (Atomic Design)
│   ├── hooks/           # Custom React Hooks
│   ├── navigation/      # React Navigation Config
│   ├── screens/         # Page/Screen Components
│   ├── store/           # Zustand Stores
│   ├── utils/           # Formatters & Helpers
│   └── theme/           # Global Colors & Spacing
├── app.json
└── App.tsx
```

---

## Core Implementation Patterns

### 1. Secure API Client (src/api/client.ts)

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const client = axios.create({
  baseURL: 'https://jaxopay-production.up.railway.app/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

// Inject Security Headers
client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  
  // Mandatory for JAXOPAY Security
  config.headers['X-Device-Fingerprint'] = 'device-unique-hash'; 
  return config;
});

// Handle Token Refresh (401)
client.interceptors.response.use(
  res => res,
  async (err) => {
    if (err.response?.status === 401) {
      // Logic to call /auth/refresh-token
    }
    return Promise.reject(err);
  }
);

export default client;
```

### 2. Global State (src/store/useWalletStore.ts)

```typescript
import { create } from 'zustand';
import client from '../api/client';

interface WalletState {
  wallets: any[];
  isLoading: boolean;
  fetchWallets: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set) => ({
  wallets: [],
  isLoading: false,
  fetchWallets: async () => {
    set({ isLoading: true });
    const { data } = await client.get('/wallets');
    set({ wallets: data.wallets, isLoading: false });
  }
}));
```

---

## Email & Notifications (Resend Integration)

The mobile app does not need to call Resend directly. The backend orchestration layer is pre-configured to:
1.  **Welcome Emails**: Triggered automatically on `POST /auth/signup`.
2.  **Transaction Receipts**: Triggered on `POST /wallets/transfer`, `POST /transfers/send`, `POST /bills/pay`, and `POST /crypto/sell`.
3.  **Deposit Confirmation**: Triggered when a VBA deposit or Crypto deposit reflects.
4.  **Admin Alerts**: Sent to the platform admin for high-value or critical transactions.

---

## Key Implementation Details

1. **VBA Integration**: Use `GET /wallets/vba/:walletId` to show the user their unique bank account details for funding their NGN wallet.
2. **Crypto Deposits**: 
   - First, call `GET /crypto/config` to get the list of supported networks.
   - Then, call `GET /crypto/deposit-address` with the selected `coin` and `network`.
   - Always display the **QR Code** and a "Copy Address" button.
3. **Withdrawals**: Ensure the user has **KYC Tier 2** status before allowing withdrawals via `POST /crypto/withdraw` or `POST /transfers/send`.

---

## Security Best Practices

1. **Biometrics**: Always gate the "Transfer" and "View Card Details" actions behind `expo-local-authentication`.
2. **Secure Store**: Never store JWTs in plain `AsyncStorage`. Use `expo-secure-store`.
3. **Currency Handling**: Always use `parseFloat()` when calculating sums of balances (like Total Balance) to prevent `NaN` or string concatenation errors.
4. **Obfuscation**: Use ProGuard (Android) and ensure sensitive data is not logged in production.

---

## Next Steps

1. Create the `AuthStack` (Login/Signup).
2. Implement the `MainTab` (Dashboard, Wallets, Cards).
3. Connect the **Resend** notification events to your transaction success screens.
