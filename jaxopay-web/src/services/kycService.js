import apiClient from '../lib/apiClient';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const kycService = {
  // Get KYC status
  getKYCStatus: async () => {
    try {
      const response = await apiClient.get('/kyc/status');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Submit KYC document (JSON with data URLs — server accepts https or data:image)
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
      const response = await apiClient.post('/kyc/submit', payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,
      });
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get KYC documents
  getDocuments: async () => {
    try {
      const response = await apiClient.get('/kyc/documents');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Get KYC tier limits
  getTierLimits: async () => {
    try {
      const response = await apiClient.get('/kyc/tier-limits');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /** Smile ID: safe flags only (configured, sandbox, biometric enabled) — no secrets */
  getSmileConfig: async () => {
    try {
      const response = await apiClient.get('/kyc/smile/config');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  /**
   * Biometric KYC + liveness (images from Smart Camera Web component).
   * @param {object} payload — country, id_type, id_number, first_name, last_name, dob?, images[]
   */
  submitSmileBiometric: async (payload) => {
    try {
      // Large JSON body (base64 images) + slow networks: allow up to 10 minutes
      const response = await apiClient.post('/kyc/smile/biometric-kyc', payload, {
        timeout: 600000,
      });
      return { success: true, data: response.data, message: response.message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
};

export default kycService;

