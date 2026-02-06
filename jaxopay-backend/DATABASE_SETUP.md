# Database Setup Guide

## Option 1: Using Supabase (Recommended)

Supabase provides a hosted PostgreSQL database with additional features like Auth, Storage, and Realtime.

### Steps:

1. **Create a Supabase Project**
   - Go to [https://supabase.com](https://supabase.com)
   - Sign up or log in
   - Click "New Project"
   - Fill in project details:
     - Name: `jaxopay`
     - Database Password: (choose a strong password)
     - Region: (choose closest to your users)
   - Click "Create new project"

2. **Run the Database Schema**
   - Once the project is created, go to the SQL Editor
   - Copy the entire contents of `../jaxopay-web/supabase/schema.sql`
   - Paste it into the SQL Editor
   - Click "Run" to execute the schema

3. **Get Connection Details**
   - Go to Project Settings > Database
   - Find the "Connection string" section
   - Copy the connection details:
     - Host
     - Database name
     - Port
     - User
     - Password

4. **Update `.env` File**
   ```env
   DB_HOST=db.xxxxxxxxxxxxx.supabase.co
   DB_PORT=5432
   DB_NAME=postgres
   DB_USER=postgres
   DB_PASSWORD=your_database_password
   DB_SSL=true
   ```

5. **Test Connection**
   ```bash
   npm run dev
   ```

---

## Option 2: Using Local PostgreSQL

If you prefer to run PostgreSQL locally:

### Prerequisites:
- PostgreSQL installed on your machine
- `psql` command-line tool available

### Steps:

1. **Install PostgreSQL** (if not already installed)
   
   **macOS:**
   ```bash
   brew install postgresql@15
   brew services start postgresql@15
   ```
   
   **Ubuntu/Debian:**
   ```bash
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   sudo systemctl start postgresql
   ```
   
   **Windows:**
   - Download from [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
   - Run the installer
   - Remember the password you set for the `postgres` user

2. **Create Database**
   ```bash
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE jaxopay;
   
   # Exit psql
   \q
   ```

3. **Run Schema**
   ```bash
   # From the jaxopay-backend directory
   psql -U postgres -d jaxopay -f ../jaxopay-web/supabase/schema.sql
   ```

4. **Update `.env` File**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=jaxopay
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
   DB_SSL=false
   ```

5. **Test Connection**
   ```bash
   npm run dev
   ```

---

## Option 3: Using Docker PostgreSQL

Quick setup using Docker:

### Steps:

1. **Run PostgreSQL Container**
   ```bash
   docker run --name jaxopay-postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=jaxopay \
     -p 5432:5432 \
     -d postgres:15
   ```

2. **Run Schema**
   ```bash
   # Wait a few seconds for PostgreSQL to start, then:
   docker exec -i jaxopay-postgres psql -U postgres -d jaxopay < ../jaxopay-web/supabase/schema.sql
   ```

3. **Update `.env` File**
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=jaxopay
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_SSL=false
   ```

4. **Test Connection**
   ```bash
   npm run dev
   ```

---

## Verifying the Setup

Once the database is set up and the server is running, you should see:

```
✅ Database connected successfully
🚀 JAXOPAY API Server running on port 3000
📝 Environment: development
🔗 API Base URL: http://localhost:3000/api/v1
💚 Health check: http://localhost:3000/health
```

### Test the API:

```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000/api/v1

# Create a test user
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@1234",
    "phone": "+1234567890",
    "country_code": "US",
    "metadata": {
      "first_name": "Test",
      "last_name": "User"
    }
  }'
```

---

## Troubleshooting

### Connection Refused
- Make sure PostgreSQL is running
- Check that the port (5432) is not blocked by firewall
- Verify the host and port in `.env`

### Authentication Failed
- Double-check the password in `.env`
- Make sure the user has access to the database

### Schema Errors
- Make sure you're running the schema on an empty database
- Check PostgreSQL version (should be 12+)

### SSL Errors
- For local PostgreSQL, set `DB_SSL=false`
- For Supabase, set `DB_SSL=true`

---

## Next Steps

After the database is set up:

1. Configure email service (SMTP) in `.env` for email verification
2. Configure Twilio in `.env` for SMS/OTP
3. Change JWT secrets to secure random strings
4. Test the authentication endpoints
5. Implement the remaining business logic modules

