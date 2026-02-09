# Master Prompt: Joxapay Flutter App Development

**Objective**: Build "Joxapay Mobile", a high-performance, production-grade cross-border fintech super app using Flutter. This app will mirror the functionality of the existing Jaxopay Web platform, connecting to the established Node.js/PostgreSQL backend.

---

## 1. Core Vision & Personality
Joxapay is a "Premium Fintech Super App". The UI should be:
- **Rich & Premium**: Use deep gradients, glassmorphism, and smooth micro-animations.
- **Brand Consistency**: Primary color is a deep vibrant wallet-centric palette (Blue/Purple/Emerald).
- **Inspiration**: Wise, Revolut, and Stripe. No generic Material Design.

## 2. Technical Stack
- **Framework**: Flutter (Current Stable).
- **State Management**: **Riverpod** (preferred) or **BLoC**. Ensure separation of Business Logic from UI.
- **Networking**: **Dio** with interceptors for JWT Auth and Device Fingerprinting.
- **Local Storage**: `flutter_secure_storage` for sensitive tokens; `hive` or `shared_preferences` for non-sensitive settings.
- **Icons**: `lucide_icons`.
- **Animations**: `lottie` for success/error screens; `framer_motion`-like transitions using `animations` package.

## 3. Architecture Requirements
- **Feature-first Architecture**: Group by feature (e.g., `features/auth/`, `features/wallets/`, `features/virtual_cards/`).
- **Clean API Integration**:
    - **Base Client**: Implement a global Dio instance.
    - **Auth Interceptor**: 
        - Auto-attach `Authorization: Bearer <token>`.
        - Handle 401: If token expires, intercept, call `/auth/refresh-token`, update storage, and retry the original request transparently.
    - **Header**: Always include `X-Device-Fingerprint`.
- **Responsive Design**: Support all phone aspect ratios and tablets.

## 4. Key Implementation Modules (Porting from Backend)
Refer to the `MOBILE_API_DOCUMENTATION.md` for endpoint details. Implement these in order:

### Phase 1: Authentication & Onboarding
- Smooth splash screen with logo animation.
- Login/Signup with email and phone verification (OTP flow).
- Biometric Login (FaceID/Fingerprint) integration using `local_auth`.

### Phase 2: Wallet & Core Ledger
- Multi-currency wallet carousel (USD, NGN, etc.).
- Real-time balance updates.
- Transaction history list with detailed receipt modals.
- "Internal Transfer" flow (Scan QR or Search User).

### Phase 3: Fintech Services
- **Virtual Cards**: 3D card visualization, Freeze/Unfreeze toggle, Loading funds.
- **Bills & Utilities**: Dynamic category selection, account validation.
- **Crypto**: Real-time rate charts (using `fl_chart`), Buy/Sell flows.
- **Cross-Border**: FX Calculator, Beneficiary management.

### Phase 4: Compliance & Support
- **KYC Tier UI**: Document upload camera integration.
- **Support Center**: Ticket system with real-time-like chatting.
- **Feature Toggles**: Call `/config/toggles` at app startup to dynamically show/hide features (e.g., hide Crypto if `is_crypto_enabled` is false).

## 5. Security Protocols
- **Screenshot Protection**: Obfuscate sensitive screens (Card details/Wallet balance).
- **Jailbreak/Root Detection**: Warn user if device is compromised.
- **SSL Pinning**: (Optional but recommended for production).

## 6. Development Instructions for Antigravity
1.  **Strict Coding**: Never use `print`. Use a dedicated `Logger`.
2.  **Mocking**: Use the provided API documentation to build the services. While the backend is in "Mock Provider" mode, the app should behave as if it's live.
3.  **UI Feedback**: Every button must have a haptic feedback or visual ripple. Errors must be shown in "Snackbars" or custom "Toast" widgets with precise messages from the backend.
4.  **Version Control**: Provide a clear `README.md` in the new folder explaining how to run the app and connect to the local backend.

---
**Initial Command**: "Initialize the project structure, setup the Dio networking layer with Auth Interceptor, and build the High-Fidelity Splash & Login screens based on the Joxapay vision."
