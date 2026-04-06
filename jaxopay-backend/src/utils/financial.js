import Decimal from 'decimal.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * Financial Utilities
 * Handles all money-related calculations with proper precision
 * Uses decimal.js to avoid floating point errors
 */

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20, // Match database DECIMAL(20, 8)
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 9,
});

/**
 * Create a Decimal from any number/string
 */
export function decimal(value) {
  try {
    return new Decimal(value);
  } catch (error) {
    throw new AppError(`Invalid monetary value: ${value}`, 400);
  }
}

/**
 * Validate amount is positive and within reasonable bounds
 */
export function validateAmount(amount, minAmount = 0.01, maxAmount = 1000000000) {
  const value = decimal(amount);

  if (value.lessThan(minAmount)) {
    throw new AppError(`Amount must be at least ${minAmount}`, 400);
  }

  if (value.greaterThan(maxAmount)) {
    throw new AppError(`Amount exceeds maximum limit of ${maxAmount}`, 400);
  }

  return value;
}

/**
 * Calculate fee based on amount and fee configuration
 */
export function calculateFee(amount, feeConfig) {
  const amountDecimal = decimal(amount);

  if (feeConfig.type === 'percentage') {
    const feePercent = decimal(feeConfig.value).dividedBy(100);
    let fee = amountDecimal.times(feePercent);

    // Apply min/max fee caps if configured
    if (feeConfig.min_fee) {
      fee = Decimal.max(fee, decimal(feeConfig.min_fee));
    }
    if (feeConfig.max_fee) {
      fee = Decimal.min(fee, decimal(feeConfig.max_fee));
    }

    return fee;
  }

  if (feeConfig.type === 'fixed') {
    return decimal(feeConfig.value);
  }

  // Tiered fee structure
  if (feeConfig.type === 'tiered') {
    const tiers = feeConfig.tiers || [];
    for (const tier of tiers) {
      if (amountDecimal.lessThanOrEqualTo(tier.max || Infinity)) {
        return decimal(tier.fee);
      }
    }
  }

  return decimal(0);
}

/**
 * Calculate total with fee
 */
export function calculateTotalWithFee(amount, feeConfig) {
  const amountDecimal = decimal(amount);
  const fee = calculateFee(amount, feeConfig);
  return {
    amount: amountDecimal,
    fee: fee,
    total: amountDecimal.plus(fee),
  };
}

/**
 * Format amount for database storage (string with 8 decimal places)
 */
export function formatForDB(amount) {
  return decimal(amount).toFixed(8);
}

/**
 * Format amount for display (remove trailing zeros, max 8 decimals)
 */
export function formatForDisplay(amount, decimals = 8) {
  return decimal(amount).toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Convert between currencies using exchange rate
 */
export function convertCurrency(amount, exchangeRate) {
  return decimal(amount).times(decimal(exchangeRate));
}

/**
 * Check if wallet has sufficient balance
 */
export function hasSufficientBalance(walletBalance, requiredAmount) {
  return decimal(walletBalance).greaterThanOrEqualTo(decimal(requiredAmount));
}

/**
 * Calculate percentage change between two amounts
 */
export function percentageChange(oldValue, newValue) {
  const oldDecimal = decimal(oldValue);
  const newDecimal = decimal(newValue);

  if (oldDecimal.isZero()) {
    return newDecimal.isZero() ? decimal(0) : decimal(100);
  }

  return newDecimal
    .minus(oldDecimal)
    .dividedBy(oldDecimal)
    .times(100);
}

/**
 * Round to nearest currency unit (e.g., 0.01 for USD)
 */
export function roundToCurrencyUnit(amount, unit = 0.01) {
  const unitDecimal = decimal(unit);
  return decimal(amount)
    .dividedBy(unitDecimal)
    .toDecimalPlaces(0)
    .times(unitDecimal);
}

export default {
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
  Decimal,
};

