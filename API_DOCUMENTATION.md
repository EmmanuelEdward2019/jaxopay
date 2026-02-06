# JAXOPAY API Documentation

## Overview

This document provides comprehensive API documentation for the JAXOPAY backend, designed to enable mobile app development. The API follows RESTful conventions and uses JSON for request/response bodies.

## Base URL

```
Production: https://api.jaxopay.com/api/v1
Development: http://localhost:3000/api/v1
```

## Authentication

All authenticated endpoints require a JWT Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

### Token Refresh

Access tokens expire after 1 hour. Use the refresh token to obtain new access tokens without re-authentication.

---

## Authentication Endpoints

### Register

```http
POST /auth/register
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email address |
| password | string | Yes | Min 8 characters |
| first_name | string | No | First name |
| last_name | string | No | Last name |
| phone | string | No | Phone number |

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "kyc_tier": 0
  }
}
```

### Login

```http
POST /auth/login
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Email address |
| password | string | Yes | Password |

**Response:**
```json
{
  "success": true,
  "access_token": "jwt_token",
  "refresh_token": "refresh_token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "kyc_tier": 1
  }
}
```

### Login with Phone OTP

```http
POST /auth/login/phone
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Phone number |
| otp | string | Yes | 6-digit OTP |

### Request OTP

```http
POST /auth/otp/request
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| phone | string | Yes | Phone number |

### Verify Email

```http
POST /auth/verify-email
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Email verification token |

### Forgot Password

```http
POST /auth/forgot-password
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Email address |

### Reset Password

```http
POST /auth/reset-password
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| token | string | Yes | Reset token from email |
| password | string | Yes | New password |

### Enable 2FA

```http
POST /auth/2fa/enable
```

**Response:**
```json
{
  "success": true,
  "secret": "OTPAUTH_SECRET",
  "qr_code": "data:image/png;base64,..."
}
```

### Verify 2FA

```http
POST /auth/2fa/verify
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | 6-digit TOTP code |

### Refresh Token

```http
POST /auth/refresh
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| refresh_token | string | Yes | Refresh token |

### Logout

```http
POST /auth/logout
```

Invalidates the current session.

---

## User Endpoints

### Get Profile

```http
GET /users/profile
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "phone": "+1234567890",
  "avatar_url": "https://...",
  "kyc_tier": 1,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Update Profile

```http
PATCH /users/profile
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| first_name | string | No | First name |
| last_name | string | No | Last name |
| phone | string | No | Phone number |

### Upload Avatar

