# Master Prompt: JAXOPAY Flutter App Development (v2 - Production Ready)

**Objective**: Build "JAXOPAY Mobile", a high-performance, production-grade cross-border fintech super app using Flutter. This app connects to the live JAXOPAY backend hosted on Railway.

---

## 1. Core Vision & Personality
JAXOPAY is a "Premium Fintech Super App". The UI should be:
- **Rich & Premium**: Use deep gradients, glassmorphism, and smooth micro-animations.
- **Brand Consistency**: Colors must align with the web platform (Vibrant Emerald/Blue/Slate).
- **Core URL**: `https://jaxopay-production.up.railway.app/api/v1`

## 2. Technical Stack
- **Framework**: Flutter (LTS).
- **State Management**: **Riverpod** is the required standard for this project.
- **Networking**: **Dio** with interceptors for:
    - **Auth**: Automatic `Bearer` token injection and 401 token refresh.
    - **Security**: Mandatory `X-Device-Fingerprint` header.
- **Persistence**: `flutter_secure_storage` (Tokens) and `isar` or `hive` (Cache).
- **Icons**: `lucide_icons`.

## 3. Global Configuration
- **Base URL**: `https://jaxopay-production.up.railway.app/api/v1`
- **Frontend Domain**: `https://jaxopay.com`
- **CORS Scope**: Only requests from the app or jaxopay.com are permitted.

## 4. Key Implementation Modules
Refer to `jaxopay-backend/MOBILE_API_DOCUMENTATION.md` for specific endpoints.

### Phase 1: Identity & Security
- **Biometric Lock**: Integrated with `local_auth`.
- **JWT Lifecycle**: Handling `access_token` and `refresh_token` seamlessly.
- **Onboarding**: High-fidelity walkthrough screens.

### Phase 2: Financial Core
- **Wallets**: Multi-currency support (NGN, USD, GBP, EUR) with real-time balance fetching.
- **Transfers**: Internal P2P transfers and Cross-Border FX payments.
- **Virtual Cards**: Interactive 3D card flipping, fund loading, and toggle switches for security.

### Phase 3: Marketplace & Utilities
- **Crypto**: Real-time ticker prices and Buy/Sell functionality.
- **Bills**: Dynamic provider lists for Utilities, Airtime, and TV.
- **Gift Cards**: Purchasing and Selling marketplace.

## 5. Security Protocols
- **Screenshot Protection**: Obfuscate sensitive screens (Card numbers/Balance).
- **Certificate Pinning**: Mandatory for production release.

## 6. Prompt Engineering Instructions
When working with this project, ensure:
1. **No Placeholders**: If a service is called, implement the actual API logic according to the documentation.
2. **Error Handling**: Use the central logic from `jaxopay-web` where errors are categorized (Validation, Auth, Server).
3. **Production URL**: Always use the Railway URL for production builds.

---
**Initial Command**: "Execute `flutter create jaxopay_mobile`, set up the Riverpod architecture, configure the Dio client with the production Railway URL, and build the High-Fidelity Splash and Login systems."
