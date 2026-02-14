import { create } from 'zustand';
import { Account } from '../../types/account';

interface AccountState {
  accounts: Account[];
  loading: boolean;
  error: string | null;
  setAccounts: (accounts: Account[]) => void;
  addAccount: (account: Account) => void;
  updateAccount: (id: string, account: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * 账号状态管理
 */
export const useAccountStore = create<AccountState>((set) => ({
  accounts: [],
  loading: false,
  error: null,

  setAccounts: (accounts) => set({ accounts }),

  addAccount: (account) =>
    set((state) => ({
      accounts: [...state.accounts, account],
    })),

  updateAccount: (id, updatedAccount) =>
    set((state) => ({
      accounts: state.accounts.map((account) =>
        account.id === id ? { ...account, ...updatedAccount } : account
      ),
    })),

  removeAccount: (id) =>
    set((state) => ({
      accounts: state.accounts.filter((account) => account.id !== id),
    })),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),
}));
