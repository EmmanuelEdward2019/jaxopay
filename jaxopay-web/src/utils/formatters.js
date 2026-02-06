import { format } from 'date-fns';
import { ALL_CURRENCIES } from '../constants';

/**
 * Format currency amount with symbol
 */
export const formatCurrency = (amount, currencyCode, showSymbol = true) => {
  const currency = ALL_CURRENCIES.find(c => c.code === currencyCode);
  const symbol = currency?.symbol || currencyCode;

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(amount || 0);

  return showSymbol ? `${symbol}${formatted}` : formatted;
};

/**
 * Format number with commas
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('en-US').format(num);
};

/**
 * Format date
 */
export const formatDate = (date, formatString = 'MMM dd, yyyy') => {
  if (!date) return '';
  return format(new Date(date), formatString);
};

/**
 * Format date with time
 */
export const formatDateTime = (date) => {
  if (!date) return '';
  return format(new Date(date), 'MMM dd, yyyy HH:mm');
};

/**
 * Format transaction reference
 */
export const formatTransactionRef = (ref) => {
  if (!ref) return '';
  return ref.toUpperCase();
};

/**
 * Format phone number
 */
export const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  // Simple formatting - can be enhanced based on country
  return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
};

/**
 * Truncate text
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.substring(0, maxLength)}...`;
};

/**
 * Truncate wallet address
 */
export const truncateAddress = (address, startChars = 6, endChars = 4) => {
  if (!address) return '';
  if (address.length <= startChars + endChars) return address;
  return `${address.substring(0, startChars)}...${address.substring(address.length - endChars)}`;
};

/**
 * Format percentage
 */
export const formatPercentage = (value, decimals = 2) => {
  return `${parseFloat(value || 0).toFixed(decimals)}%`;
};

/**
 * Get transaction status color
 */
export const getStatusColor = (status) => {
  const colors = {
    pending: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20',
    processing: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
    completed: 'text-green-600 bg-green-100 dark:bg-green-900/20',
    failed: 'text-red-600 bg-red-100 dark:bg-red-900/20',
    cancelled: 'text-gray-600 bg-gray-100 dark:bg-gray-900/20',
    reversed: 'text-purple-600 bg-purple-100 dark:bg-purple-900/20',
  };
  return colors[status] || colors.pending;
};

/**
 * Get KYC tier badge color
 */
export const getKYCTierColor = (tier) => {
  const colors = {
    tier_0: 'text-gray-600 bg-gray-100 dark:bg-gray-900/20',
    tier_1: 'text-blue-600 bg-blue-100 dark:bg-blue-900/20',
    tier_2: 'text-green-600 bg-green-100 dark:bg-green-900/20',
  };
  return colors[tier] || colors.tier_0;
};

/**
 * Format file size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Capitalize first letter
 */
export const capitalize = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Format transaction type for display
 */
export const formatTransactionType = (type) => {
  if (!type) return '';
  return type.split('_').map(capitalize).join(' ');
};

