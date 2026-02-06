import { VALIDATION } from '../constants';

/**
 * Validate email address
 */
export const isValidEmail = (email) => {
  return VALIDATION.EMAIL.test(email);
};

/**
 * Validate phone number
 */
export const isValidPhone = (phone) => {
  return VALIDATION.PHONE.test(phone);
};

/**
 * Validate password strength
 */
export const isValidPassword = (password) => {
  if (password.length < VALIDATION.PASSWORD_MIN_LENGTH) {
    return { valid: false, message: `Password must be at least ${VALIDATION.PASSWORD_MIN_LENGTH} characters` };
  }
  
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  if (!hasNumbers) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  
  return { valid: true, message: 'Password is strong' };
};

/**
 * Validate amount
 */
export const isValidAmount = (amount, min = 0, max = Infinity) => {
  const numAmount = parseFloat(amount);
  
  if (isNaN(numAmount)) {
    return { valid: false, message: 'Invalid amount' };
  }
  
  if (numAmount <= min) {
    return { valid: false, message: `Amount must be greater than ${min}` };
  }
  
  if (numAmount > max) {
    return { valid: false, message: `Amount must not exceed ${max}` };
  }
  
  return { valid: true };
};

/**
 * Validate wallet address (basic validation)
 */
export const isValidWalletAddress = (address, type = 'ethereum') => {
  if (!address) return false;
  
  switch (type) {
    case 'ethereum':
    case 'usdt':
    case 'usdc':
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    case 'bitcoin':
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address) || /^bc1[a-z0-9]{39,59}$/.test(address);
    default:
      return address.length > 20;
  }
};

/**
 * Validate card number (Luhn algorithm)
 */
export const isValidCardNumber = (cardNumber) => {
  const cleaned = cardNumber.replace(/\s/g, '');
  
  if (!/^\d{13,19}$/.test(cleaned)) {
    return false;
  }
  
  let sum = 0;
  let isEven = false;
  
  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned.charAt(i), 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }
  
  return sum % 10 === 0;
};

/**
 * Validate CVV
 */
export const isValidCVV = (cvv) => {
  return /^\d{3,4}$/.test(cvv);
};

/**
 * Validate expiry date
 */
export const isValidExpiryDate = (month, year) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const expMonth = parseInt(month, 10);
  const expYear = parseInt(year, 10);
  
  if (expMonth < 1 || expMonth > 12) {
    return false;
  }
  
  if (expYear < currentYear) {
    return false;
  }
  
  if (expYear === currentYear && expMonth < currentMonth) {
    return false;
  }
  
  return true;
};

/**
 * Validate file type
 */
export const isValidFileType = (file, allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf']) => {
  return allowedTypes.includes(file.type);
};

/**
 * Validate file size (in MB)
 */
export const isValidFileSize = (file, maxSizeMB = 5) => {
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
};

