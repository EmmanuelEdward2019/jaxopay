import express from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import walletRoutes from './wallet.routes.js';
import transactionRoutes from './transaction.routes.js';
import kycRoutes from './kyc.routes.js';
import cardRoutes from './card.routes.js';
import cryptoRoutes from './crypto.routes.js';
import paymentRoutes from './payment.routes.js';
import billRoutes from './bill.routes.js';
import crossBorderRoutes from './cross_border.routes.js';

import giftCardRoutes from './giftCard.routes.js';
import adminRoutes from './admin.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import configRoutes from './config.routes.js';

import notificationRoutes from './notification.routes.js';
import announcementRoutes from './announcement.routes.js';
import ticketRoutes from './ticket.routes.js';
import webhookRoutes from './webhook.routes.js';
import transferRoutes from './transfer.routes.js';

import { checkDatabaseHealth } from '../config/database.js';
import cache, { CacheNamespaces } from '../utils/cache.js';
import { circuitBreakers } from '../utils/circuitBreaker.js';
import quidax from '../orchestration/adapters/crypto/QuidaxAdapter.js';

const router = express.Router();

// API status endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'JAXOPAY API v1',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/auth',
      users: '/users',
      wallets: '/wallets',
      transactions: '/transactions',
      kyc: '/kyc',
      cards: '/cards',
      crypto: '/crypto',
      payments: '/payments',
      bills: '/bills',
      fx: '/fx',

      giftCards: '/gift-cards',
      admin: '/admin',
      dashboard: '/dashboard',

      notifications: '/notifications',
      announcements: '/announcements',
      tickets: '/tickets',
      transfers: '/transfers',
      webhooks: '/webhooks',
    },
  });
});

// Detailed health check endpoint (for monitoring)
router.get('/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const quidaxState = quidax.getCircuitBreakerState();

    const health = {
      status: dbHealth.healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: dbHealth,
      services: {
        quidax: {
          circuitBreaker: quidaxState.state,
          failures: quidaxState.failureCount,
        },
        strowallet: {
          circuitBreaker: circuitBreakers.strowallet.getState().state,
        },
        korapay: {
          circuitBreaker: circuitBreakers.korapay.getState().state,
        },
      },
      cache: cache.getStats(),
    };

    res.status(dbHealth.healthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/wallets', walletRoutes);
router.use('/transactions', transactionRoutes);
router.use('/kyc', kycRoutes);
router.use('/cards', cardRoutes);
router.use('/crypto', cryptoRoutes);
router.use('/payments', paymentRoutes);
router.use('/bills', billRoutes);
router.use('/fx', crossBorderRoutes);

router.use('/gift-cards', giftCardRoutes);
router.use('/admin', adminRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/config', configRoutes);

router.use('/notifications', notificationRoutes);
router.use('/announcements', announcementRoutes);
router.use('/tickets', ticketRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/transfers', transferRoutes);

export default router;


