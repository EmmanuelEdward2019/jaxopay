# JAXOPAY Setup Guide

## Prerequisites

Before you begin, ensure you have:
- Node.js 18+ installed
- npm or yarn package manager
- Git
- A Supabase account (free tier works)
- A code editor (VS Code recommended)

## Step 1: Clone and Install

```bash
cd jaxopay-web
npm install
```

## Step 2: Set Up Supabase

### 2.1 Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in project details:
   - Name: JAXOPAY
   - Database Password: (create a strong password)
   - Region: Choose closest to your users
5. Wait for project to be created (~2 minutes)

### 2.2 Run Database Schema

1. In your Supabase project, go to **SQL Editor**
2. Click "New Query"
3. Copy the entire contents of `supabase/schema.sql`
4. Paste into the SQL Editor
5. Click "Run" or press Cmd/Ctrl + Enter
6. Wait for execution to complete
7. Verify tables were created in **Table Editor**

### 2.3 Get API Credentials

1. Go to **Project Settings** (gear icon)
2. Click **API** in the sidebar
3. Copy the following:
   - **Project URL** (looks like: https://xxxxx.supabase.co)
   - **anon public** key (long string starting with eyJ...)

## Step 3: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

3. (Optional) Add other API keys as you get them:
```env
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxx
VITE_KORAPAY_PUBLIC_KEY=pk_test_xxxxx
```

## Step 4: Start Development Server

```bash
npm run dev
```

The app should open at: http://localhost:5173

## Step 5: Create Your First User

Since the app is now running, you can:

1. Go to http://localhost:5173
2. You'll be redirected to the login page
3. For now, create a user directly in Supabase:
   - Go to **Authentication** > **Users** in Supabase
   - Click "Add User"
   - Enter email and password
   - Click "Create User"
4. Go back to the app and log in with those credentials

## Step 6: Verify Setup

After logging in, you should see:
- ✅ Dashboard with welcome message
- ✅ Sidebar navigation
- ✅ Empty wallet and transaction sections
- ✅ Quick action buttons

## Common Issues & Solutions

### Issue: "Invalid API key"
**Solution**: Double-check your `.env` file has the correct Supabase URL and anon key

### Issue: "Failed to fetch"
**Solution**: Ensure your Supabase project is running and the URL is correct

### Issue: "Table does not exist"
**Solution**: Make sure you ran the entire `schema.sql` file in Supabase SQL Editor

### Issue: "Cannot read properties of null"
**Solution**: Clear browser localStorage and try logging in again

### Issue: Tailwind styles not working
**Solution**: Restart the dev server with `npm run dev`

## Next Steps

Now that your development environment is set up:

1. **Explore the codebase**
   - Check out `src/pages/` for page components
   - Review `src/store/` for state management
   - Look at `src/lib/supabase.js` for API helpers

2. **Read the documentation**
   - `API_DOCUMENTATION.md` - API reference
   - `ARCHITECTURE.md` - System design
   - `PROJECT_SUMMARY.md` - What's built and what's next

3. **Start building features**
   - Implement signup page
   - Add wallet creation
   - Build transaction flows

## Development Workflow

### Running the App
```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview production build
```

### Code Quality
```bash
npm run lint         # Run ESLint
```

### Database Changes
When you make changes to the database schema:
1. Update `supabase/schema.sql`
2. Run the new SQL in Supabase SQL Editor
3. Test locally

## Production Deployment

### Option 1: Vercel (Recommended)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add environment variables
5. Deploy

### Option 2: Netlify

1. Push code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Import your repository
4. Add environment variables
5. Deploy

### Environment Variables for Production

Make sure to add these in your hosting platform:
```
VITE_SUPABASE_URL=your-production-supabase-url
VITE_SUPABASE_ANON_KEY=your-production-anon-key
VITE_API_BASE_URL=your-api-url
```

## Security Checklist

Before going to production:
- [ ] Change all default passwords
- [ ] Enable Row Level Security (RLS) on all tables
- [ ] Set up proper CORS policies
- [ ] Enable rate limiting
- [ ] Set up monitoring and alerts
- [ ] Configure backup policies
- [ ] Review and test all API endpoints
- [ ] Enable 2FA for admin accounts
- [ ] Set up SSL certificates
- [ ] Configure environment-specific variables

## Support

If you encounter issues:
1. Check this guide first
2. Review the error message carefully
3. Check browser console for errors
4. Check Supabase logs
5. Refer to documentation files

## Useful Links

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev)
- [TailwindCSS Documentation](https://tailwindcss.com)
- [Vite Documentation](https://vitejs.dev)

---

**Happy coding! 🚀**

