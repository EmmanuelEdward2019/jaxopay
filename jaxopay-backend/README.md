# JAXOPAY Backend API

RESTful API server for the JAXOPAY cross-border fintech platform.

## 🚀 Features

- **Authentication & Security**
  - Email/password authentication
  - Phone/OTP authentication
  - JWT-based session management
  - 2FA support (SMS, Email, Authenticator)
  - Device fingerprinting
  - Password reset flow
  - Email verification

- **Security Middleware**
  - Rate limiting (general, auth, OTP, transactions)
  - CORS protection
  - Helmet security headers
  - Input validation
  - Error handling

- **API Modules** (Placeholder routes ready for implementation)
  - User management
  - Wallet system
  - Transactions
  - KYC/Compliance
  - Virtual cards
  - Crypto exchange
  - Cross-border payments
  - Bill payments
  - Flight booking
  - Gift card marketplace
  - Admin dashboard

## 📋 Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database (or Supabase)
- npm >= 9.0.0

## 🛠️ Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your actual credentials:
   - Database connection details
   - JWT secrets
   - Email/SMS provider credentials
   - Payment provider API keys

3. **Set up database:**
   
   If using Supabase:
   - Create a new Supabase project
   - Run the schema from `../jaxopay-web/supabase/schema.sql`
   - Update `.env` with Supabase connection details
   
   If using local PostgreSQL:
   ```bash
   createdb jaxopay
   psql jaxopay < ../jaxopay-web/supabase/schema.sql
   ```

## 🏃 Running the Server

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000` (or the PORT specified in `.env`)

## 📡 API Endpoints

### Health Check
```
GET /health
```

### API Info
```
GET /api/v1
```

### Authentication
```
POST   /api/v1/auth/signup              - Create new account
POST   /api/v1/auth/login               - Email/password login
POST   /api/v1/auth/login/otp           - Request OTP for phone login
POST   /api/v1/auth/verify-otp          - Verify OTP and login
POST   /api/v1/auth/logout              - Logout (requires auth)
POST   /api/v1/auth/refresh             - Refresh access token
POST   /api/v1/auth/forgot-password     - Request password reset
POST   /api/v1/auth/reset-password      - Reset password with token
POST   /api/v1/auth/change-password     - Change password (requires auth)
POST   /api/v1/auth/verify-email/:token - Verify email address
POST   /api/v1/auth/resend-verification - Resend verification email
POST   /api/v1/auth/2fa/enable          - Enable 2FA
POST   /api/v1/auth/2fa/verify          - Verify 2FA code
POST   /api/v1/auth/2fa/disable         - Disable 2FA
GET    /api/v1/auth/devices             - Get user devices
DELETE /api/v1/auth/devices/:deviceId   - Remove device
GET    /api/v1/auth/sessions            - Get active sessions
DELETE /api/v1/auth/sessions/:sessionId - Terminate session
DELETE /api/v1/auth/sessions            - Terminate all other sessions
```

### Other Modules
All other module endpoints are placeholder routes ready for implementation:
- `/api/v1/users` - User management
- `/api/v1/wallets` - Wallet operations
- `/api/v1/transactions` - Transaction history
- `/api/v1/kyc` - KYC verification
- `/api/v1/cards` - Virtual cards
- `/api/v1/crypto` - Crypto exchange
- `/api/v1/payments` - Cross-border payments
- `/api/v1/bills` - Bill payments
- `/api/v1/flights` - Flight booking
- `/api/v1/gift-cards` - Gift card marketplace
- `/api/v1/admin` - Admin operations
- `/api/v1/webhooks` - Provider webhooks

## 🔒 Authentication

Most endpoints require authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_access_token>
```

## 📁 Project Structure

```
jaxopay-backend/
├── src/
│   ├── config/          # Configuration files
│   │   └── database.js  # Database connection
│   ├── controllers/     # Request handlers
│   │   └── auth.controller.js
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # Authentication middleware
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validator.js
│   ├── routes/          # API routes
│   │   ├── index.js
│   │   ├── auth.routes.js
│   │   └── ...
│   ├── services/        # Business logic
│   │   ├── email.service.js
│   │   └── sms.service.js
│   ├── utils/           # Utility functions
│   │   ├── logger.js
│   │   └── deviceParser.js
│   └── server.js        # Entry point
├── logs/                # Application logs
├── .env                 # Environment variables
├── .env.example         # Environment template
├── package.json
└── README.md
```

## 🧪 Testing

```bash
npm test
```

## 📝 License

MIT

