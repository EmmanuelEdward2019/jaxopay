const toAmountNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const getSpendableBalance = (wallet) => {
  const balance = toAmountNumber(wallet?.balance);
  const availableBalance = wallet?.available_balance == null ? null : toAmountNumber(wallet.available_balance);
  const lockedBalance = toAmountNumber(wallet?.locked_balance);

  if (balance <= 0) return 0;

  if (lockedBalance > 0) {
    const unlockedBalance = availableBalance == null ? balance - lockedBalance : availableBalance;
    return Math.max(0, Math.min(unlockedBalance, balance));
  }

  // No active hold: `available_balance` is not authoritative here. Many credit/debit paths
  // (instant swaps, crypto ramps, gift cards, bill payments, card funding, etc.) update `balance`
  // without keeping `available_balance` in lockstep, so trusting a stale, lower `available_balance`
  // would wrongly cap what the user can actually withdraw (confirmed: a USDT->NGN swap correctly
  // credited `balance` to 3200 but left a stale `available_balance` of 160 behind, which then
  // capped the withdrawal screen at 160). `balance` is authoritative whenever nothing is locked.
  return balance;
};
