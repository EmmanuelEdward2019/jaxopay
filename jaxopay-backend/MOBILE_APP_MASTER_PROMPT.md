# Master Prompt: JAXOPAY Mobile App Development (v2 - React Native Edition)

**Objective**: Build "JAXOPAY Mobile", a high-performance, production-grade cross-border fintech super app using **React Native + Expo**. This app connects to the live JAXOPAY backend hosted on Railway.

---

## 1. Core Vision & Personality
JAXOPAY is a "Premium Fintech Super App". The UI should be:
- **Rich & Premium**: Use deep gradients, glassmorphism, and smooth micro-animations.
- **Brand Consistency**: Colors must align with the web platform (Vibrant Emerald/Blue/Slate).
- **Core URL**: `https://jaxopay-production.up.railway.app/api/v1`

## 2. Technical Stack
- **Framework**: React Native with **Expo SDK (LTS)**.
- **Navigation**: **React Navigation** (Native Stack & Bottom Tabs).
- **State Management**: **Zustand** is the required standard for this project (lightweight and native-friendly).
- **Networking**: **Axios** with interceptors for:
    - **Auth**: Automatic `Bearer` token injection and 401 token refresh.
    - **Security**: Mandatory `X-Device-Fingerprint` header.
- **Persistence**: `expo-secure-store` (Tokens) and `AsyncStorage` (Cache).
- **Icons**: `lucide-react-native` or `react-native-vector-icons`.
- **UI Components**: `react-native-reanimated` for premium animations.

## 3. Global Configuration
- **Base URL**: `https://jaxopay-production.up.railway.app/api/v1`
- **Frontend Domain**: `https://jaxopay.com`
- **CORS Scope**: Only requests from the app or jaxopay.com are permitted.

## 4. Key Implementation Modules
Refer to `jaxopay-backend/MOBILE_API_DOCUMENTATION.md` for specific endpoints.

### Phase 1: Identity & Security
- **Biometric Lock**: Integrated with `expo-local-authentication`.
- **JWT Lifecycle**: Handling `access_token` and `refresh_token` seamlessly via Axios interceptors.
- **Onboarding**: High-fidelity walkthrough screens using `react-native-reanimated`.

### Phase 2: Financial Core
- **Wallets**: Multi-currency support (NGN, USD, GBP, EUR) with real-time balance fetching.
- **Transfers**: Internal P2P transfers and Cross-Border FX payments.
- **Virtual Cards**: Interactive card visualization, fund loading, and toggle switches for security.
- **Notifications**: Automatic email receipts and alerts triggered via the **Resend API** integration on the backend.

### Phase 3: Marketplace & Utilities
- **Crypto**: Real-time ticker prices and Buy/Sell functionality.
- **Bills**: Dynamic provider lists for Utilities (Electricity), Airtime, and TV.
- **Gift Cards**: Purchasing and Selling marketplace.

## 5. Security Protocols
- **Screenshot Protection**: Obfuscate sensitive screens (Card numbers/Balance) using native modules.
- **SSL Pinning**: Mandatory for production release.

## 6. Prompt Engineering Instructions
When working with this project, ensure:
1. **No Placeholders**: If a service is called, implement the actual API logic according to the documentation.
2. **Error Handling**: Use consistent error mapping (Validation, Auth, Server failures).
3. **Resend Integration**: All financial actions automatically trigger email workflows; ensure the app reflects the status of these notifications where applicable.

---
**Initial Command**: "Execute `npx create-expo-app jaxopay_mobile`, set up the Zustand store architecture, configure the Axios client with the production Railway URL, and build the High-Fidelity Splash and Login systems."