```http
POST /users/avatar
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| avatar | file | Yes | Image file (JPG, PNG) |

### Get User Stats

```http
GET /users/stats
```

**Response:**
```json
{
  "total_wallets": 5,
  "total_cards": 2,
  "total_transactions": 156,
  "total_volume": 25000.00
}
```

### Get Activity Log

```http
GET /users/activity
```

Query Parameters:
- `page` (default: 1)
- `limit` (default: 20)

---

## Wallet Endpoints

### Get All Wallets

```http
GET /wallets
```

**Response:**
```json
{
  "wallets": [
    {
      "id": "uuid",
      "currency": "USD",
      "balance": 1500.00,
      "status": "active",
      "is_default": true,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create Wallet

```http
POST /wallets
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| currency | string | Yes | Currency code (USD, NGN, GBP, EUR) |

### Get Wallet by ID

```http
GET /wallets/:walletId
```

### Get Wallet Transactions

```http
GET /wallets/:walletId/transactions
```

Query Parameters:
- `page` (default: 1)
- `limit` (default: 20)
- `type` (credit, debit)
- `start_date`
- `end_date`

### Transfer Between Wallets

```http
POST /wallets/transfer
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| from_wallet_id | string | Yes | Source wallet |
| to_wallet_id | string | Yes | Destination wallet |
| amount | number | Yes | Transfer amount |

### Freeze Wallet

```http
POST /wallets/:walletId/freeze
```

### Unfreeze Wallet

```http
POST /wallets/:walletId/unfreeze
```

### Fund Wallet (Deposit)

```http
POST /wallets/:walletId/fund
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Amount to fund |
| payment_method | string | Yes | Payment method ID |

### Withdraw from Wallet

```http
POST /wallets/:walletId/withdraw
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| amount | number | Yes | Withdrawal amount |
| bank_account_id | string | Yes | Bank account ID |

---

## Virtual Card Endpoints

### Get All Cards

```http
GET /cards
```

**Response:**
```json
{
  "cards": [
    {
      "id": "uuid",
      "card_number": "4111111111111111",
      "expiry_month": "12",
      "expiry_year": "2027",
      "cvv": "123",
      "balance": 500.00,
      "currency": "USD",
      "status": "active",
      "type": "multi_use",
      "spending_limit": 10000.00,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### Create Card

```http
POST /cards
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| wallet_id | string | Yes | Funding wallet |
| type | string | Yes | `single_use` or `multi_use` |
| initial_balance | number | No | Initial funding amount |
| spending_limit | number | No | Monthly spending limit |
| label | string | No | Card nickname |

### Get Card by ID

```http
GET /cards/:cardId
```

### Get Card Transactions

```http
GET /cards/:cardId/transactions
```

### Fund Card

```http
POST /cards/:cardId/fund
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| wallet_id | string | Yes | Source wallet |
| amount | number | Yes | Funding amount |

### Freeze Card

```http
POST /cards/:cardId/freeze
```

### Unfreeze Card

```http
POST /cards/:cardId/unfreeze
```

### Terminate Card

```http
DELETE /cards/:cardId
```

---

## Transaction Endpoints

### Get All Transactions

```http
GET /transactions
```

Query Parameters:
- `page` (default: 1)
- `limit` (default: 20)
- `type` (credit, debit, transfer)
- `status` (completed, pending, failed)
- `currency`
- `start_date`
- `end_date`
- `wallet_id`

**Response:**
```json
{
  "transactions": [
    {
      "id": "uuid",
      "type": "credit",
      "amount": 100.00,
      "currency": "USD",
      "status": "completed",
      "description": "Wallet funding",
      "reference": "TXN_123456",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 156,
  "page": 1,
  "limit": 20
}
```

### Get Transaction by ID

```http
GET /transactions/:transactionId
```

---

## KYC Endpoints

### Get KYC Status

```http
GET /kyc/status
```

**Response:**
```json
{
  "tier": 1,
  "status": "verified",
  "limits": {
    "daily_transaction": 10000,
    "monthly_transaction": 50000,
    "card_limit": 5000
  },
  "required_for_upgrade": ["government_id", "proof_of_address"]
}
```

### Submit KYC Document

```http
POST /kyc/documents
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| document_type | string | Yes | `passport`, `national_id`, `drivers_license` |
| document_number | string | Yes | Document number |
| document_front | file | Yes | Front image |
| document_back | file | No | Back image (if applicable) |
| selfie | file | No | Selfie with document |

### Get Submitted Documents

```http
GET /kyc/documents
```

### Get Tier Limits

```http
GET /kyc/limits
```

---

## Bill Payment Endpoints

### Get Bill Categories

```http
GET /bills/categories
```

**Response:**
```json
{
  "categories": [
    {
      "id": "airtime",
      "name": "Airtime",
      "icon": "phone"
    },
    {
      "id": "electricity",
      "name": "Electricity",
      "icon": "zap"
    }
  ]
}
```

### Get Providers by Category

```http
GET /bills/providers/:categoryId
```

**Response:**
```json
{
  "providers": [
    {
      "id": "mtn_ng",
      "name": "MTN Nigeria",
      "logo_url": "https://...",
      "min_amount": 100,
      "max_amount": 50000
    }
  ]
}
```

### Validate Account

```http
POST /bills/validate
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| provider_id | string | Yes | Provider ID |
| account_number | string | Yes | Customer account/meter number |

**Response:**
```json
{
  "valid": true,
  "customer_name": "John Doe",
  "account_number": "1234567890"
}
```

### Pay Bill

```http
POST /bills/pay
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| provider_id | string | Yes | Provider ID |
| account_number | string | Yes | Customer account |
| amount | number | Yes | Payment amount |
| wallet_id | string | Yes | Debiting wallet |

### Get Payment History

```http
GET /bills/history
```

---

## Crypto Exchange Endpoints

### Get Supported Cryptocurrencies

```http
GET /crypto/currencies
```

**Response:**
```json
{
  "currencies": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "icon_url": "https://...",
      "min_buy": 0.0001,
      "min_sell": 0.0001
    }
  ]
}
```

### Get Exchange Rates

```http
GET /crypto/rates
```

Query Parameters:
- `base` (e.g., USD)
- `crypto` (e.g., BTC)

**Response:**
```json
{
  "BTC": {
    "buy": 45000.00,
    "sell": 44800.00
  }
}
```

### Buy Crypto

```http
POST /crypto/buy
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| crypto | string | Yes | Crypto symbol (BTC, ETH) |
| amount | number | Yes | Fiat amount to spend |
| wallet_id | string | Yes | Funding wallet |

### Sell Crypto

```http
POST /crypto/sell
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| crypto | string | Yes | Crypto symbol |
| amount | number | Yes | Crypto amount to sell |
| wallet_id | string | Yes | Receiving wallet |

### Get Crypto Transaction History

```http
GET /crypto/history
```

---

## Gift Card Endpoints

### Get Gift Card Categories

```http
GET /giftcards/categories
```

### Get Available Gift Cards

```http
GET /giftcards
```

Query Parameters:
- `category`
- `country`

**Response:**
```json
{
  "giftcards": [
    {
      "id": "uuid",
      "name": "Amazon Gift Card",
      "brand": "Amazon",
      "denominations": [25, 50, 100, 200],
      "currency": "USD",
      "discount_percent": 2,
      "image_url": "https://..."
    }
  ]
}
```

### Buy Gift Card

```http
POST /giftcards/buy
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| giftcard_id | string | Yes | Gift card template ID |
| denomination | number | Yes | Card value |
| wallet_id | string | Yes | Funding wallet |
| quantity | number | No | Number of cards (default: 1) |

### Sell Gift Card

```http
POST /giftcards/sell
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| brand | string | Yes | Gift card brand |
| code | string | Yes | Gift card code |
| pin | string | No | Card PIN if applicable |
| value | number | Yes | Card face value |
| image | file | Yes | Card image |

### Get My Gift Cards

```http
GET /giftcards/my-cards
```

### Redeem Gift Card

```http
POST /giftcards/:cardId/redeem
```

---

## Flight Booking Endpoints

### Search Flights

```http
GET /flights/search
```

Query Parameters:
- `origin` (IATA code)
- `destination` (IATA code)
- `depart_date` (YYYY-MM-DD)
- `return_date` (YYYY-MM-DD, optional)
- `passengers` (default: 1)
- `cabin_class` (economy, business, first)

**Response:**
```json
{
  "flights": [
    {
      "id": "uuid",
      "airline": "Delta Airlines",
      "flight_number": "DL123",
      "origin": "JFK",
      "destination": "LAX",
      "departure_time": "08:00",
      "arrival_time": "11:30",
      "duration": "5h 30m",
      "price": 350.00,
      "currency": "USD",
      "baggage_allowance": "23kg",
      "cabin_class": "economy"
    }
  ]
}
```

### Book Flight

```http
POST /flights/book
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| flight_id | string | Yes | Selected flight |
| wallet_id | string | Yes | Payment wallet |
| passengers | array | Yes | Passenger details |

**Passenger Object:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "date_of_birth": "1990-01-15",
  "passport_number": "AB123456"
}
```

### Get My Bookings

```http
GET /flights/bookings
```

### Get Booking by ID

```http
GET /flights/bookings/:bookingId
```

### Cancel Booking

```http
DELETE /flights/bookings/:bookingId
```

---

## Cross-Border Payments

### Get Transfer Corridors

```http
GET /payments/corridors
```

### Get Transfer Quote

```http
POST /payments/quote
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| source_currency | string | Yes | Sending currency |
| destination_currency | string | Yes | Receiving currency |
| amount | number | Yes | Send amount |

**Response:**
```json
{
  "source_amount": 1000.00,
  "source_currency": "USD",
  "destination_amount": 1580000.00,
  "destination_currency": "NGN",
  "exchange_rate": 1580.00,
  "fee": 5.00,
  "total_cost": 1005.00,
  "delivery_time": "1-2 business days"
}
```

### Send Money

```http
POST /payments/send
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| beneficiary_id | string | Yes | Recipient ID |
| wallet_id | string | Yes | Source wallet |
| amount | number | Yes | Amount to send |
| purpose | string | No | Transfer purpose |

### Get Beneficiaries

```http
GET /payments/beneficiaries
```

### Add Beneficiary

```http
POST /payments/beneficiaries
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Recipient name |
| country | string | Yes | Country code |
| bank_name | string | Yes | Bank name |
| account_number | string | Yes | Account number |
| routing_number | string | No | Routing/sort code |

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Invalid or expired token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input data |
| INSUFFICIENT_BALANCE | 400 | Wallet balance too low |
| KYC_REQUIRED | 403 | KYC verification needed |
| RATE_LIMIT | 429 | Too many requests |
| SERVER_ERROR | 500 | Internal server error |

---

## Rate Limiting

- 100 requests per minute for authenticated users
- 20 requests per minute for unauthenticated users
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Webhooks (Optional)

Configure webhooks in dashboard for real-time events:

- `transaction.completed`
- `transaction.failed`
- `kyc.verified`
- `card.created`
- `payment.received`

Webhook payloads include:
```json
{
  "event": "transaction.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": { ... }
}
```

---

## Mobile Development Guide

### Recommended Libraries

**iOS (Swift):**
- Alamofire for networking
- KeychainSwift for secure token storage
- Combine for reactive programming

**Android (Kotlin):**
- Retrofit + OkHttp for networking
- EncryptedSharedPreferences for token storage
- Kotlin Coroutines for async operations

**React Native / Flutter:**
- Axios or Dio for HTTP
- secure-storage for token management
- Built-in async/await

### Authentication Flow

1. User enters credentials
2. Call `/auth/login` endpoint
3. Store `access_token` securely (Keychain/EncryptedStorage)
4. Store `refresh_token` separately
5. Add token to all authenticated requests
6. Handle 401 by refreshing token
7. If refresh fails, redirect to login

### Biometric Authentication

Store user's refresh token securely and gate access with biometrics:

```swift
// iOS Example
let context = LAContext()
context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, 
                       localizedReason: "Access your account") { success, error in
    if success {
        // Retrieve stored token and refresh session
    }
}
```

### Push Notifications

1. Register device token with backend
2. Handle notification payloads for:
   - Transaction alerts
   - KYC status updates
   - Promotional offers

### Offline Support

- Cache wallet balances locally
- Queue transactions when offline
- Sync when connection restored
- Show last-known data with timestamp
