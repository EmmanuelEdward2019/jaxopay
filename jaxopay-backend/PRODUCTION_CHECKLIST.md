# Production Deployment Checklist

## 🔐 **Security**

### Environment Variables
- [ ] `JWT_SECRET` is 64+ characters, cryptographically random
- [ ] `JWT_REFRESH_SECRET` is different from JWT_SECRET
- [ ] `ENCRYPTION_KEY` is exactly 32 characters
- [ ] `NODE_ENV=production`
- [ ] `ALLOWED_ORIGINS` contains only production domains
- [ ] All `*_SECRET_KEY` variables are set (no placeholders)
- [ ] Database credentials use strong passwords
- [ ] No `.env` file committed to git

### Webhook Configuration
- [ ] Korapay webhook URL configured + secret verified
- [ ] Graph Finance webhook URL configured + secret verified
- [ ] Quidax webhook URL configured + secret verified
- [ ] VTPass webhook URL configured (if used)
- [ ] Smile Identity callback URL configured
- [ ] Test webhook delivery from each provider

### API Security
- [ ] Rate limiting tested (10 auth attempts/15min)
- [ ] CORS only allows production domains
- [ ] Helmet security headers enabled
- [ ] SSL/TLS certificate valid
- [ ] Database connection uses SSL (`?sslmode=require`)

---

## 🗄️ **Database**

### Schema
- [ ] All migrations applied (`npm run migrate` or manual)
- [ ] Database backup configured (daily minimum)
- [ ] Point-in-time recovery enabled
- [ ] Connection pooling tested (15-20 concurrent connections)

### Performance
- [ ] Indices created on:
  - [ ] `transactions.reference`
  - [ ] `transactions.provider_transaction_id`
  - [ ] `transactions.user_id, created_at`
  - [ ] `wallet_ledger.transaction_id`
  - [ ] `kyc_documents.user_id, status`
  - [ ] `virtual_cards.user_id, status`
- [ ] `EXPLAIN ANALYZE` run on slow queries
- [ ] Query timeout set (30s recommended)

### Integrity
- [ ] Foreign key constraints enabled
- [ ] CHECK constraints on balance (>= 0)
- [ ] Triggers tested (wallet balance updates, ledger entries)

---

## 📧 **External Services**

### Email (Resend)
- [ ] `RESEND_API_KEY` configured
- [ ] Production domain verified in Resend
- [ ] Send test email: signup confirmation
- [ ] Send test email: password reset
- [ ] Send test email: KYC approval
- [ ] Email templates use production URLs

### SMS (Twilio)
- [ ] `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` set
- [ ] Phone number verified/purchased
- [ ] Send test OTP
- [ ] Check SMS delivery logs
- [ ] Fallback to email if SMS fails

### Error Tracking (Sentry)
- [ ] `SENTRY_DSN` configured
- [ ] Test error captured in Sentry dashboard
- [ ] Source maps uploaded (if using TypeScript)
- [ ] Alert rules configured (critical errors)
- [ ] Team notifications set up (Slack/Email)

---

## 💳 **Payment Providers**

### Korapay
- [ ] Live API keys configured (not test keys)
- [ ] Account verified/approved
- [ ] Virtual account creation tested
- [ ] NGN transfer tested (deposit + payout)
- [ ] Exchange rate API working
- [ ] Settlement account configured

### Graph Finance / Strowallet
- [ ] Live API keys configured
- [ ] Virtual card creation tested
- [ ] Card funding tested ($10 minimum)
- [ ] Card transaction webhook received
- [ ] Card freeze/unfreeze tested

### Quidax
- [ ] Live API keys configured
- [ ] Crypto deposit address generation tested
- [ ] Buy crypto tested (NGN → BTC)
- [ ] Sell crypto tested (BTC → NGN)
- [ ] Withdrawal tested (external wallet)
- [ ] Webhook for deposit confirmation working

### VTPass (Bills)
- [ ] Live API credentials configured
- [ ] Test small bill payment (₦100 airtime)
- [ ] Verify transaction status callback
- [ ] Check balance deduction accuracy

### Reloadly (Gift Cards)
- [ ] Live API credentials configured
- [ ] Test gift card purchase ($5 minimum)
- [ ] Verify card code delivery
- [ ] Test balance check

---

## 🔍 **Monitoring & Logging**

