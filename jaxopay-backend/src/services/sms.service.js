import logger from '../utils/logger.js';

// Send SMS function (Mocked since Twilio is removed)
export const sendSMS = async (to, message) => {
  try {
    logger.info('SMS service is disabled. Mock SMS sent successfully:', {
      to,
      message,
    });

    return { sid: 'mock-sms-sid', status: 'delivered' };
  } catch (error) {
    logger.error('Mock SMS sending failed:', {
      to,
      error: error.message,
    });
    throw error;
  }
};

// Send OTP via SMS (Mocked)
export const sendOTP = async (phone, otp) => {
  const message = `Your JAXOPAY verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
  return sendSMS(phone, message);
};

export default {
  sendSMS,
  sendOTP,
};

