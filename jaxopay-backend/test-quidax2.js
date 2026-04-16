import 'dotenv/config';
import quidax from './src/orchestration/adapters/crypto/QuidaxAdapter.js';

async function run() {
  const coins = ['doge', 'ada', 'shib', 'sol', 'bnb', 'xrp'];
  for (const c of coins) {
      try {
        console.log(`\nFetching ${c.toUpperCase()} address from Quidax...`);
        const res = await quidax.getDepositAddress(c, c);
        console.dir(res, { depth: null });
      } catch(e) {
        console.log("Failed");
      }
  }
}
run();
