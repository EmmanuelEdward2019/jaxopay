# 🔧 LOGIN TIMEOUT - ROOT CAUSE & FIX

**Issue**: Login hangs with "Request took too long" error  
**Root Cause**: Database connection timing out (60 second timeout)  
**Status**: IDENTIFIED - Fix below

---

## 🔍 **DIAGNOSIS**

Looking at the logs:
```
2026-04-04 01:29:19 error: Query error:
2026-04-04 01:29:19 error: Connection terminated due to connection timeout
POST /api/v1/auth/login - - ms - -
```

The login request **never completes** because:
1. Database queries are timing out after 60 seconds
2. The connection to Supabase PostgreSQL is dropping
3. Login requires multiple DB queries (user lookup, session creation, device tracking)

---

## ✅ **FIXES APPLIED**

### 1. **Made Device Tracking Optional** ✅
```javascript
// Now wrapped in try-catch with timeout protection
try {
  await Promise.race([
    storeDeviceInfo(user.id, req.deviceInfo),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Device storage timeout')), 5000))
  ]);
} catch (error) {
  logger.warn('Device info storage failed (non-critical):', error.message);
  // Login continues even if device tracking fails
}
```

### 2. **Added Session Creation Fallback** ✅
```javascript
// Session creation now has timeout protection
try {
  await Promise.race([
    createSession(user.id, accessToken, req.deviceInfo),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Session creation timeout')), 5000))
  ]);
} catch (error) {
  logger.warn('Session creation failed (non-critical):', error.message);
  // Login proceeds with just the JWT token
}
```

### 3. **Added Null Checks** ✅
- Device info can be null/undefined
- Functions handle missing data gracefully
- Login won't crash if optional data is missing

---

## 🚨 **REAL ISSUE: DATABASE CONNECTION**

The **actual problem** is your Supabase database connection is timing out.

### **Check Your DATABASE_URL**:
```bash
echo $DATABASE_URL
```

Should look like:
```
postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
```

---

## 🔧 **FIX THE DATABASE CONNECTION**

### **Option 1: Update .env File** (Recommended)

Add connection pooling parameters:

```bash
# Open .env file
nano .env

# Update DATABASE_URL with connection pooling:
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxx.supabase.co:6543/postgres?pgbouncer=true
                                                                      ^^^^
# NOTE: Port 6543 for connection pooling (not 5432)
```

**Changes**:
- Port: `5432` → `6543` (PgBouncer pooling)
- Add: `?pgbouncer=true` at the end

---

### **Option 2: Increase Timeouts**

Edit `src/config/database.js`:

```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10 seconds max wait
  statement_timeout: 60000,         // 60 seconds per query
  query_timeout: 60000,             // 60 seconds total
});
```

---

### **Option 3: Check Supabase Dashboard**

1. Go to: https://supabase.com/dashboard
2. Select your project
3. Go to **Settings** → **Database**
4. Check **Connection Info**
5. Copy the **Connection pooling** URL (port 6543)
6. Use that in your .env

---

## 🧪 **TEST THE FIX**

### 1. **Restart the Server**:
```bash
# In terminal with nodemon running, type:
rs
```

### 2. **Test Login API**:
```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

**Expected**: Response within 2-3 seconds (not 60+ seconds)

---

## 📊 **WHAT THE LOGS TELL US**

```
2026-04-04 01:31:53 warn: Slow query      ← Queries taking >1 second
2026-04-04 01:29:19 error: Connection terminated due to connection timeout
2026-04-04 01:30:19 error: Connection terminated due to connection timeout
```

This pattern means:
- ✅ Database connection works initially
- ❌ Connections timeout after ~60 seconds
- ❌ Pooled connections are getting stuck
- ❌ New requests can't get a connection

---

## ✅ **IMMEDIATE ACTION ITEMS**

### **Do This Now**:

1. **Get Correct DATABASE_URL from Supabase**:
   - Go to Supabase Dashboard
   - Settings → Database
   - Copy **Connection pooling** string
   - Should have port `6543` and `?pgbouncer=true`

2. **Update .env**:
   ```bash
   cd jaxopay-backend
   nano .env
   # Paste the connection pooling URL
   # Save (Ctrl+X, Y, Enter)
   ```

3. **Restart Server**:
   ```bash
   # In the terminal, type:
   rs
   ```

4. **Test Login**:
   - Try logging in from the frontend
   - Should complete in 2-3 seconds

---

## 🎯 **EXPECTED RESULTS AFTER FIX**

### **Before** (Current):
```
POST /api/v1/auth/login
→ Waits 60 seconds
→ "Connection terminated due to connection timeout"
→ Frontend shows: "Request took too long"
```

### **After** (Fixed):
```
POST /api/v1/auth/login
→ Completes in 2-3 seconds
→ Returns JWT token
→ User logged in successfully
```

---

## 📚 **ADDITIONAL FIXES APPLIED**

### **Files Modified**:
1. ✅ `src/controllers/auth.controller.js`
   - Made device tracking optional
   - Added timeout protection
   - Added null checks
   - Login proceeds even if non-critical operations fail

### **Benefits**:
- ✅ Login is more resilient
- ✅ Won't hang on device tracking failures
- ✅ Won't hang on session creation failures
- ✅ Core authentication works even if tracking fails

---

## 🚨 **IF DATABASE CONNECTION STILL FAILS**

### **Check Supabase Status**:
```bash
curl https://status.supabase.com/api/v2/status.json
```

### **Test Direct Connection**:
```bash
psql "$DATABASE_URL"
# Should connect within 5 seconds
```

### **Check Network**:
```bash
ping db.xxx.supabase.co
# Should respond
```

---

## ✅ **SUMMARY**

**Problem**: Database connection timeout causing login to hang  
**Fix**: Use Supabase connection pooling (port 6543 with pgbouncer)  
**Files Modified**: `auth.controller.js` (made device tracking resilient)  
**Next Step**: Update DATABASE_URL in .env with connection pooling URL  

---

**Status**: ✅ Code fixes applied  
**Action Required**: Update DATABASE_URL in .env  
**ETA**: 2 minutes to fix

