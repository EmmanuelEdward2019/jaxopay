import { AppError } from '../middleware/errorHandler.js';

export const DEFAULT_KORAPAY_BASE_URL = 'https://api.korapay.com/merchant/api/v1';
const KORAPAY_COUNTRY_BY_CURRENCY = {
    NGN: 'NG',
    KES: 'KE',
    ZAR: 'ZA',
    GHS: 'GH',
};

export function getKorapayBaseUrl() {
    return (process.env.KORAPAY_BASE_URL || DEFAULT_KORAPAY_BASE_URL).replace(/\/+$/, '');
}

export function getKorapaySecretKey() {
    const secret = process.env.KORAPAY_SECRET_KEY?.trim();
    if (!secret || secret.includes('your_')) {
        throw new AppError('Bank transfer service not configured', 503);
    }
    return secret;
}

export function getKorapayHeaders() {
    return {
        Authorization: `Bearer ${getKorapaySecretKey()}`,
        'Content-Type': 'application/json',
    };
}

export function getKorapayCountryCode(currency = 'NGN') {
    return KORAPAY_COUNTRY_BY_CURRENCY[currency.toUpperCase()] || 'NG';
}

export function getKorapayErrorDetails(error) {
    const raw = error?.response?.data || null;
    const message = raw?.message
        || raw?.response_description
        || (Array.isArray(raw?.errors) ? raw.errors.map((item) => item.message).filter(Boolean).join('; ') : null)
        || error?.message
        || 'Unknown Korapay error';

    return {
        statusCode: error?.response?.status || error?.statusCode || null,
        message,
        raw,
    };
}

export function isKorapayAuthError(error) {
    const { statusCode, message } = getKorapayErrorDetails(error);
    return [401, 403].includes(statusCode)
        || /not authorized|invalid authentication token|no authorization token|invalid authorization key/i.test(message);
}

export function isKorapayIpWhitelistError(error) {
    const { message } = getKorapayErrorDetails(error);
    return /whitelist.*ip|ip.*whitelist/i.test(message);
}

export function isKorapayChannelDisabledError(error) {
    const { message } = getKorapayErrorDetails(error);
    return /channel.*not.*enabled|not.*enabled.*channel/i.test(message);
}

export function getKorapayTransferFailureMessage(error, currency) {
    const { message } = getKorapayErrorDetails(error);

    if (isKorapayIpWhitelistError(error)) {
        return 'Bank transfers are temporarily unavailable while the payout server IP is being configured. Your funds have been returned.';
    }

    if (isKorapayAuthError(error)) {
        return 'Bank transfers are temporarily unavailable because Korapay did not authorize this payout request. Your funds have been returned.';
    }

    if (isKorapayChannelDisabledError(error)) {
        return `Bank transfers in ${currency} are not currently available. Your funds have been returned.`;
    }

    if (message) {
        return `Transfer failed: ${message}. Your funds have been returned.`;
    }

    return 'Transfer failed. Your funds have been returned. Please try again.';
}
