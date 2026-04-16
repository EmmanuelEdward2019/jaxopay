import 'dotenv/config';
import quidax from './src/orchestration/adapters/crypto/QuidaxAdapter.js';

async function run() {
  try {
    console.log("Fetching XLR address from Quidax...");
    const res = await quidax.getDepositAddress('xlm', 'xlm');
    console.dir(res, { depth: null });
  } catch(e) {
    console.log("Quidax Request Failed");
    console.error(e);
  }
}
run();
