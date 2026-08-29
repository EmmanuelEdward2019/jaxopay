import { create } from 'zustand';

// The KYC error codes the backend returns (403) from money endpoints. Handled globally by
// apiClient.js's response interceptor -> this store -> <KycGateModal/>. Mirrors RN's
// useKycGateStore.ts exactly, so both platforms react to the same backend codes the same way —
// web previously had no equivalent at all, so every one of these fell through to generic red
// error text with no CTA back to the KYC page.
export const KYC_GATE_CODES = ['KYC_TIER_REQUIRED', 'KYC_TIER_PENDING', 'BVN_NIN_REQUIRED', 'BVN_NIN_PENDING', 'LIMIT_EXCEEDED'];

export const isKycGateCode = (code) => !!code && KYC_GATE_CODES.includes(code);

export const useKycGateStore = create((set) => ({
  visible: false,
  code: null,
  // The backend message (user-ready; e.g. LIMIT_EXCEEDED carries limit + remaining).
  message: null,

  show: (code, message) => set({ visible: true, code, message: message || null }),
  hide: () => set({ visible: false, code: null, message: null }),
}));
