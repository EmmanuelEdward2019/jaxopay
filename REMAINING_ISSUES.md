# 🔧 Remaining Issues to Fix for Production

## ✅ **COMPLETED (Phase 1)**

1. ✅ Environment variable validation on startup
2. ✅ Webhook security hardening (never fail open)
3. ✅ Production-ready rate limiting
4. ✅ CSRF protection middleware
5. ✅ Request ID tracking for debugging
6. ✅ Financial precision utilities (decimal.js)

---

## 🚨 **CRITICAL - MUST FIX BEFORE LAUNCH**

### 1. Database Transaction Consistency ⚠️
**Files to Fix**:
- `src/controllers/wallet.controller.js` - Lines with balance updates
- `src/controllers/payment.controller.js` - Send money flow
- `src/controllers/card.controller.js` - Card funding
- `src/services/ledger.service.js` - Ensure all use transactions

**Issue**: Some wallet operations don't use database transactions, risking race conditions.

**Fix Pattern**:
```javascript
// BEFORE (UNSAFE):
await query('UPDATE wallets SET balance = balance - $1', [amount]);
await query('INSERT INTO transactions ...', [data]);

// AFTER (SAFE):
await transaction(async (client) => {
  const wallet = await client.query(
    'SELECT balance FROM wallets WHERE id = $1 FOR UPDATE',
    [walletId]
  );
  // Validate balance
  await client.query('UPDATE wallets SET balance = balance - $1', [amount]);
  await client.query('INSERT INTO transactions ...', [data]);
});
```

**Affected Operations**:
- Wallet transfers
- Card funding
- Bill payments
- Crypto withdrawals
- Gift card purchases

---

### 2. Replace parseFloat() with decimal() ⚠️
**Files to Fix**:
- `src/controllers/wallet.controller.js` (13 instances)
- `src/controllers/payment.controller.js` (8 instances)
- `src/controllers/card.controller.js` (5 instances)
- `src/controllers/crypto.controller.js` (7 instances)
- `src/services/exchange.service.js` (4 instances)

**Issue**: Floating-point precision errors in financial calculations.

**Search Pattern**: `parseFloat(` or `Number(`

**Fix**:
```javascript
// BEFORE:
const amount = parseFloat(req.body.amount);

// AFTER:
import { decimal, formatForDB } from '../utils/financial.js';
const amount = decimal(req.body.amount);
```

---

### 3. Add Idempotency to Payment Endpoints ⚠️
**Files to Fix**:
- `src/routes/card.routes.js` - Add to `/cards/:id/fund`
- `src/routes/bill.routes.js` - Add to `/bills/pay`
- `src/routes/giftcard.routes.js` - Add to `/gift-cards/purchase`
- `src/routes/crypto.routes.js` - Add to `/crypto/withdraw`

**Already Has**: `/payments/send` ✅

**Fix**:
```javascript
import { useIdempotency } from '../middleware/idempotency.js';

router.post('/cards/:id/fund',
  verifyToken,
  useIdempotency,  // ADD THIS LINE
  validateCardFunding,
  fundCard
);
```

---

### 4. Fix Quidax Withdrawal Confirmation ⚠️
**File**: `src/controllers/crypto.controller.js`

**Issue**: Withdrawal marked "processing" but never confirmed via webhook.

**Current Flow**:
1. User requests withdrawal
2. Call Quidax API
3. Mark as "processing" immediately ❌
4. Webhook never updates status

**Required Fix**:
1. Keep as "pending"
2. Wait for Quidax webhook confirmation
3. Then mark as "completed" or "failed"

**Webhook Handler**: Needs implementation in `src/controllers/webhook.controller.js`

---

### 5. VBA Deposit Reconciliation ⚠️
**File**: `src/controllers/webhook.controller.js` - Line ~120

**Issue**: Regex pattern may not match all VBA reference formats.

**Current**:
```javascript
const match = vbaRef.match(/JXVBA-([a-f0-9-]+)-([A-Z]{3})/);
```

**Test Cases Needed**:
- `JXVBA-abc123-NGN` ✅
- `JXVBA-ABC123-USD` ❌ (uppercase in UUID)
- `JXVBA-abc-123-NGN` ❌ (extra dash)

**Fix**: Update regex or test all formats from Korapay.

---

### 6. Database Indices ⚠️
**Migration Needed**: `migrations/010_add_performance_indices.sql`

**Missing Indices**:
```sql
-- High-traffic queries
CREATE INDEX idx_transactions_reference ON transactions(reference);
CREATE INDEX idx_transactions_provider_tx_id ON transactions(provider_transaction_id);
CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_tx_id ON wallet_ledger(transaction_id);
CREATE INDEX idx_kyc_user_status ON kyc_documents(user_id, status);
CREATE INDEX idx_virtual_cards_user_status ON virtual_cards(user_id, status);
CREATE INDEX idx_support_tickets_user_status ON support_tickets(user_id, status);
```

**Impact**: Queries will be slow without these (10x+ slower on large datasets).

---

## 🔴 **HIGH PRIORITY**

### 7. KYC Auto-Tier Upgrade ⚠️
**File**: `src/controllers/webhook.controller.js` - `processSmileIdentity()`

**Issue**: After successful KYC, user tier not automatically upgraded.

