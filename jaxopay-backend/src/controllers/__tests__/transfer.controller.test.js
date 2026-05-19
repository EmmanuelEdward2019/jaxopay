import { getSpendableBalance } from '../transfer.controller.js';

describe('transfer controller balance handling', () => {
  test('uses wallet balance when legacy available_balance is zero and nothing is locked', () => {
    const spendable = getSpendableBalance({
      balance: '678.23000000',
      available_balance: '0.00000000',
      locked_balance: '0.00000000',
    });

    expect(spendable).toBeCloseTo(678.23);
  });

  test('respects available_balance when funds are locked', () => {
    const spendable = getSpendableBalance({
      balance: '678.23000000',
      available_balance: '128.23000000',
      locked_balance: '550.00000000',
    });

    expect(spendable).toBeCloseTo(128.23);
  });

  test('caps stale available_balance to the current wallet balance', () => {
    const spendable = getSpendableBalance({
      balance: '100.00000000',
      available_balance: '250.00000000',
      locked_balance: '0.00000000',
    });

    expect(spendable).toBeCloseTo(100);
  });
});
