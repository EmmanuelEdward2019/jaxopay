import { create } from 'zustand';
import walletService from '../services/walletService';
import transactionService from '../services/transactionService';

export const useWalletStore = create((set, get) => ({
  wallets: [],
  selectedWallet: null,
  transactions: [],
  isLoading: false,
  error: null,

  fetchWallets: async () => {
    set({ isLoading: true, error: null });

    const result = await walletService.getWallets();

    if (!result.success) {
      set({ error: result.error, isLoading: false });
      return { success: false, error: result.error };
    }

    // Handle both array response and object with wallets property
    const walletsData = Array.isArray(result.data) ? result.data : (result.data?.wallets || []);
    set({ wallets: walletsData, isLoading: false });
    return { success: true, data: result.data };
  },

  createWallet: async (currency, walletType = 'fiat') => {
    set({ isLoading: true, error: null });

    const result = await walletService.createWallet(currency, walletType);

    if (!result.success) {
      set({ error: result.error, isLoading: false });
      return { success: false, error: result.error };
    }

    // Refresh wallets after creating
    await get().fetchWallets();

    return { success: true, data: result.data };
  },

  transfer: async (fromWalletId, toWalletId, amount, description) => {
    set({ isLoading: true, error: null });

    const result = await walletService.transfer(fromWalletId, toWalletId, amount, description);

    if (!result.success) {
      set({ error: result.error, isLoading: false });
      return { success: false, error: result.error };
    }

    // Refresh wallets after transfer
    await get().fetchWallets();

    return { success: true, data: result.data };
  },

  selectWallet: (wallet) => set({ selectedWallet: wallet }),

  fetchTransactions: async (params = {}) => {
    set({ isLoading: true, error: null });

    const result = await transactionService.getTransactions(params);

    if (!result.success) {
      set({ error: result.error, isLoading: false });
      return { success: false, error: result.error };
    }

    // Handle both array response and object with transactions property
    const txData = result.data?.transactions || (Array.isArray(result.data) ? result.data : []);
    set({ transactions: txData, isLoading: false });
    return { success: true, data: result.data };
  },

  getWalletBalance: (currency) => {
    const wallet = get().wallets.find(w => w.currency === currency);
    return wallet ? wallet.balance : 0;
  },

  getTotalBalance: (baseCurrency = 'USD') => {
    // This would need exchange rate conversion in production
    const wallets = get().wallets;
    return wallets.reduce((total, wallet) => {
      // Simplified - in production, convert to base currency
      return total + parseFloat(wallet.balance || 0);
    }, 0);
  },

  clearError: () => set({ error: null }),
}));

