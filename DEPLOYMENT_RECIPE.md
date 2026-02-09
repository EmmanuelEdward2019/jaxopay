# JAXOPAY Deployment Recipe (Final)

## 1. BACKEND DEPLOYMENT (Railway - Fixed)

1. **Root Directory**: Set this to `jaxopay-backend` in the Railway Settings.
2. **Builder**: Railway will now automatically detect the `Dockerfile` in the `jaxopay-backend` folder. This is the most stable way to deploy.

### **Required Environment Variables**
| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `DB_HOST` | `aws-1-eu-north-1.pooler.supabase.com` |
| `DB_PORT` | `6543` |
| `DB_USER` | `postgres.xfopdmkanqsggbzsfmbw` |
| `DB_PASSWORD` | `MyFintech@2026` |
| `DB_SSL` | `true` |
| `JWT_SECRET` | (The secure key I generated) |
| `ENCRYPTION_KEY` | (The secure key I generated) |
| `ALLOWED_ORIGINS` | `https://[your-vercel-domain].vercel.app` |

---

## 2. FRONTEND DEPLOYMENT (Vercel)

1. **Root Directory**: `jaxopay-web`
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`

### **Environment Variables**
| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://[your-railway-backend-url]/api/v1` |
| `VITE_APP_ENV` | `production` |
