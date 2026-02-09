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
import flightRoutes from './flight.routes.js';
import giftCardRoutes from './giftCard.routes.js';
import adminRoutes from './admin.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import configRoutes from './config.routes.js';
import smsRoutes from './sms.routes.js';
import notificationRoutes from './notification.routes.js';
import announcementRoutes from './announcement.routes.js';
import ticketRoutes from './ticket.routes.js';

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
      flights: '/flights',
      giftCards: '/gift-cards',
      admin: '/admin',
      dashboard: '/dashboard',
      sms: '/sms',
      notifications: '/notifications',
      announcements: '/announcements',
      tickets: '/tickets',
    },
  });
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
router.use('/flights', flightRoutes);
router.use('/gift-cards', giftCardRoutes);
router.use('/admin', adminRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/config', configRoutes);
router.use('/sms', smsRoutes);
router.use('/notifications', notificationRoutes);
router.use('/announcements', announcementRoutes);
router.use('/tickets', ticketRoutes);

export default router;


