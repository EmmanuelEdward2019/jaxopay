# JAXOPAY Mobile App - Master API Documentation (Production)

This document provides the complete API reference for all **18+ modules** in the JAXOPAY ecosystem.

## 1. Core Architecture
- **Base URL**: `https://jaxopay-production.up.railway.app/api/v1`
- **Frontend**: `https://jaxopay.com`
- **Format**: All requests/responses are `application/json`.
- **Headers**:
  - `Authorization: Bearer <token>`
  - `X-Device-Fingerprint: <secure_hash>`
  - `Content-Type: application/json`

---

## 2. Authentication (`/auth`)
- `POST /signup`: Create account (email, phone, password).
- `POST /login`: Standard login (email/password).
- `POST /login/otp`: Request OTP for phone login.
- `POST /verify-otp`: Verify phone OTP.
- `POST /refresh-token`: Exchange refresh token for new access token.
- `POST /forgot-password`: Reset link request.
- `POST /reset-password`: Set new password with token.
- `POST /logout`: Invalidate session.

## 3. User Profile (`/users`)
- `GET /profile`: Get full user data.
- `PATCH /profile`: Update name, bio, address, country.
- `GET /statistics`: Get user-specific stats (total sent/received).
- `GET /activity`: Get recent activities (paginated).
- `PATCH /settings`: Update notification/privacy preferences.
- `PATCH /avatar`: Update profile picture URL.
- `GET /search?query=...`: Find other users by name/email (min 3 chars).
- `DELETE /account`: Terminate account (requires password).

## 4. Wallet System (`/wallets`)
- `GET /`: List all user wallets (NGN, USD, USDT, etc).
- `GET /balances`: Aggregated balance across all currencies.
- `POST /`: Create a new wallet in a specific currency.
- `POST /transfer`: Send money to another user's ID/Email.
- `POST /exchange`: Swap between two user wallets (e.g. USD to NGN).
- `POST /:walletId/add-funds`: (Sandbox) Mock deposit for testing.

## 5. Transactions (`/transactions`)
- `GET /`: List all movements (paginated, filterable by type/status).
- `GET /:id`: Full transaction details & receipt data.
- `GET /stats?period=30`: Transaction volume graph data.

## 6. KYC & Compliance (`/kyc`)
- `GET /status`: Current tier and verification state.
- `GET /limits`: Tier-based transaction limits.
- `POST /submit`: Upload ID, Selfie, and Address docs.
- `POST /upgrade`: Request a higher limit tier.

## 7. Virtual USD Cards (`/cards`)
- `GET /`: List all active/inactive virtual cards.
- `POST /`: Request new card (requires KYC Tier 2).
- `GET /:id`: Card details (Masked PAN, CVV, Expiry).
- `POST /:id/fund`: Load money from wallet to card.
- `PATCH /:id/freeze`: Temporarily disable card.
- `PATCH /:id/unfreeze`: Re-enable frozen card.
- `PATCH /:id/spending-limit`: Set daily/monthly limits.
- `DELETE /:id`: Permanently terminate card.
- `GET /:id/transactions`: Card-specific spending history.

## 8. Cross-Border Payments (`/payments`)
- `GET /corridors`: List supported send/receive country pairs.
- `GET /rates`: Real-time FX rates between currencies.
- `POST /send`: Execute cross-border transfer.
- `GET /beneficiaries`: Manage saved payout contacts.
- `POST /beneficiaries`: Save new payout details.

## 9. Crypto Operations (`/crypto`)
- `GET /rates`: Current market prices for USDT, BTC, ETH.
- `POST /buy`: Purchase crypto using fiat wallet.
- `POST /sell`: Sell crypto and credit fiat wallet.
- `GET /stats`: Crypto portfolio performance.

## 10. Utility Bill Payments (`/bills`)
- `GET /categories`: Electricity, TV, Internet, etc.
- `GET /providers`: Find providers by country and category.
- `POST /validate`: Verify Meter NO or SmartCard NO.
- `POST /pay`: Execution of bill payment.
- `GET /history`: List of paid bills.

## 11. Flight Bookings (`/flights`)
- `GET /search`: Real-time flight search (Origin, Dest, Date).
- `POST /book`: Book a flight and pay via wallet.
- `GET /bookings`: List user flight tickets.
- `GET /bookings/:id`: View e-ticket and status.
- `DELETE /bookings/:id`: Cancel booking (where allowed).

## 12. Gift Card Marketplace (`/gift-cards`)
- `GET /`: Browse available gift cards by brand/category.
- `GET /categories`: iTunes, Amazon, Steam, etc.
- `POST /buy`: Purchase digital gift card codes.
- `POST /sell`: Sell unused gift card codes (Credits wallet).
- `GET /my-cards`: List of cards bought/sold.

## 13. Platform Config (`/config`)
- `GET /toggles`: **CRITICAL** - Key/Value pairs for enabling/disabling UI features (e.g., `is_crypto_enabled: true`).
- `GET /platform`: Global metadata (supported countries, app versions).

## 14. Support Tickets (`/tickets`)
- `POST /`: Open a new support ticket.
- `GET /my-tickets`: View open/closed tickets.
- `GET /:id`: View ticket thread/replies.
- `POST /:id/reply`: Send a message to agent.
- `PATCH /:id/close`: Resolve ticket.

## 15. Notifications (`/notifications`)
- `GET /`: List of recent push/in-app notifications.
- `GET /unread-count`: Badge count for app icon.
- `PATCH /:id/read`: Mark single as read.
- `POST /read-all`: Mark all as read.

## 16. Announcements (`/announcements`)
- `GET /active`: Global banners/messages from admins (e.g., "System Maintenance at 12 AM").

## 17. SMS & OTP (`/sms`)
- `POST /send-otp`: Trigger a verification code.
- `POST /verify`: Global verification endpoint for actions.

## 18. Dashboard Summary (`/dashboard`)
- `GET /`: High-level summary (Balance, Recent activity, Feature shortcuts).

## 19. Admin (Mobile Support) (`/admin`)
- Various endpoints for Admins to manage users/KYC directly from mobile (if role is admin).

---

## Technical Appendix
- **Error Types**: 400 (Client), 401 (Auth), 403 (KYC/Banned), 429 (Rate Limit), 500 (Server).
- **Standard Pagination**: Page starts at 1, Default limit is 20.
