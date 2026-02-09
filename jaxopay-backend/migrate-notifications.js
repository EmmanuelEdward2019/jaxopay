import { query } from './src/config/database.js';
import logger from './src/utils/logger.js';

const migrate = async () => {
    const sql = `
    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'info', -- 'info', 'success', 'warning', 'error', 'announcement'
      is_read BOOLEAN DEFAULT false,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Announcements table (Global)
    CREATE TABLE IF NOT EXISTS announcements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'info',
      target_audience VARCHAR(50) DEFAULT 'all', -- 'all', 'end_user', 'admin'
      is_active BOOLEAN DEFAULT true,
      starts_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ends_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Support Tickets table
    CREATE TABLE IF NOT EXISTS support_tickets (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      subject VARCHAR(255) NOT NULL,
      status VARCHAR(50) DEFAULT 'open', -- 'open', 'pending', 'resolved', 'closed'
      priority VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
      category VARCHAR(100), -- 'billing', 'technical', 'kyc', 'other'
      last_reply_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Ticket Messages table
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      ticket_id UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      attachments TEXT[], -- Array of URLs
      is_internal BOOLEAN DEFAULT false, -- For admin notes
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Add indexes
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_announcements_is_active ON announcements(is_active);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
  `;

    try {
        logger.info('Starting migration...');
        await query(sql);
        logger.info('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
