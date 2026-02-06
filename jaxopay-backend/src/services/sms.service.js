import twilio from 'twilio';
import logger from '../utils/logger.js';

// Initialize Twilio client (lazy initialization)
let client = null;

const getClient = () => {
  if (!client && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    } catch (error) {
      logger.warn('Twilio SMS service not configured:', error.message);
      return null;
    }
  }
  return client;
};

// Send SMS function
export const sendSMS = async (to, message) => {
  try {
    const smsClient = getClient();

    if (!smsClient) {
      logger.warn('SMS service not configured - skipping SMS send');
      return { sid: 'sms-service-not-configured' };
    }

    const result = await smsClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    logger.info('SMS sent successfully:', {
      to,
      sid: result.sid,
      status: result.status,
    });

    return result;
  } catch (error) {
    logger.error('SMS sending failed:', {
      to,
      error: error.message,
    });
    throw error;
  }
};

// Send OTP via SMS
export const sendOTP = async (phone, otp) => {
  const message = `Your JAXOPAY verification code is: ${otp}. Valid for 5 minutes. Do not share this code with anyone.`;
  return sendSMS(phone, message);
};

export default {
  sendSMS,
  sendOTP,
};

