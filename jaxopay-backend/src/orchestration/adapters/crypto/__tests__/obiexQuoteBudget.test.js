import { jest } from '@jest/globals';
import obiex from '../ObiexAdapter.js';

/**
 * Obiex disabled this API key on 2026-07-23 for exceeding the documented 100 requests/hour on
 * POST /trades/quote — their only price source (there is no ticker endpoint). These tests pin the
 * ceiling that makes re-enabling the rate display safe, so a future change to any *caller* can't
 * quietly reintroduce the problem: the guarantee lives in the adapter, not in the callers.
 */
describe('Obiex quote-call budget', () => {
  beforeEach(() => {
    obiex._quoteCallLog = [];
    obiex._cache.clear();
    obiex._quoteBudgetPerHour = 100;
    obiex._quotePriceBudget = 40;
  });

  test('counts quote calls over a rolling hour and drops calls older than that', () => {
    const now = Date.now();
    obiex._quoteCallLog = [
      now - 61 * 60 * 1000, // an hour and a bit ago — must not count
      now - 59 * 60 * 1000,
      now - 60 * 1000,
    ];
    expect(obiex._quoteCallsLastHour()).toBe(2);
  });

  test('display lookups are cut off at the price budget, leaving the rest for trading', () => {
    obiex._quoteCallLog = Array(39).fill(Date.now());
    expect(obiex._canSpendPriceQuote()).toBe(true);
    obiex._quoteCallLog.push(Date.now()); // 40th
    expect(obiex._canSpendPriceQuote()).toBe(false);
    // Still 60 of the hour's 100 left — reserved for real customer swaps, which never consult
    // this guard at all.
    expect(obiex.getQuoteBudgetState()).toMatchObject({
      used_last_hour: 40,
      budget_per_hour: 100,
      price_lookup_budget: 40,
      price_lookups_allowed: false,
    });
  });

  test('getExchangeRate serves a stale rate rather than calling once the budget is spent', async () => {
    const spy = jest.spyOn(obiex, 'getSwapQuote');
    // A previously-fetched rate, now well past its TTL.
    obiex._cache.set('rate:BTC:NGN', { data: 98000000, timestamp: Date.now() - 60 * 60 * 1000 });
    obiex._quoteCallLog = Array(40).fill(Date.now());

    const rate = await obiex.getExchangeRate('BTC', 'NGN');

    // Stale beats null: several callers treat null as "can't price this", and in kycLimits that
    // means skipping a withdrawal limit check entirely.
    expect(rate).toBe(98000000);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('a cache hit inside the TTL costs no quote call at all', async () => {
    const spy = jest.spyOn(obiex, 'getSwapQuote');
    obiex._cache.set('rate:USDT:NGN', { data: 1395, timestamp: Date.now() });

    expect(await obiex.getExchangeRate('USDT', 'NGN')).toBe(1395);
    expect(spy).not.toHaveBeenCalled();
    expect(obiex._quoteCallsLastHour()).toBe(0);
    spy.mockRestore();
  });

  test('an identical from/to never reaches the API', async () => {
    const spy = jest.spyOn(obiex, 'getSwapQuote');
    expect(await obiex.getExchangeRate('USDT', 'USDT')).toBe(1);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('the rate cache TTL is long enough that display paths are not one call each', () => {
    // A 5-second TTL (the old value) meant nearly every ticker/stats/limit lookup was a miss, so
    // the budget was being spent by paths that have nothing to do with trading.
    expect(obiex._cacheTTL.rates).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});