### Application Monitoring
- [ ] Sentry error tracking live
- [ ] Log aggregation configured (e.g., LogTail, Papertrail)
- [ ] Disk space alerts set (90% threshold)
- [ ] Memory usage alerts set (85% threshold)
- [ ] CPU usage alerts set (80% threshold)

### Health Checks
- [ ] `/health` endpoint returns 200
- [ ] Database health check passes
- [ ] External API health checks added:
  - [ ] Korapay ping
  - [ ] Quidax status
  - [ ] Graph Finance status
- [ ] Uptime monitoring configured (UptimeRobot, Pingdom)

### Logging
- [ ] All logs include `requestId`
- [ ] Error logs include stack traces
- [ ] Sensitive data redacted (passwords, API keys)
- [ ] Log rotation configured (max 30 days)
- [ ] Log search tested (grep, ELK, CloudWatch)

---

## 🚀 **Performance**

### Load Testing
- [ ] 100 concurrent users tested
- [ ] 1000 requests/minute tested
- [ ] Database connection pool handles load
- [ ] No memory leaks after 1 hour
- [ ] Response times < 500ms (p95)

### Caching
- [ ] Exchange rates cached (1-5 min)
- [ ] User profiles cached (after login)
- [ ] Provider availability cached
- [ ] Cache invalidation tested

### CDN
- [ ] Static assets served via CDN (frontend)
- [ ] API responses compressed (gzip/brotli)
- [ ] Cache-Control headers set properly

---

## 🧪 **Testing**

### Critical Flows
- [ ] Signup → Email verification → Login
- [ ] Password reset flow
- [ ] 2FA enable/disable
- [ ] KYC document upload → Approval
- [ ] Wallet deposit (VBA)
- [ ] Wallet withdrawal (bank transfer)
- [ ] Crypto buy/sell
- [ ] Virtual card creation + funding
- [ ] Bill payment
- [ ] Gift card purchase
- [ ] Cross-border payment (if enabled)

### Edge Cases
- [ ] Insufficient balance error
- [ ] Network timeout handling
- [ ] Duplicate webhook delivery (idempotency)
- [ ] Race condition (concurrent wallet debits)
- [ ] Invalid API key from provider
- [ ] Database connection lost (retry logic)

---

## 📱 **Frontend Integration**

- [ ] API base URL points to production
- [ ] CORS requests working (credentials)
- [ ] Error messages user-friendly
- [ ] Loading states for async operations
- [ ] Network error retry logic
- [ ] Auth token refresh automatic
- [ ] Logout on 401 responses
- [ ] Request ID captured from headers (for support)

---

## 🔄 **Deployment**

### Pre-Deployment
- [ ] Code reviewed and approved
- [ ] All tests passing
- [ ] Database migrations prepared
- [ ] Rollback plan documented
- [ ] Downtime notification sent (if needed)

### Deployment Steps
- [ ] Backup database
- [ ] Run migrations (`npm run migrate`)
- [ ] Install dependencies (`npm ci`)
- [ ] Set environment variables
- [ ] Start server (`npm start`)
- [ ] Verify health check
- [ ] Test critical endpoint
- [ ] Monitor logs for errors (5 minutes)

### Post-Deployment
- [ ] Smoke tests passed
- [ ] No errors in Sentry (15 minutes)
- [ ] Monitor error rate (should be < 1%)
- [ ] Check response times (should be normal)
- [ ] Test one transaction end-to-end
- [ ] Announce deployment complete

---

## 📞 **Support Readiness**

- [ ] Support team trained on new features
- [ ] How to find request ID in logs documented
- [ ] Common error codes documented
- [ ] Escalation process defined
- [ ] Provider contact info handy (for outages)
- [ ] Incident response playbook ready

---

## 🎯 **Launch Criteria**

### Minimum Viable Product
- [x] User signup/login works
- [x] KYC verification works (Smile ID)
- [ ] Wallet deposit works (Korapay VBA)
- [ ] Wallet withdrawal works (Korapay payout)
- [x] Basic security (auth, rate limiting, CSRF)
- [ ] Error tracking (Sentry)
- [ ] Critical tests passing (80%+)

### Nice to Have (Post-Launch)
- [ ] Virtual cards (Graph Finance)
- [ ] Crypto trading (Quidax)
- [ ] Bill payments (VTPass)
- [ ] Gift cards (Reloadly)
- [ ] Flight booking (Amadeus)
- [ ] Cross-border payments (TransferGo, Wise)

---

**Deployment Date**: __________  
**Deployed By**: __________  
**Sign-off**: __________

**Status**: ⏳ In Progress

