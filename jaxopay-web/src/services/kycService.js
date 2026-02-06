import apiClient from '../lib/apiClient';

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

  // Submit KYC document
  submitDocument: async (documentData) => {
    try {
      const formData = new FormData();
      formData.append('document_type', documentData.document_type);
      formData.append('document_number', documentData.document_number);
      if (documentData.document_front) {
        formData.append('document_front', documentData.document_front);
      }
      if (documentData.document_back) {
        formData.append('document_back', documentData.document_back);
      }
      if (documentData.selfie) {
        formData.append('selfie', documentData.selfie);
      }

      const response = await apiClient.post('/kyc/submit', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
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
};

export default kycService;

