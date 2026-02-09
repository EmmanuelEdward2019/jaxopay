import { query } from './src/config/database.js';
import logger from './src/utils/logger.js';

const migrate = async () => {
    const sql = `
    -- Create wallet_transactions table if it doesn't exist
    CREATE TABLE IF NOT EXISTS wallet_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
        transaction_type VARCHAR(50) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        currency VARCHAR(10) NOT NULL,
        status VARCHAR(20) DEFAULT 'completed',
        description TEXT,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Also check if aml_risk_scores table exists (it's used in compliance stats)
    CREATE TABLE IF NOT EXISTS aml_risk_scores (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        risk_score INTEGER DEFAULT 0,
        risk_level VARCHAR(20) DEFAULT 'low',
        reasons TEXT[],
        last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id)
    );
  `;

    try {
        logger.info('Starting wallet_transactions migration...');
        await query(sql);
        logger.info('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
