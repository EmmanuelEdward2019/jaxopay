/**
 * Unit Tests for Financial Utilities
 * Tests decimal.js precision and validation functions
 */

import {
  decimal,
  validateAmount,
  calculateFee,
  calculateTotalWithFee,
  formatForDB,
  formatForDisplay,
  convertCurrency,
  hasSufficientBalance,
  percentageChange,
  roundToCurrencyUnit,
} from '../financial.js';

describe('Financial Utilities', () => {
  
  describe('decimal()', () => {
    test('should create decimal from number', () => {
      const result = decimal(100.50);
      expect(result.toString()).toBe('100.5');
    });

    test('should create decimal from string', () => {
      const result = decimal('100.50');
      expect(result.toString()).toBe('100.5');
    });

    test('should handle precision correctly', () => {
      const result = decimal('0.1').plus('0.2');
      expect(result.toString()).toBe('0.3'); // Not 0.30000000000000004
    });

    test('should throw on invalid input', () => {
      expect(() => decimal('invalid')).toThrow('Invalid monetary value');
    });
  });

  describe('validateAmount()', () => {
    test('should validate amount within range', () => {
      const result = validateAmount(100, 1, 1000);
      expect(result.toString()).toBe('100');
    });

    test('should reject amount below minimum', () => {
      expect(() => validateAmount(0.5, 1, 1000)).toThrow('Amount must be at least 1');
    });

    test('should reject amount above maximum', () => {
      expect(() => validateAmount(2000, 1, 1000)).toThrow('Amount exceeds maximum limit');
    });

    test('should use default min and max', () => {
      const result = validateAmount(100);
      expect(result.toString()).toBe('100');
    });
  });

  describe('calculateFee()', () => {
    test('should calculate percentage fee', () => {
      const fee = calculateFee(100, { type: 'percentage', value: 1.5 });
      expect(fee.toString()).toBe('1.5');
    });

    test('should apply min fee cap', () => {
      const fee = calculateFee(10, { 
        type: 'percentage', 
        value: 1.5, 
        min_fee: 5 
      });
      expect(fee.toString()).toBe('5'); // 1.5% of 10 is 0.15, but min is 5
    });

    test('should apply max fee cap', () => {
      const fee = calculateFee(10000, { 
        type: 'percentage', 
        value: 5, 
        max_fee: 100 
      });
      expect(fee.toString()).toBe('100'); // 5% of 10000 is 500, but max is 100
    });

    test('should calculate fixed fee', () => {
      const fee = calculateFee(100, { type: 'fixed', value: 10 });
      expect(fee.toString()).toBe('10');
    });

    test('should handle tiered fees', () => {
      const config = {
        type: 'tiered',
        tiers: [
          { max: 100, fee: 1 },
          { max: 1000, fee: 5 },
          { max: Infinity, fee: 10 }
        ]
      };
      
      expect(calculateFee(50, config).toString()).toBe('1');
      expect(calculateFee(500, config).toString()).toBe('5');
      expect(calculateFee(5000, config).toString()).toBe('10');
    });

    test('should return zero for unknown fee type', () => {
      const fee = calculateFee(100, { type: 'unknown' });
      expect(fee.toString()).toBe('0');
    });
  });

  describe('calculateTotalWithFee()', () => {
    test('should calculate total with percentage fee', () => {
      const result = calculateTotalWithFee(100, { type: 'percentage', value: 1.5 });
      
      expect(result.amount.toString()).toBe('100');
      expect(result.fee.toString()).toBe('1.5');
      expect(result.total.toString()).toBe('101.5');
    });
  });

  describe('formatForDB()', () => {
    test('should format with 8 decimals', () => {
      const result = formatForDB(100.123456789);
      expect(result).toBe('100.12345679'); // Rounded to 8 decimals
    });

    test('should pad with zeros', () => {
      const result = formatForDB(100);
      expect(result).toBe('100.00000000');
    });
  });

  describe('formatForDisplay()', () => {
    test('should remove trailing zeros', () => {
      const result = formatForDisplay('100.50000000');
      expect(result).toBe('100.5');
    });

    test('should handle integer', () => {
      const result = formatForDisplay('100.00000000');
      expect(result).toBe('100');
    });

    test('should respect decimals parameter', () => {
      const result = formatForDisplay('100.123456', 2);
      expect(result).toBe('100.12');
    });
  });

  describe('convertCurrency()', () => {
    test('should convert currency using exchange rate', () => {
      const result = convertCurrency(100, 1.5);
      expect(result.toString()).toBe('150');
    });

    test('should handle decimal exchange rates', () => {
      const result = convertCurrency(100, 0.85);
      expect(result.toString()).toBe('85');
    });
  });

  describe('hasSufficientBalance()', () => {
    test('should return true when balance sufficient', () => {
      expect(hasSufficientBalance(100, 50)).toBe(true);
    });

    test('should return true when balance exactly matches', () => {
      expect(hasSufficientBalance(100, 100)).toBe(true);
    });

    test('should return false when balance insufficient', () => {
      expect(hasSufficientBalance(50, 100)).toBe(false);
    });

    test('should handle string inputs', () => {
      expect(hasSufficientBalance('100.50', '100.49')).toBe(true);
    });
  });

  describe('percentageChange()', () => {
    test('should calculate positive change', () => {
      const result = percentageChange(100, 150);
      expect(result.toString()).toBe('50');
    });

    test('should calculate negative change', () => {
      const result = percentageChange(100, 50);
      expect(result.toString()).toBe('-50');
    });

    test('should handle zero old value', () => {
      const result = percentageChange(0, 100);
      expect(result.toString()).toBe('100');
    });

    test('should handle both zero', () => {
      const result = percentageChange(0, 0);
      expect(result.toString()).toBe('0');
    });
  });

  describe('roundToCurrencyUnit()', () => {
    test('should round to nearest cent', () => {
      const result = roundToCurrencyUnit(100.126, 0.01);
      expect(result.toString()).toBe('100.13');
    });

    test('should round to nearest dollar', () => {
      const result = roundToCurrencyUnit(100.6, 1);
      expect(result.toString()).toBe('101');
    });

    test('should use default unit of 0.01', () => {
      const result = roundToCurrencyUnit(100.126);
      expect(result.toString()).toBe('100.13');
    });
  });

  describe('Precision Edge Cases', () => {
    test('floating point precision issue - 0.1 + 0.2', () => {
      const result = decimal('0.1').plus('0.2');
      expect(result.toString()).toBe('0.3');
      expect(parseFloat('0.1') + parseFloat('0.2')).not.toBe(0.3); // Proof of issue
    });

    test('large number precision', () => {
      const result = decimal('999999999.99999999').plus('0.00000001');
      expect(result.toString()).toBe('1000000000');
    });

    test('very small number precision', () => {
      const result = decimal('0.00000001').times('100000000');
      expect(result.toString()).toBe('1');
    });

    test('division precision', () => {
      const result = decimal('10').dividedBy('3');
      expect(result.toFixed(8)).toBe('3.33333333');
    });
  });
});