**Missing**:
```javascript
// After KYC approval
await query(
  'UPDATE users SET tier = $1 WHERE id = $2',
  ['verified', userId]
);

// Send approval email
await emailService.sendKycApproval(user.email, {
  tier: 'verified',
  limits: { daily: 1000000, monthly: 5000000 }
});
```

---

### 8. SMS Fallback to Email 📧
**File**: `src/services/notification.service.js`

**Issue**: If Twilio fails, OTP not sent at all.

**Fix**:
```javascript
async sendOTP(phone, email, code) {
  try {
    await twilioService.sendSMS(phone, `Your JAXOPAY OTP: ${code}`);
  } catch (error) {
    logger.warn('SMS failed, falling back to email', error);
    await emailService.sendOTP(email, code);
  }
}
```

---

### 9. Gift Card Delivery Emails 🎁
**File**: `src/controllers/giftcard.controller.js` - `purchaseGiftCard()`

**Issue**: After successful purchase, card code not emailed to user.

**Missing**:
```javascript
// After Reloadly purchase success
await emailService.sendGiftCard(user.email, {
  product: productName,
  amount: amount,
  code: response.pinCode,
  redemptionUrl: response.redemptionUrl
});
```

---

### 10. Error Messages Sanitization 🔒
**File**: `src/middleware/errorHandler.js`

**Issue**: Stack traces sent in development mode expose internals.

**Fix**:
```javascript
// NEVER send stack traces, even in development
return res.status(err.statusCode).json({
  success: false,
  error: {
    message: err.message,
    code: err.code,
    // Remove: stack: err.stack
  }
});
```

---

## 🟡 **MEDIUM PRIORITY**

### 11. JWT Secret Rotation 🔄
**New File**: `src/utils/jwtRotation.js`

**Feature**: Support multiple JWT secrets for zero-downtime rotation.

**Implementation**:
- Accept array of secrets `[current, previous]`
- Sign with current, verify with any
- Rotate monthly

---

### 12. Circuit Breaker Testing 🔌
**File**: `src/utils/circuitBreaker.js`

**Action**: Test all circuit breakers under load:
- Korapay API down scenario
- Quidax timeout scenario
- Graph Finance rate limit

---

### 13. Health Check for External APIs 🏥
**File**: `src/server.js` - `/health` endpoint

**Add**:
```javascript
{
  database: true,
  korapay: await pingKorapay(),
  quidax: await pingQuidax(),
  graph: await pingGraph(),
  uptime: process.uptime()
}
```

---

### 14. Hardcoded Fee Migration 💰
**Current**: Fees hardcoded in controllers (1.5%, 1%, etc.)

**Should**: Load from `fee_configs` table

**Files**:
- `src/controllers/payment.controller.js` - 1.5% transfer fee
- `src/controllers/card.controller.js` - 1% funding fee
- `src/controllers/crypto.controller.js` - Variable fees

**Migration**: Create `fee_configs` seeder

---

## 🟢 **NICE TO HAVE**

### 15. Unit Tests (0% Coverage) 🧪
**Target**: 80% coverage

**Priority Tests**:
1. `src/utils/financial.js` - All utility functions
2. `src/middleware/csrf.js` - Token generation/validation
3. `src/utils/webhookVerifier.js` - Signature verification
4. `src/services/ledger.service.js` - Double-entry accounting

---

### 16. API Documentation (Swagger/OpenAPI) 📚
**Tool**: `swagger-jsdoc` + `swagger-ui-express`

**File**: `src/docs/swagger.js`

**Route**: `/api-docs`

---

### 17. Redis for Rate Limiting 🚀
**Current**: In-memory store (resets on restart)

**Upgrade**: Use Redis for distributed rate limiting

**Packages**: `rate-limit-redis`

---

### 18. Amadeus Flight Integration ✈️
**File**: `src/controllers/flight.controller.js`

**Status**: Mock data only

**Options**:
1. Implement full Amadeus SDK
2. Remove feature from MVP

---

### 19. Sudo Africa Virtual Cards 💳
**Status**: Not implemented

**Alternative**: Only use Graph Finance + Strowallet

**Decision Needed**: Keep or remove from roadmap?

---

## 📊 **SUMMARY**

| Priority | Count | Est. Time |
|----------|-------|-----------|
| Critical | 6 | 2 weeks |
| High | 4 | 1 week |
| Medium | 4 | 1 week |
| Low | 5 | 2 weeks |
| **Total** | **19** | **6 weeks** |

---

## 🎯 **MVP Launch Criteria**

To launch safely, **must complete**:
- [x] Phase 1 security fixes (DONE)
- [ ] Critical issues #1-6 (2 weeks)
- [ ] High priority issues #7-10 (1 week)
- [ ] Database backup automation (1 day)
- [ ] Sentry error tracking (1 day)
- [ ] Load testing (2 days)

**Estimated Time to Launch-Ready**: ~3-4 weeks

---

**Next Steps**:
1. Install dependencies: `npm install`
2. Fix critical issues systematically
3. Run migration for database indices
4. Replace all `parseFloat()` with `decimal()`
5. Add idempotency to payment endpoints
6. Test under load
7. Deploy to staging
8. Final QA
9. Production launch 🚀

