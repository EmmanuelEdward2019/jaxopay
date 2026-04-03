# 🚀 Quick Start Guide - Quidax Integration Testing

## Prerequisites

1. **Environment Setup**
   ```bash
   # Ensure these are set in jaxopay-backend/.env
   QUIDAX_API_KEY=your_api_key_here
   QUIDAX_SECRET_KEY=your_secret_key_here
   QUIDAX_BASE_URL=https://api.quidax.com/v1
   
   # Optional: Test user credentials
   TEST_USER_EMAIL=test@example.com
   TEST_USER_PASSWORD=your_password
   ```

2. **Install Dependencies**
   ```bash
   cd jaxopay-backend
   npm install
   ```

---

## Step 1: Start Backend Server

```bash
cd jaxopay-backend
npm run dev
```

Server should start on `http://localhost:5000` (or your configured port)

---

## Step 2: Run Integration Tests

```bash
cd jaxopay-backend
node test_quidax_integration.js
```

### Expected Output

You should see successful responses for:
- ✅ Supported cryptocurrencies (10+ coins)
- ✅ Markets list (BTC/NGN, ETH/NGN, USDT/NGN, etc.)
- ✅ Exchange rates with fees
- ✅ 24hr ticker statistics
- ✅ Order book data (asks & bids)
- ✅ Kline/candlestick data
- ✅ Recent market trades
- ✅ Withdrawal fee estimates
- ✅ Crypto config with networks

---

## Step 3: Test Frontend

### Start Development Server

```bash
cd jaxopay-web
npm run dev
```

Open browser to `http://localhost:5173` (or your Vite URL)

### Manual Testing Checklist

#### 1. Exchange Tab (`/dashboard/exchange`)
- [ ] Navigate to Exchange page
- [ ] Select different currencies (e.g., USD → BTC)
- [ ] Enter an amount
- [ ] Watch rate auto-refresh every 5 seconds
- [ ] See countdown timer (30s expiry)
- [ ] Click manual refresh when < 10s
- [ ] Verify "Powered by Quidax" badge appears
- [ ] Check fee breakdown displayed
- [ ] Execute a test swap (small amount)

#### 2. Order Book Tab (`/dashboard/exchange`)
- [ ] Click "Order Book" tab
- [ ] Verify market selector dropdown works
- [ ] Search for different markets (BTC/NGN, ETH/NGN)
- [ ] Watch order book update every 2-3 seconds
- [ ] Check spread calculation displayed
- [ ] Verify depth visualization bars
- [ ] See recent trades updating
- [ ] Test trading form (limit/market orders)
- [ ] Create a test order

#### 3. Deposit Tab
- [ ] Click "Deposit" tab
- [ ] Select currency (USDT)
- [ ] Select network (TRC20, ERC20, etc.)
- [ ] Read deposit instructions
- [ ] Click "Generate Wallet Address"
- [ ] Verify QR code displays
- [ ] Test copy-to-clipboard button
- [ ] Check warning messages appear

#### 4. Withdrawal Tab
- [ ] Click "Withdraw" tab
- [ ] Select currency and network
- [ ] Watch fee auto-fetch
- [ ] Enter withdrawal amount
- [ ] Verify net amount calculates
- [ ] Click "Use Max Balance"
- [ ] Check fee deduction works
- [ ] Enter test address
- [ ] Submit withdrawal request

---

## Step 4: API Endpoint Testing (Optional)

### Using curl or Postman

#### Get Markets
```bash
curl http://localhost:5000/api/crypto/markets
```

#### Get Exchange Rates
```bash
curl "http://localhost:5000/api/crypto/rates?from=BTC&to=NGN&amount=1"
```

#### Get Order Book
```bash
curl "http://localhost:5000/api/crypto/order-book?market=btcusdt&limit=20"
```

#### Get 24hr Ticker
```bash
curl http://localhost:5000/api/crypto/ticker/24h
```

