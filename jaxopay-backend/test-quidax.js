import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const QUIDAX_API_KEY = process.env.QUIDAX_API_KEY;
const QUIDAX_BASE_URL = process.env.QUIDAX_BASE_URL || 'https://api.quidax.com/v1';

async function test() {
  try {
    console.log(`Using base URL: ${QUIDAX_BASE_URL}`);
    console.log(`Testing GET /users/me/wallets/ngn...`);
    const walletRes = await axios.get(`${QUIDAX_BASE_URL}/users/me/wallets/ngn`, {
      headers: { Authorization: `Bearer ${QUIDAX_API_KEY}` }
    });
    console.log("Master NGN Wallet Response:");
    console.log(JSON.stringify(walletRes.data, null, 2));

    console.log(`\nTesting GET /users/me/wallets/ngn/addresses...`);
    const addrRes = await axios.get(`${QUIDAX_BASE_URL}/users/me/wallets/ngn/addresses`, {
      headers: { Authorization: `Bearer ${QUIDAX_API_KEY}` }
    });
    console.log("Master NGN Addresses Response:");
    console.log(JSON.stringify(addrRes.data, null, 2));

  } catch (err) {
    console.error("API Error:", err.response?.data || err.message);
  }
}

test();
