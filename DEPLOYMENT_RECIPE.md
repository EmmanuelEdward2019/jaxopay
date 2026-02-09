# JAXOPAY Deployment Recipe (Production)

Follow these exact settings to deploy the JAXOPAY monorepo.

---

## 1. BACKEND DEPLOYMENT (Render)

**Service Type**: Web Service
**Repository**: [Your GitHub Repo]
**Root Directory**: `jaxopay-backend`

### **Build Settings**
- **Runtime**: `Node`
- **Node Version**: `18` (Set via Environment Variable `NODE_VERSION=18`)
- **Build Command**: `npm install`
- **Start Command**: `node src/server.js`

### **Critical Environment Variables (Render Dashboard)**
| Key | Value | Note |
|-----|-------|------|
| `NODE_ENV` | `production` | Enables security hardening |
| `PORT` | `10000` | Render's default port |
| `DB_HOST` | `[Your DB Host]` | Supabase/Neon Host |
| `DB_NAME` | `postgres` | |
| `DB_USER` | `postgres` | |
| `DB_PASSWORD` | `[Your Password]` | |
| `DB_SSL` | `true` | **Crucial for Render connections** |
| `JWT_SECRET` | `[Generate a random string]` | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | `[Generate a random string]` | |
| `ENCRYPTION_KEY` | `[32 Character Key]` | Required for Crypto data |
| `ALLOWED_ORIGINS` | `https://[your-vercel-domain].vercel.app` | **CORS restriction** |
| `SUPABASE_URL` | `[From Supabase Settings]` | |
| `SUPABASE_SERVICE_ROLE_KEY` | `[From Supabase Settings]` | |

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
