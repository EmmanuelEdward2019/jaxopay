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

  if (availableBalance == null || availableBalance <= 0) {
    return balance;
  }

  return Math.max(0, Math.min(availableBalance, balance));
};
