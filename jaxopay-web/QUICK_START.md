# JAXOPAY Quick Start Guide

## 🚀 You're Almost There!

The JAXOPAY web app is now running at **http://localhost:5173**, but you need to configure Supabase to unlock all features.

## ⚡ 5-Minute Setup

### Step 1: Create Supabase Project (2 minutes)

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Name**: JAXOPAY
   - **Database Password**: (create a strong password - save it!)
   - **Region**: Choose closest to you
4. Click **"Create new project"**
5. Wait ~2 minutes for setup to complete

### Step 2: Run Database Schema (1 minute)

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New Query"**
3. Open the file `jaxopay-web/supabase/schema.sql` in your code editor
4. Copy ALL the contents (684 lines)
5. Paste into the Supabase SQL Editor
6. Click **"Run"** (or press Cmd/Ctrl + Enter)
7. Wait for "Success. No rows returned" message

### Step 3: Get API Credentials (1 minute)

1. In Supabase, click the **Settings** icon (⚙️) at the bottom left
2. Click **"API"** in the settings menu
3. You'll see two important values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)
4. Keep this page open - you'll need these values next

### Step 4: Update .env File (1 minute)

1. Open the file `jaxopay-web/.env` in your code editor
2. Replace the placeholder values:

```env
# BEFORE (placeholder values)
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...placeholder

# AFTER (your actual values from Supabase)
VITE_SUPABASE_URL=https://your-actual-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-actual-key
```

3. Save the file

### Step 5: Restart Dev Server (30 seconds)

The dev server should auto-reload, but if the setup notice is still showing:

1. In your terminal, press **Ctrl+C** to stop the server
2. Run `npm run dev` again
3. Refresh your browser at http://localhost:5173

## ✅ Verify Setup

After completing the steps above, you should see:

1. ✅ The login page (not the setup notice)
2. ✅ No errors in the browser console
3. ✅ A warning in console about Supabase being configured should be gone

## 🎯 Create Your First User

Now that Supabase is configured, create a test user:

### Option 1: Via Supabase Dashboard (Easiest)

1. In Supabase, go to **Authentication** → **Users**
2. Click **"Add User"** → **"Create new user"**
3. Enter:
   - **Email**: your-email@example.com
   - **Password**: Test123456!
   - **Auto Confirm User**: ✅ (check this box)
4. Click **"Create User"**
5. Go back to http://localhost:5173 and log in

### Option 2: Via Signup Page (Coming Soon)

The signup page will be built in the next phase.

## 🎨 What You'll See

After logging in, you'll see:

- **Dashboard** with wallet overview
- **Sidebar navigation** with all features
- **Quick actions** (Send, Receive, Exchange, Pay Bills)
- **Recent transactions** (empty for now)
- **Theme toggle** (light/dark mode)

## 🔧 Troubleshooting

### Issue: Still seeing "Setup Required" page

**Solution**: 
- Make sure you saved the `.env` file
- Restart the dev server (Ctrl+C, then `npm run dev`)
- Hard refresh browser (Cmd+Shift+R or Ctrl+Shift+R)

### Issue: "Invalid API key" error

**Solution**:
- Double-check you copied the **anon public** key (not the service_role key)
- Make sure there are no extra spaces in the `.env` file
- Verify the URL doesn't have a trailing slash

### Issue: "Table does not exist" error

**Solution**:
- Make sure you ran the ENTIRE `schema.sql` file
- Check Supabase SQL Editor for any error messages
- Try running the schema again

### Issue: Can't log in

**Solution**:
- Make sure you created a user in Supabase
- Check that "Auto Confirm User" was enabled
- Try creating a new user

## 📚 Next Steps

Once you're logged in:

1. **Explore the dashboard** - See the layout and navigation
2. **Check the documentation**:
   - `API_DOCUMENTATION.md` - API reference
   - `ARCHITECTURE.md` - System design
   - `PROJECT_SUMMARY.md` - What's built
3. **Start building features** - Follow the PRD to add remaining features

## 🆘 Need More Help?

- Check `SETUP_GUIDE.md` for detailed instructions
- Review browser console for error messages
- Check Supabase logs in the dashboard
- Verify all environment variables are set correctly

## 🎉 You're Ready!

Once you see the login page and can log in, you're all set to start building the remaining features of JAXOPAY!

---

**Happy coding! 🚀**

