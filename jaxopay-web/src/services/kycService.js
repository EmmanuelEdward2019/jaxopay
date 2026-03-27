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

  submitDocument: async (documentData) => {
    try {
      const document_front_url = await fileToDataUrl(documentData.document_front);
      const payload = {
        document_type: documentData.document_type,
        document_number: documentData.document_number?.trim() ?? '',
        document_front_url,
      };
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
};

export default kycService;
