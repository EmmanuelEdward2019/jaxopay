import apiClient from '../lib/apiClient';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** apiClient returns the JSON body: { success, data?, message? } */
function unwrapData(raw) {
  if (raw == null || typeof raw !== 'object') return raw;
  return Object.prototype.hasOwnProperty.call(raw, 'data') ? raw.data : raw;
}

const kycService = {
  getKYCStatus: async () => {
    try {
      const raw = await apiClient.get('/kyc/status');
      return { success: raw?.success !== false, data: unwrapData(raw) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // document_front/document_back are only required for proof-of-address-style submissions (Tier
  // 3) — ID documents (nin/passport/etc, Tier 2) no longer collect a photo, so document_front may
  // be omitted for those and the backend stores a placeholder in its place.
  submitDocument: async (documentData) => {
    try {
      const payload = {
        document_type: documentData.document_type,
        document_number: documentData.document_number?.trim() ?? '',
      };
      if (documentData.document_front) {
        payload.document_front_url = await fileToDataUrl(documentData.document_front);
      }
      if (documentData.document_back) {
        payload.document_back_url = await fileToDataUrl(documentData.document_back);
      }
      if (documentData.selfie) {
        payload.selfie_url = await fileToDataUrl(documentData.selfie);
      }
      const raw = await apiClient.post('/kyc/submit', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,
      });
      return {
        success: raw?.success !== false,
        data: unwrapData(raw),
        message: raw?.message,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getDocuments: async () => {
    try {
      const raw = await apiClient.get('/kyc/documents');
      return { success: raw?.success !== false, data: unwrapData(raw) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getTierLimits: async () => {
    try {
      const raw = await apiClient.get('/kyc/tier-limits');
      return { success: raw?.success !== false, data: unwrapData(raw) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // target_tier is a plain integer (1, 2, or 3), not the 'tier_X' string form.
  requestUpgrade: async (targetTier) => {
    try {
      const raw = await apiClient.post('/kyc/upgrade', { target_tier: targetTier });
      return { success: raw?.success !== false, data: unwrapData(raw), message: raw?.message };
    } catch (error) {
      return { success: false, error: error?.response?.data?.message || error.message };
    }
  },

  getSmileConfig: async () => {
    try {
      const raw = await apiClient.get('/kyc/smile/config');
      return { success: raw?.success !== false, data: unwrapData(raw) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  submitSmileBiometric: async (payload) => {
    try {
      const raw = await apiClient.post('/kyc/smile/biometric-kyc', payload, {
        timeout: 600000,
      });
      return {
        success: raw?.success !== false,
        data: unwrapData(raw),
        message: raw?.message,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** Verify a BVN or NIN (required before crypto on/off-ramp). */
  verifyRampId: async (payload) => {
    try {
      const raw = await apiClient.post('/kyc/verify-id', payload);
      return { success: raw?.success !== false, data: unwrapData(raw), message: raw?.message };
    } catch (error) {
      return { success: false, error: error?.response?.data?.message || error.message };
    }
  },
};

export default kycService;
