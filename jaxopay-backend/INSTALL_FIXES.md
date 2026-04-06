# Installation Guide - Security Fixes

## 📦 **Install New Dependencies**

```bash
cd jaxopay-backend
npm install cookie-parser@^1.4.6 decimal.js@^10.4.3
```

**Or if you're using the updated `package.json`:**
```bash
npm install
```

---

## ✅ **Verify Installation**

```bash
# Check if packages are installed
npm list cookie-parser decimal.js

# Expected output:
# jaxopay-backend@1.0.0
# ├── cookie-parser@1.4.6
# └── decimal.js@10.4.3
```

---

## 🔧 **Configure Webhooks**

Update these URLs in your provider dashboards:

### **1. Korapay**
- Dashboard: https://merchant.korapay.com/settings/webhooks
- URL: `https://jaxopay-production.up.railway.app/api/v1/webhooks/korapay`
- Secret: Use your `KORAPAY_SECRET_KEY`
- Events: `charge.success`, `charge.failed`, `transfer.success`, `transfer.failed`, `virtual_bank_account_transfer`

### **2. VTPass**
- Dashboard: https://vtpass.com/merchant/api-settings
- URL: `https://jaxopay-production.up.railway.app/api/v1/webhooks/vtpass`
- Secret: Your `VTPASS_SECRET_KEY`
- Method: POST

### **3. Graph Finance**
- Dashboard: https://dashboard.usegraph.com/settings/webhooks
- URL: `https://jaxopay-production.up.railway.app/api/v1/webhooks/graph`
- Secret: Set as `GRAPH_WEBHOOK_SECRET` in your .env
- Events: `card.transaction`, `card.created`, `card.status_changed`

### **4. Quidax**
- Dashboard: https://quidax.com/settings/api
- URL: `https://jaxopay-production.up.railway.app/api/v1/webhooks/quidax`
- Secret: Set as `QUIDAX_WEBHOOK_SECRET` in your .env
- Events: `deposit.successful`, `withdraw.successful`, `withdraw.failed`

### **5. Smile Identity**
- Dashboard: https://portal.usesmileid.com/
- Callback URL: `https://jaxopay-production.up.railway.app/api/v1/webhooks/smile-id`
- Partner ID: Your `SMILE_ID_PARTNER_ID`
- API Key: Your `SMILE_ID_API_KEY` (used for signature verification)

---

## 🔐 **Update Environment Variables**

Add these to your `.env` file:

```bash
# Webhook Secrets (if not already set)
KORAPAY_SECRET_KEY=your_korapay_secret_key
GRAPH_WEBHOOK_SECRET=your_graph_webhook_secret
QUIDAX_WEBHOOK_SECRET=your_quidax_secret_key
VTPASS_SECRET_KEY=your_vtpass_secret_key

# Security (ensure these are NOT placeholders)
JWT_SECRET=your_production_jwt_secret_at_least_32_chars_long
JWT_REFRESH_SECRET=your_production_refresh_secret_at_least_32_chars_long
ENCRYPTION_KEY=exactly_32_characters_here_123

# CORS (production domains)
ALLOWED_ORIGINS=https://jaxopay.com,https://www.jaxopay.com

# Optional but recommended
SENTRY_DSN=your_sentry_dsn_for_error_tracking
RESEND_API_KEY=your_resend_api_key_for_emails
```

---

## 🧪 **Test the Server**

```bash
# Start the server
npm run dev

# Look for these log messages:
# ✅ Environment validation passed
# ✅ Database connected successfully
# 🚀 Server running on port 3000
```

**If you see errors:**
- `❌ JWT_SECRET is missing or contains placeholder value` → Update your .env
- `❌ ENCRYPTION_KEY must be exactly 32 characters long` → Fix the encryption key
- `⚠️  RESEND_API_KEY not configured` → Warning only, server will still start

---

## 🔍 **Test Webhook Security**

```bash
# Test Korapay webhook (should fail without signature)
curl -X POST https://jaxopay-production.up.railway.app/api/v1/webhooks/korapay \
  -H "Content-Type: application/json" \
  -d '{"event":"charge.success","data":{}}'

# Expected response: 401 Unauthorized (in production)
# Expected response: 200 OK (in development mode)
```

---

## 📊 **Verify Request ID Tracking**

```bash
# Make any API request
curl -X GET https://jaxopay-production.up.railway.app/api/v1 \
  -i

# Check response headers for:
# X-Request-ID: req_1712123456789_a1b2c3d4e5f6
```

---

## 🔄 **Update Frontend (Optional - CSRF)**

If you want to enable CSRF protection on the frontend:

### **1. Update API Client**

```javascript
// In jaxopay-web/src/lib/apiClient.js

// Function to get CSRF token from cookie
function getCsrfToken() {
  const match = document.cookie.match(/jaxopay_csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

// Add to request interceptor
apiClient.interceptors.request.use((config) => {
  // ... existing code ...

  // Add CSRF token for state-changing requests
  if (['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }

  return config;
});
```

### **2. Enable Credentials in Axios**

```javascript
// In jaxopay-web/src/lib/apiClient.js
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true, // Add this to send cookies
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Note**: CSRF is currently **disabled** by default. Enable when frontend is ready.

---

## 🚨 **Rollback Instructions (If Needed)**

If something goes wrong:

```bash
# 1. Restore old package.json
git checkout HEAD -- package.json
npm install

# 2. Restore old server.js
git checkout HEAD -- src/server.js

# 3. Remove new files
rm src/config/envValidator.js
rm src/middleware/csrf.js
rm src/middleware/requestId.js
rm src/utils/financial.js

# 4. Restart server
npm run dev
```

---

## ✅ **Success Checklist**

After installation:
- [ ] `npm install` completed successfully
- [ ] Server starts without errors
- [ ] Environment validation shows ✅
- [ ] Webhook URLs configured in provider dashboards
- [ ] All webhook secrets added to .env
- [ ] Test webhook request returns proper authentication error
- [ ] Response headers include `X-Request-ID`
- [ ] Logs include `requestId` field

---

**Need Help?**
- Check `SECURITY_FIXES_CHANGELOG.md` for detailed changes
- Check `DEVELOPER_GUIDE.md` for usage examples
- Search logs for specific request IDs

---

**Last Updated**: 2026-04-03

