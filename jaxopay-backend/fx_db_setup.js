import { query } from './src/config/database.js';

async function run() {
    try {
        await query(`
      CREATE TABLE IF NOT EXISTS fx_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(50) DEFAULT 'graph',
        type VARCHAR(50) NOT NULL, -- 'swap' | 'international_payment'
        from_currency VARCHAR(10) NOT NULL,
        to_currency VARCHAR(10) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        converted_amount DECIMAL(20, 8),
        exchange_rate DECIMAL(20, 8),
        recipient_details JSONB,
        provider_txn_id VARCHAR(255),
        status VARCHAR(50) DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS api_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        provider VARCHAR(100),
        endpoint VARCHAR(255),
        request_payload JSONB,
        response_payload JSONB,
        status INTEGER,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
        console.log("DB Updated Successfully!");
    } catch (e) {
        console.error("Error updating DB:", e);
    } finally {
        process.exit(0);
    }
}
run();
