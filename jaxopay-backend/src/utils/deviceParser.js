import UAParser from 'ua-parser-js';

export const parseUserAgent = (userAgent) => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  return {
    deviceName: `${result.device.vendor || ''} ${result.device.model || 'Unknown Device'}`.trim(),
    deviceType: result.device.type || 'desktop',
    os: `${result.os.name || 'Unknown'} ${result.os.version || ''}`.trim(),
    browser: `${result.browser.name || 'Unknown'} ${result.browser.version || ''}`.trim(),
  };
};

export const getDeviceInfo = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const deviceFingerprint = req.headers['x-device-fingerprint'] || '';
  const ipAddress = req.ip || req.connection.remoteAddress;

  return {
    userAgent,
    fingerprint: deviceFingerprint,
    ipAddress,
    ...parseUserAgent(userAgent),
  };
};

export default {
  parseUserAgent,
  getDeviceInfo,
};

