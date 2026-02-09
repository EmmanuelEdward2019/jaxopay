# JAXOPAY Deployment Recipe (Production)

Follow these exact settings to deploy the JAXOPAY monorepo.

---

## 1. BACKEND DEPLOYMENT (Railway - Recommended)

**Service Path**: `jaxopay-backend`
**Start Command**: `node src/server.js`

### **Critical Environment Variables (Railway Dashboard)**
| Key | Value | Note |
|-----|-------|------|
| `NODE_ENV` | `production` | |
| `PORT` | `3001` | Railway will assign this, but you can set it to 3001 |
| `DB_HOST` | `aws-1-eu-north-1.pooler.supabase.com` | |
| `DB_PORT` | `6543` | |
| `DB_USER` | `postgres.xfopdmkanqsggbzsfmbw` | |
| `DB_PASSWORD` | `MyFintech@2026` | |
| `DB_SSL` | `true` | |
| `JWT_SECRET` | `[Secure Key Provided]` | |
| `JWT_REFRESH_SECRET` | `[Secure Key Provided]` | |
| `ENCRYPTION_KEY` | `[Secure Key Provided]` | |
| `ALLOWED_ORIGINS` | `https://[your-vercel-domain].vercel.app` | |

---

## 2. BACKEND DEPLOYMENT (Render - Alternative)


---

## 2. FRONTEND DEPLOYMENT (Vercel)

**Project Setup**: Import repository
**Root Directory**: `jaxopay-web`

### **Framework Settings**
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: `18.x`

### **Environment Variables (Vercel Dashboard)**
| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://[your-render-app-name].onrender.com/api/v1` |
| `VITE_APP_ENV` | `production` |
| `VITE_SUPABASE_URL` | `[Your Supabase URL]` |
| `VITE_SUPABASE_ANON_KEY` | `[Your Supabase Anon Key]` |

### **SPA Routing**
The `vercel.json` file in `jaxopay-web/` already handles the rewrite fallback for React Router.

---

## 3. VERIFICATION STEPS

1. **Health Check**: Once Render is live, visit `https://[your-app].onrender.com/health`.
   - Result should be: `{"status": "ok", "service": "jaxopay-backend", ...}`
2. **CORS Test**: Attempt to login from the Vercel URL. If you see an error in the console, check that `ALLOWED_ORIGINS` matches your Vercel URL exactly (no trailing slash).
3. **Database logs**: Check Render logs for `✅ Database connected successfully`.