#### Get Kline Data
```bash
curl "http://localhost:5000/api/crypto/klines?market=btcusdt&period=1h&limit=10"
```

#### Get Withdrawal Fee
```bash
curl "http://localhost:5000/api/crypto/withdraw-fee?coin=usdt&network=trc20"
```

---

## Common Issues & Solutions

### Issue 1: "Quidax API authentication failed"
**Solution:** Verify API keys in `.env` file are correct and active

### Issue 2: "Rate limit exceeded"
**Solution:** Wait a few minutes or increase rate limit tier

### Issue 3: "Market not found"
**Solution:** Check market ID format (should be lowercase, e.g., `btcusdt` not `BTC/USDT`)

### Issue 4: Frontend not showing real-time updates
**Solution:** Check browser console for errors, verify WebSocket/polling is active

### Issue 5: Deposit address returns mock data
**Solution:** This is normal in development without Quidax keys. Production will show real addresses.

---

## Performance Benchmarks

### Expected Response Times
| Endpoint | Target | Acceptable |
|----------|--------|------------|
| /markets | < 200ms | < 500ms |
| /rates | < 300ms | < 800ms |
| /order-book | < 150ms | < 400ms |
| /ticker/24h | < 250ms | < 600ms |
| /klines | < 400ms | < 1000ms |

### Frontend Performance
- Page load: < 2 seconds
- Time to interactive: < 3 seconds
- Data refresh: < 1 second
- UI animations: 60 FPS

---

## Debugging Tips

### Backend Logs
```bash
# Watch logs in real-time
tail -f jaxopay-backend/logs/combined.log

# Filter for Quidax errors
grep "Quidax" jaxopay-backend/logs/error.log
```

### Browser Console
Open DevTools (F12) → Console tab
Look for:
- API request/response logs
- Error messages
- WebSocket connection status

### Network Tab
Check:
- Request headers (Authorization present?)
- Response status codes (200 = OK)
- Response time
- Payload size

---

## Next Steps After Testing

1. **Fix Any Critical Bugs**
   - Document issues found
   - Prioritize by severity
   - Implement fixes

2. **Security Audit**
   - Review API key handling
   - Validate all inputs
   - Test edge cases
   - Check error messages don't leak sensitive info

3. **Performance Optimization**
   - Profile slow endpoints
   - Optimize database queries
   - Implement caching where appropriate
   - Minify frontend assets

4. **User Acceptance Testing**
   - Get feedback from real users
   - Test on different devices
   - Verify accessibility
   - Check mobile responsiveness

5. **Production Deployment**
   - Update production environment variables
   - Deploy backend to staging first
   - Test thoroughly in staging
   - Schedule production rollout
   - Monitor closely after deployment

---

## Support Resources

### Documentation
- Backend API: `/docs` endpoint (if enabled)
- Quidax API: https://docs.quidax.io
- Component docs: Check Storybook (if available)

### Team Contacts
- Backend Lead: [Your contact]
- Frontend Lead: [Your contact]
- DevOps: [Your contact]

### Emergency Contacts
For critical production issues:
- Slack: #crypto-integration
- Email: crypto-support@jaxopay.com

---

## Success Criteria

✅ **All Tests Pass**
- Integration test script completes without errors
- Manual checklist items all verified
- No critical bugs remaining

✅ **Performance Met**
- All endpoints under target response times
- Frontend loads in < 3 seconds
- Real-time updates working smoothly

✅ **User Experience Approved**
- Navigation is intuitive
- Information is clear and accurate
- Transactions complete successfully
- Error messages are helpful

---

## 🎉 You're Ready!

If all tests pass and everything works as expected, your Quidax integration is **production-ready**!

The platform now features:
- ✨ Real-time exchange rates from Quidax
- 📊 Professional order book interface
- 💰 Automated deposits and withdrawals
- 📈 Dynamic market data updates
- 🔒 Secure, validated transactions

**Happy Trading! 🚀**
