# API Testing Guide

Quick guide to test the JAXOPAY backend API endpoints.

## Prerequisites

1. Backend server running on `http://localhost:3000`
2. Database configured and connected
3. `curl` or Postman installed

---

## 1. Authentication Flow

### Signup
```bash
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Test@1234",
    "phone": "+1234567890",
    "country_code": "US",
    "metadata": {
      "first_name": "John",
      "last_name": "Doe"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "user": { "id": "...", "email": "john@example.com", ... },
    "session": {
      "access_token": "eyJhbGc...",
      "refresh_token": "eyJhbGc...",
      "expires_in": "15m"
    }
  }
}
```

### Login
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "Test@1234"
  }'
```

### Login with OTP
```bash
# Request OTP
curl -X POST http://localhost:3000/api/v1/auth/login/otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890"}'

# Verify OTP
curl -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "otp": "123456"
  }'
```

---

## 2. Wallet Operations

**Note:** Replace `YOUR_ACCESS_TOKEN` with the token from login response.

### Get All Wallets
```bash
curl http://localhost:3000/api/v1/wallets \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Balances Summary
```bash
curl http://localhost:3000/api/v1/wallets/balances \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Create Wallet
```bash
curl -X POST http://localhost:3000/api/v1/wallets \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currency": "EUR",
    "wallet_type": "fiat"
  }'
```

### Transfer Money
```bash
curl -X POST http://localhost:3000/api/v1/wallets/transfer \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipient_id": "RECIPIENT_USER_ID",
    "amount": 100,
    "currency": "USD",
    "description": "Payment for services"
  }'
```

### Add Funds (Testing)
```bash
curl -X POST http://localhost:3000/api/v1/wallets/WALLET_ID/add-funds \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "description": "Test funds"
  }'
```

---

## 3. User Profile

### Get Profile
```bash
curl http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Update Profile
```bash
curl -X PUT http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "country": "United States",
    "city": "New York",
    "bio": "Fintech enthusiast"
  }'
```

### Get User Stats
```bash
curl http://localhost:3000/api/v1/users/stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Search Users
```bash
curl "http://localhost:3000/api/v1/users/search?query=john" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 4. Transactions

### Get All Transactions
```bash
curl "http://localhost:3000/api/v1/transactions?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Transactions with Filters
```bash
curl "http://localhost:3000/api/v1/transactions?type=transfer_out&status=completed&currency=USD" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get Transaction Stats
```bash
curl "http://localhost:3000/api/v1/transactions/stats?period=30" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 5. KYC Verification

### Get KYC Status
```bash
curl http://localhost:3000/api/v1/kyc/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Get KYC Limits
```bash
curl http://localhost:3000/api/v1/kyc/limits \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Submit KYC Document
```bash
curl -X POST http://localhost:3000/api/v1/kyc/submit \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "document_type": "id_card",
    "document_number": "ID123456789",
    "document_front_url": "https://example.com/id-front.jpg",
    "document_back_url": "https://example.com/id-back.jpg",
    "selfie_url": "https://example.com/selfie.jpg"
  }'
```

### Request Tier Upgrade
```bash
curl -X POST http://localhost:3000/api/v1/kyc/upgrade \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"target_tier": 2}'
```

---

## 6. Complete User Journey Example

```bash
# 1. Signup
SIGNUP_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test@1234","phone":"+1234567890","country_code":"US"}')

# Extract token
TOKEN=$(echo $SIGNUP_RESPONSE | jq -r '.data.session.access_token')

# 2. Get profile
curl http://localhost:3000/api/v1/users/profile \
  -H "Authorization: Bearer $TOKEN"

# 3. Get wallets (should have NGN and USD by default)
curl http://localhost:3000/api/v1/wallets \
  -H "Authorization: Bearer $TOKEN"

# 4. Add funds to USD wallet
WALLET_ID=$(curl -s http://localhost:3000/api/v1/wallets \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

curl -X POST http://localhost:3000/api/v1/wallets/$WALLET_ID/add-funds \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount":1000}'

# 5. Check balance
curl http://localhost:3000/api/v1/wallets/balances \
  -H "Authorization: Bearer $TOKEN"

# 6. View transactions
curl http://localhost:3000/api/v1/transactions \
  -H "Authorization: Bearer $TOKEN"
```

---

## Testing with Postman

1. Import the API endpoints into Postman
2. Create an environment variable `access_token`
3. Set up a test script in the login request to automatically save the token:

```javascript
pm.test("Login successful", function () {
    var jsonData = pm.response.json();
    pm.environment.set("access_token", jsonData.data.session.access_token);
});
```

4. Use `{{access_token}}` in the Authorization header for protected routes

---

## Common Response Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/missing token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate resource)
- `500` - Internal Server Error

---

## Error Response Format

```json
{
  "success": false,
  "status": "error",
  "message": "Error description",
  "errors": [...]  // Optional validation errors
}
```

