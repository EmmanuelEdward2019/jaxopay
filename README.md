# JAXOPAY - Cross-Border Fintech Super App

JAXOPAY is a premium, production-grade cross-border fintech platform designed to handle multi-currency wallets, virtual cards, utility bill payments, and flight bookings. It is built as a robust orchestration layer that integrates with multiple financial providers to ensure high availability and failover.

## 🏗 Monorepo Structure

- **`jaxopay-web/`**: A modern React 19 + Vite frontend application.
- **`jaxopay-backend/`**: A Node.js + Express.js orchestration server.

## 🚀 Tech Stack Summary

### Frontend
- **React 19** with **Vite**
- **TailwindCSS** & **Framer Motion** for premium UI/UX
- **Zustand** for state management
- **React Query** for server state synchronization

### Backend
- **Node.js** & **Express**
- **PostgreSQL** via **Supabase**
- **Winston** for production-grade logging
- **Multi-provider Orchestration** logic for failover and compliance

## 🛠 Local Development Setup

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (Local or Supabase)

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd jaxopay-backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your database and provider credentials.

4. Start the dev server:
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd jaxopay-web
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Set `VITE_API_BASE_URL` to your backend URL (default: `http://localhost:3001/api/v1`).

4. Start the dev server:
   ```bash
   npm run dev
   ```

## 🔐 Security Notice

**Never commit real secrets to the repository.**
- Use `.env` files locally and ensure they are ignored by Git.
- Refer to `.env.example` in each sub-package for the required variable structure.
- In production, use environment secret management provided by your cloud host (e.g., Render, Vercel).

## 🌳 Branching Strategy

- **`main`**: Production-ready code only.
- **`develop`**: Primary integration branch for active development.
- **`feature/*`**: Individual feature development branches.
- **`hotfix/*`**: Critical bug fixes for production.

---
*Developed by JAXOPAY Team.*
