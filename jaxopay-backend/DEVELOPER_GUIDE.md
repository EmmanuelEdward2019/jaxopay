# Developer Guide - Security & Best Practices

## 🔒 **Security Best Practices**

### 1. Financial Calculations - ALWAYS Use Decimal.js

**❌ WRONG:**
```javascript
const amount = parseFloat(req.body.amount);
const fee = amount * 0.015; // 1.5% fee
const total = amount + fee;
```

**✅ CORRECT:**
```javascript
import { decimal, calculateFee, formatForDB } from '../utils/financial.js';

const amount = decimal(req.body.amount);
const feeConfig = { type: 'percentage', value: 1.5 };
const fee = calculateFee(amount, feeConfig);
const total = amount.plus(fee);

// Store in database
await query('UPDATE wallets SET balance = $1', [formatForDB(total)]);
```

**Why?** Floating point math is imprecise:
- `0.1 + 0.2 === 0.30000000000000004` ❌
- `decimal('0.1').plus('0.2').toString() === '0.3'` ✅

---

### 2. Database Transactions - ALWAYS Wrap Money Movements

**❌ WRONG:**
```javascript
// Race condition risk!
await query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, walletId]);
await query('INSERT INTO transactions ...', [data]);
```

**✅ CORRECT:**
```javascript
import { transaction } from '../config/database.js';

await transaction(async (client) => {
  // Lock wallet
  const wallet = await client.query(
    'SELECT balance FROM wallets WHERE id = $1 FOR UPDATE',
    [walletId]
  );

  // Validate balance
  if (parseFloat(wallet.rows[0].balance) < amount) {
    throw new AppError('Insufficient funds', 400);
  }

  // Debit wallet
  await client.query(
    'UPDATE wallets SET balance = balance - $1 WHERE id = $2',
    [amount, walletId]
  );

  // Record transaction
  await client.query('INSERT INTO transactions ...', [data]);
});
```

**Why?** Without transactions:
- Another request could debit the wallet simultaneously
- Balance could go negative
- Transaction record could fail after balance update

---

### 3. Idempotency - Prevent Duplicate Payments

**❌ WRONG:**
```javascript
export const fundCard = catchAsync(async (req, res) => {
  const { cardId, amount } = req.body;
  
  // User retries on network error = double charge!
  await debitWallet(req.user.id, amount);
  await creditCard(cardId, amount);
});
```

**✅ CORRECT:**
```javascript
import { useIdempotency } from '../middleware/idempotency.js';

router.post('/cards/:id/fund',
  verifyToken,
  useIdempotency,  // Add this!
  fundCard
);

// Client must send header:
// X-Idempotency-Key: {unique_per_request}
```

**Already Implemented On**:
- `/payments/send`
- `/crypto/withdraw`

**TODO - Add To**:
- `/cards/:id/fund`
- `/bills/pay`
- `/gift-cards/purchase`

---

### 4. Webhook Handlers - ALWAYS Return 200

**❌ WRONG:**
```javascript
async function processKorapay(payload) {
  const tx = await findTransaction(payload.reference);
  if (!tx) {
    throw new Error('Transaction not found'); // Provider retries forever!
  }
}
```

**✅ CORRECT:**
```javascript
async function processKorapay(payload) {
  try {
    const tx = await findTransaction(payload.reference);
    if (!tx) {
      logger.warn('[WEBHOOK] Transaction not found', { ref: payload.reference });
      return; // Acknowledge but don't process
    }

    // Process webhook...
  } catch (error) {
    logger.error('[WEBHOOK] Processing error', error);
    // Still return 200 to prevent infinite retries
  }
}
```

**Why?** Providers retry on non-200 responses. If you throw:
- They retry every 5 mins for days
- You get thousands of duplicate webhooks
- Your logs explode

---

### 5. CSRF Protection - Exempt Webhooks

**✅ CORRECT (Already Done):**
```javascript
// In csrf.js
if (req.path.includes('/webhooks/')) {
  return next(); // Webhooks use signature verification instead
}
```

**For New API Endpoints**:
```javascript
// Frontend must include CSRF token
axios.post('/api/v1/wallets/transfer', data, {
  headers: {
    'X-CSRF-Token': getCsrfTokenFromCookie()
  }
});
```

---

## 🧪 **Testing Guidelines**

### Unit Tests (TODO)

**File Structure**:
```
src/
  controllers/
    wallet.controller.js
    __tests__/
      wallet.controller.test.js
```

**Example Test**:
```javascript
import { validateAmount, calculateFee } from '../utils/financial.js';

describe('Financial Utilities', () => {
  test('validateAmount rejects negative amounts', () => {
    expect(() => validateAmount(-10)).toThrow('Amount must be at least');
  });

  test('calculateFee handles percentage correctly', () => {
    const fee = calculateFee(100, { type: 'percentage', value: 1.5 });
    expect(fee.toString()).toBe('1.5');
  });
});
```

---

## 🔍 **Debugging with Request IDs**

**In Logs**:
```json
{
  "level": "error",
  "message": "Payment failed",
  "requestId": "req_1712123456789_a1b2c3d4e5f6",
  "userId": "uuid-here",
  "timestamp": "2026-04-03T10:30:00Z"
}
```

**In Response Headers**:
```
X-Request-ID: req_1712123456789_a1b2c3d4e5f6
```

**Usage**:
1. User reports error
2. Check response headers for Request ID
3. Search logs: `grep "req_1712123456789_a1b2c3d4e5f6" logs/combined.log`
4. See all logs for that request (auth, DB queries, external APIs, errors)

---

## 🚀 **Performance Tips**

### 1. Use Connection Pooling (Already Configured)
```javascript
// Database pool is configured in src/config/database.js
// Max connections: 15 (Supabase) or 20 (local)
// DO NOT create new pool instances
```

### 2. Cache External API Calls
```javascript
import cache from '../utils/cache.js';

const exchangeRates = await cache.get('exchange_rates', 'USD_NGN', async () => {
  // Only called if not cached
  return await korapay.getExchangeRate('USD', 'NGN');
}, 60000); // Cache for 1 minute
```

### 3. Use Circuit Breakers (Already Configured)
```javascript
import { circuitBreakers } from '../utils/circuitBreaker.js';

const result = await circuitBreakers.quidax.execute(async () => {
  return await quidax.getMarkets();
});
```

---

## 🔐 **Environment Variables Checklist**

### Required (Server Won't Start Without):
- [x] `JWT_SECRET` (32+ chars)
- [x] `JWT_REFRESH_SECRET` (32+ chars)
- [x] `ENCRYPTION_KEY` (exactly 32 chars)
- [x] `DATABASE_URL` or `DB_HOST/DB_NAME/DB_USER/DB_PASSWORD`
- [x] `ALLOWED_ORIGINS` (production only)

### Recommended:
- [ ] `RESEND_API_KEY` (emails)
- [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (SMS/OTP)
- [ ] `KORAPAY_SECRET_KEY` (payments)
- [ ] `QUIDAX_SECRET_KEY` (crypto)
- [ ] `SENTRY_DSN` (error tracking)

---

## 📚 **Further Reading**

1. **OWASP Top 10**: https://owasp.org/www-project-top-ten/
2. **Decimal.js Docs**: https://mikemcl.github.io/decimal.js/
3. **PostgreSQL Transactions**: https://www.postgresql.org/docs/current/tutorial-transactions.html
4. **Idempotency in APIs**: https://stripe.com/docs/api/idempotent_requests

---

**Last Updated**: 2026-04-03

