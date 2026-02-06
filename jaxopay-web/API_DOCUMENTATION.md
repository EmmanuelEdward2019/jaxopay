# JAXOPAY API Documentation

## Overview
This document provides comprehensive API documentation for JAXOPAY mobile app development. All endpoints use RESTful conventions and return JSON responses.

## Base URL
```
Production: https://api.jaxopay.com/v1
Development: http://localhost:3000/api/v1
```

## Authentication
All authenticated endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <access_token>
```

### Authentication Endpoints

#### POST /auth/signup
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "phone": "+1234567890",
  "country_code": "US",
  "metadata": {
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "role": "end_user",
      "kyc_tier": "tier_0",
      "created_at": "2024-01-01T00:00:00Z"
    },
    "session": {
      "access_token": "jwt_token",
      "refresh_token": "refresh_token",
      "expires_at": "2024-01-02T00:00:00Z"
    }
  }
}
```

#### POST /auth/login
Authenticate user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": { /* user object */ },
    "session": { /* session object */ }
  }
}
```

#### POST /auth/login/otp
Request OTP for phone-based authentication.

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "expires_in": 300
  }
}
```

#### POST /auth/verify-otp
Verify OTP and complete authentication.

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

#### POST /auth/refresh
Refresh access token using refresh token.

**Request Body:**
```json
{
  "refresh_token": "refresh_token_here"
}
```

#### POST /auth/logout
Invalidate current session.

**Headers:** Authorization required

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### POST /auth/forgot-password
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### POST /auth/reset-password
Reset password with token from email.

**Request Body:**
```json
{
  "token": "reset_token",
  "new_password": "NewSecurePass123!"
}
```

### User Profile Endpoints

#### GET /users/me
Get current user profile.

**Headers:** Authorization required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "phone": "+1234567890",
    "role": "end_user",
    "kyc_tier": "tier_1",
    "kyc_status": "approved",
    "is_email_verified": true,
    "is_phone_verified": true,
    "two_fa_enabled": false,
    "profile": {
      "first_name": "John",
      "last_name": "Doe",
      "date_of_birth": "1990-01-01",
      "country": "US",
      "avatar_url": "https://..."
    },
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

#### PATCH /users/me
Update user profile.

**Headers:** Authorization required

**Request Body:**
```json
{
  "profile": {
    "first_name": "John",
    "last_name": "Doe",
    "phone": "+1234567890"
  }
}
```

### Wallet Endpoints

#### GET /wallets
Get all user wallets.

**Headers:** Authorization required

**Query Parameters:**
- `currency` (optional): Filter by currency code
- `type` (optional): Filter by wallet type (fiat/crypto)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "wallet_type": "fiat",
      "currency": "USD",
      "balance": "1000.50",
      "available_balance": "950.50",
      "locked_balance": "50.00",
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST /wallets
Create a new wallet.

**Headers:** Authorization required

**Request Body:**
```json
{
  "currency": "NGN",
  "wallet_type": "fiat"
}
```

#### GET /wallets/:id/balance
Get wallet balance.

**Headers:** Authorization required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "balance": "1000.50",
    "available_balance": "950.50",
    "locked_balance": "50.00",
    "currency": "USD"
  }
}
```

#### GET /wallets/:id/ledger
Get wallet transaction ledger.

**Headers:** Authorization required

**Query Parameters:**
- `limit` (default: 50)
- `offset` (default: 0)
- `start_date` (optional)
- `end_date` (optional)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "uuid",
        "entry_type": "credit",
        "amount": "100.00",
        "balance_before": "900.50",
        "balance_after": "1000.50",
        "description": "Deposit from bank",
        "created_at": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 50,
      "offset": 0
    }
  }
}
```

### Transaction Endpoints

#### GET /transactions
Get user transactions.

**Headers:** Authorization required

**Query Parameters:**
- `type` (optional): Filter by transaction type
- `status` (optional): Filter by status
- `limit` (default: 50)
- `offset` (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "transaction_type": "transfer",
        "status": "completed",
        "from_currency": "USD",
        "to_currency": "NGN",
        "from_amount": "100.00",
        "to_amount": "75000.00",
        "exchange_rate": "750.00",
        "fee_amount": "2.50",
        "reference": "TXN-20240101-ABC123",
        "description": "Transfer to John Doe",
        "created_at": "2024-01-01T00:00:00Z",
        "completed_at": "2024-01-01T00:05:00Z"
      }
    ],
    "pagination": {
      "total": 100,
      "limit": 50,
      "offset": 0
    }
  }
}
```

#### GET /transactions/:id
Get transaction details.

**Headers:** Authorization required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "transaction_type": "transfer",
    "status": "completed",
    "from_wallet_id": "uuid",
    "to_wallet_id": "uuid",
    "from_currency": "USD",
    "to_currency": "NGN",
    "from_amount": "100.00",
    "to_amount": "75000.00",
    "exchange_rate": "750.00",
    "fee_amount": "2.50",
    "net_amount": "97.50",
    "reference": "TXN-20240101-ABC123",
    "external_reference": "EXT-REF-123",
    "description": "Transfer to John Doe",
    "metadata": {},
    "created_at": "2024-01-01T00:00:00Z",
    "completed_at": "2024-01-01T00:05:00Z"
  }
}
```

#### POST /transactions/transfer
Initiate a wallet transfer.

**Headers:** Authorization required

**Request Body:**
```json
{
  "from_wallet_id": "uuid",
  "to_wallet_id": "uuid",
  "amount": "100.00",
  "description": "Payment for services",
  "metadata": {}
}
```


